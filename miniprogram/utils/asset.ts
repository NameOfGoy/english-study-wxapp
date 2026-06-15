// utils/asset.ts —— 静态资源相对路径 → 可访问完整 URL
// 后端返回的图片/音频/头像都是相对路径，如 /api/v1/file/{bucket}/{object}。
// 渲染前统一过一遍 resolveAsset，拼上 resourceBaseUrl。
//
// 用法：<image src="{{ resolveAsset(item.avatar) }}" /> 这种 WXML 无法直接调函数，
//   所以在页面 .ts 里 map 数据时调用：item.avatarUrl = resolveAsset(item.avatar)。
//
// 注意：纯 IP 直连后端调试期，资源大概率取不到（见 config/index.ts 注释），
//   <image>/<audio> 加载失败时页面应回退到 emoji 占位（.placeholder-img）。

import config from '../config/index'

/**
 * 把后端相对资源路径转成完整可访问 URL。
 * - 空 / undefined → 返回 ''（调用方据此走 emoji 占位）
 * - 已是 http/https 绝对地址 → 原样返回
 * - 其余 → resourceBaseUrl + 规范化后的 path（确保有且仅有一个前导 /）
 */
export function resolveAsset(path?: string): string {
  if (!path) {
    return ''
  }
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalized = path.startsWith('/') ? path : '/' + path
  return config.resourceBaseUrl + normalized
}
