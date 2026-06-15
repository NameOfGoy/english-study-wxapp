// utils/auth.ts —— token / 当前用户信息的本地存取（同步 storage）
// storage key 统一在这里定义，禁止在别处硬编码字符串。

import type { UserInfo } from '../services/types'

const TOKEN_KEY = 'token'
const USER_INFO_KEY = 'user_info'

/** 写入 JWT token（登录成功后调用） */
export function setToken(token: string): void {
  wx.setStorageSync(TOKEN_KEY, token)
}

/** 读取 JWT token；无则返回 ''（request.ts 据此决定是否带 Authorization） */
export function getToken(): string {
  return wx.getStorageSync<string>(TOKEN_KEY) || ''
}

/** 清除 token（登出 / 401 失效时调用） */
export function clearToken(): void {
  wx.removeStorageSync(TOKEN_KEY)
}

/** 缓存当前登录用户信息 */
export function setUserInfo(info: UserInfo): void {
  wx.setStorageSync(USER_INFO_KEY, info)
}

/** 读取当前登录用户信息；无则返回 null */
export function getUserInfo(): UserInfo | null {
  const info = wx.getStorageSync<UserInfo>(USER_INFO_KEY)
  return info || null
}

/** 清除用户信息缓存 */
export function clearUserInfo(): void {
  wx.removeStorageSync(USER_INFO_KEY)
}

/** 是否已登录（仅判断 token 是否存在） */
export function isLogin(): boolean {
  return !!getToken()
}

/**
 * 当前用户角色码（0=普通，1=超管）。
 * 从缓存的 UserInfo.role 取；未登录 / 无缓存 / 无 role 字段时返回 0（按普通用户兜底）。
 * 仅供 UI 显隐用（如"系统标签"开关、AI 辅助入口）；真鉴权在服务端二次校验。
 */
export function getRole(): number {
  const info = getUserInfo()
  return info && typeof info.role === 'number' ? info.role : 0
}

/** 当前用户是否超管（role===1）。等价于 getRole() === 1。 */
export function isAdmin(): boolean {
  return getRole() === 1
}
