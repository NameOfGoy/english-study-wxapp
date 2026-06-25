// config/index.ts —— 全局唯一配置处（所有 host/base 都从这里取，禁止散落到各处）
//
// 统一走线上 https 域名：备案 + 证书 + 公众平台「服务器域名」白名单均已就绪，
// 开发 / 体验 / 正式三个环境一律使用域名，开发者工具不再需要勾「不校验合法域名」。
//
// 字段含义：
//   - apiBaseUrl：REST 接口基址。所有 service 路径自带 /api/v1 前缀，request.ts 只负责拼前缀。
//   - resourceBaseUrl：图片/音频/头像等静态资源(/api/v1/file/{bucket}/{object})的 host。
//   新服务器 nginx 既反代 REST(/api/v1/*) 也反代文件(/api/v1/file/...)，故 api 与 resource 同 host。
//
// 如需临时直连 IP 本地后端调试：把 HOST 改成 'http://1.14.238.24'，
//   并在 DevTools「详情 → 本地设置」勾「不校验合法域名」。上线/提审前务必改回域名。

export interface AppConfig {
  /** REST 接口基址（不含 /api/v1，由各 service 的路径自带） */
  apiBaseUrl: string
  /** 静态资源(图片/音频/头像)host，配合 utils/asset.ts 的 resolveAsset 使用 */
  resourceBaseUrl: string
}

/** 线上 https 域名：开发/体验/正式统一使用（已备案 + 证书 + 服务器域名白名单就绪） */
const HOST = 'https://englishstudy.junnie.cn'

const config: AppConfig = {
  apiBaseUrl: HOST,
  resourceBaseUrl: HOST
}

export default config
