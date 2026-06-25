// utils/request.ts —— wx.request 的 Promise 封装（全应用唯一请求入口）
//
// 职责：
//   1. 自动给 url 拼 apiBaseUrl 前缀（path 自带 /api/v1）。
//   2. 会话引导：无 token 时先静默换一个 token（ensureToken）——
//      已注册微信用户拿真实 token，未注册拿后端发的"游客"只读 token。
//      这样用户一进小程序就能浏览体验，不会被强制登录（满足微信审核"先体验后授权"）。
//   3. 自动带 Authorization: Bearer <token>（有 token 时）。
//   4. 响应统一处理：
//      - HTTP 401（token 失效/过期）→ 清 token + reject（**不再强跳登录页**，下次请求自动重新换 token）。
//      - 业务 code===0 → resolve(整个 body)。
//      - 业务 code===GUEST_FORBIDDEN_CODE → 游客写操作被后端守卫拦下 → 弹"登录后使用"引导，不当普通错误。
//      - 其它 code!==0 → showToast(message) + reject。
//      - 网络失败 → showToast + reject。
//
// 约定：泛型 T 是「整个响应 body」的类型（如 DataReply<Foo> / LoginReply / PageReply<Bar>）。

import config from '../config/index'
import { getToken, setToken, setUserInfo, clearToken } from './auth'
import type { BaseReply, LoginReply } from '../services/types'

/** 微信登录换 token 的接口路径（ensureToken 直接裸调，不走 service 以避免循环依赖） */
const LOGIN_WX_URL = '/api/v1/user/login/wx'

/** 游客只读身份尝试写操作时，后端守卫返回的业务码（与后端 middleware.GuestForbiddenCode 一致） */
const GUEST_FORBIDDEN_CODE = 40300

/** 登录/注册族接口：这些无需先 ensureToken（它们本身就是拿 token 的入口），也不该被游客守卫拦 */
function isAuthUrl(url: string): boolean {
  return url.indexOf('/user/login') >= 0 || url.indexOf('/user/register') >= 0
}

// ===================== 会话引导 ensureToken =====================
// 无 token 时静默换一个可用 token：wx.login → 后端 /login/wx。
//   - 已注册的微信用户 → 真实登录 token
//   - 未注册 → 后端发"游客"只读 token（role=guest，只能 GET）
// 全程静默（不弹授权框、不跳登录页），失败也不抛给调用方——页面自行退化空态。
// 用 acquiring 做并发去重：多页 onShow 同时触发只发一次。

let acquiring: Promise<void> | null = null

export function ensureToken(): Promise<void> {
  if (getToken()) {
    return Promise.resolve()
  }
  if (acquiring) {
    return acquiring
  }
  acquiring = new Promise<void>((resolve) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          resolve()
          return
        }
        wx.request({
          url: config.apiBaseUrl + LOGIN_WX_URL,
          method: 'POST',
          data: { code: res.code },
          header: { 'Content-Type': 'application/json' },
          dataType: 'json',
          success: (r) => {
            const body = r.data as LoginReply
            if (r.statusCode === 200 && body && body.code === 0 && body.token) {
              setToken(body.token)
              setUserInfo(body.data)
            }
            resolve()
          },
          fail: () => resolve()
        })
      },
      fail: () => resolve()
    })
  })
  const clear = () => {
    acquiring = null
  }
  acquiring.then(clear, clear)
  return acquiring
}

// ===================== 游客写操作引导登录 =====================
let promptingLogin = false

function promptGuestLogin(): void {
  if (promptingLogin) {
    return
  }
  promptingLogin = true
  wx.showModal({
    title: '需要登录',
    content: '该功能需登录后使用，是否前往登录？',
    confirmText: '去登录',
    cancelText: '再逛逛',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({ url: '/pages/login/login?from=guest' })
      }
    },
    complete: () => {
      promptingLogin = false
    }
  })
}

/** request 入参（url 为不含 host 的相对路径如 /api/v1/xxx） */
export interface RequestOptions {
  /** 相对路径，自带 /api/v1 前缀（host 由 request 自动补全） */
  url: string
  /** HTTP 方法，默认 GET */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 请求体 / query 参数对象 */
  data?: WechatMiniprogram.IAnyObject
  /** 额外 header（会与默认 header 合并） */
  header?: WechatMiniprogram.IAnyObject
  /** 超时毫秒，默认走 wx 默认 */
  timeout?: number
}

/**
 * 发起请求。泛型 T = 整个响应 body 类型。
 * 成功（code===0）resolve(body)；其余情况已 toast / 引导后 reject。
 */
export async function request<T extends BaseReply>(options: RequestOptions): Promise<T> {
  // 无 token 且非登录族接口 → 先静默换一个（游客/真实）token，保证带 Authorization 出去
  if (!getToken() && !isAuthUrl(options.url)) {
    await ensureToken()
  }

  const token = getToken()
  const header: WechatMiniprogram.IAnyObject = {
    'Content-Type': 'application/json',
    ...(options.header || {})
  }
  if (token) {
    header.Authorization = 'Bearer ' + token
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: config.apiBaseUrl + options.url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout,
      dataType: 'json',
      success: (res) => {
        // 1. HTTP 401：token 失效/过期。清掉 token + reject，**不再强跳登录页**——
        //    下次请求会自动 ensureToken 重新换（已注册→真实 token；未注册→游客 token），不打断浏览。
        if (res.statusCode === 401) {
          clearToken()
          reject(new Error('登录已失效'))
          return
        }

        // 2. 非 2xx 的其它 HTTP 错误（理论上后端恒 200，这里兜底）。
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = '请求失败(' + res.statusCode + ')'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }

        // 3. 业务包装：依据 code 区分。
        const body = res.data as T
        if (!body || typeof body.code !== 'number') {
          const msg = '响应格式异常'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }
        // 3a. 游客只读身份尝试写操作 → 引导登录，不当普通错误 toast
        if (body.code === GUEST_FORBIDDEN_CODE) {
          promptGuestLogin()
          reject(new Error('guest_forbidden'))
          return
        }
        if (body.code === 0) {
          resolve(body)
          return
        }
        const msg = body.message || '请求出错'
        wx.showToast({ title: msg, icon: 'none' })
        reject(new Error(msg))
      },
      fail: (err) => {
        const msg = '网络异常，请稍后重试'
        wx.showToast({ title: msg, icon: 'none' })
        reject(new Error(err && err.errMsg ? err.errMsg : msg))
      }
    })
  })
}

export default request
