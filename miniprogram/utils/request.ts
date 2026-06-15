// utils/request.ts —— wx.request 的 Promise 封装（全应用唯一请求入口）
//
// 职责：
//   1. 自动给 url 拼 apiBaseUrl 前缀（path 自带 /api/v1）。
//   2. 自动从 storage 取 token，带上 Authorization: Bearer <token>（有 token 时）。
//   3. 默认 Content-Type: application/json。
//   4. 响应统一处理：
//      - HTTP 401（裸 401，body 非业务包装）→ 清 token + reLaunch 登录页 + reject。
//      - 业务包装：code===0 → resolve(整个 body)，调用方自取 .data / .token。
//      - code!==0 → showToast(message) + reject(Error(message))。
//      - 网络失败 → showToast + reject。
//
// 约定：泛型 T 是「整个响应 body」的类型（如 DataReply<Foo> / LoginReply / PageReply<Bar>），
//   不是 data 字段类型。调用方拿到 body 后自行 .data / .token。

import config from '../config/index'
import { getToken, clearToken } from './auth'
import type { BaseReply } from '../services/types'

/** 登录页路径（401 失效时 reLaunch 目标） */
const LOGIN_PAGE = '/pages/login/login'

/** request 入参（在 wx.request 基础上收窄，url 为不含 host 的相对路径如 /api/v1/xxx） */
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

/** 标记 401 失效（避免并发请求重复 reLaunch） */
let redirectingToLogin = false

function gotoLogin(): void {
  clearToken()
  if (redirectingToLogin) {
    return
  }
  redirectingToLogin = true
  wx.reLaunch({
    url: LOGIN_PAGE,
    complete: () => {
      redirectingToLogin = false
    }
  })
}

/**
 * 发起请求。泛型 T = 整个响应 body 类型。
 * 成功（code===0）resolve(body)；其余情况已 toast 并 reject。
 */
export function request<T extends BaseReply>(options: RequestOptions): Promise<T> {
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
        // 1. 裸 HTTP 401：JWT 失效，body 不是业务包装。
        if (res.statusCode === 401) {
          gotoLogin()
          reject(new Error('登录已失效，请重新登录'))
          return
        }

        // 2. 非 2xx 的其它 HTTP 错误（理论上后端恒 200，这里兜底）。
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = '请求失败(' + res.statusCode + ')'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }

        // 3. 业务包装：依据 code 区分成功/失败。
        const body = res.data as T
        if (!body || typeof body.code !== 'number') {
          const msg = '响应格式异常'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
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
