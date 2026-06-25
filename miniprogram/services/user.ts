// services/user.ts —— 用户 / 鉴权接口
import request from '../utils/request'
import type { LoginReply, DataReply, UserInfo, BaseReply } from './types'

/**
 * 账号密码登录。成功后返回 { token, data: UserInfo }。
 * 调用方负责 setToken(token) + setUserInfo(data)。
 * 公开接口（无需 token）。
 */
export function login(
  account: string,
  password: string
): Promise<LoginReply> {
  return request<LoginReply>({
    url: '/api/v1/user/login',
    method: 'POST',
    data: { account, password }
  })
}

/**
 * 微信一键登录（openid 版）。wx.login 拿到的 code 传后端：
 * 后端 code2session 换 openid，库里有该 openid 则登录、没有则自动注册（随机账号），
 * 统一返回 { token, data: UserInfo }。公开接口（无需 token）。
 */
export function loginWx(code: string): Promise<LoginReply> {
  return request<LoginReply>({
    url: '/api/v1/user/login/wx',
    method: 'POST',
    data: { code }
  })
}

/** 微信注册新账号（openid 自动注册随机账号）。code 为新的 wx.login code。公开接口。 */
export function registerWx(code: string): Promise<LoginReply> {
  return request<LoginReply>({
    url: '/api/v1/user/register/wx',
    method: 'POST',
    data: { code }
  })
}

/**
 * 微信关联已有账号：验证账号密码后，把当前微信 openid 绑到该账号并登录。
 * code 为新的 wx.login code（每次后端调用都要新 code）。公开接口。
 */
export function bindWx(
  code: string,
  account: string,
  password: string
): Promise<LoginReply> {
  return request<LoginReply>({
    url: '/api/v1/user/login/wx/bind',
    method: 'POST',
    data: { code, account, password }
  })
}

/** 获取用户详情。需要 token。 */
export function getUser(id: number): Promise<UserInfo> {
  return request<DataReply<UserInfo>>({
    url: '/api/v1/user/' + id,
    method: 'GET'
  }).then((res) => res.data)
}

/** 更新用户信息（body 形如 { data: UserInfo }）。需要 token。 */
export function updateUser(id: number, info: UserInfo): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/user/' + id,
    method: 'PUT',
    data: { data: info }
  }).then(() => undefined)
}

/**
 * 首次设置账号密码：微信自动注册(随机 wx_ 账号 + 占位密码)的用户专用，
 * 把随机账号换成自定义账号并设置真实密码。后端仅在占位态放行、且账号锁成"已改"，
 * 故仅可设置一次。需要 token。成功后调用方应刷新本地缓存的 account。
 */
export function setupCredentials(
  account: string,
  password: string
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/user/setup-credentials',
    method: 'POST',
    data: { account, password }
  }).then(() => undefined)
}
