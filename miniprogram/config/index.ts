// config/index.ts —— 全局唯一配置处（所有 host/base 都从这里取，禁止散落到各处）
//
// 【调试期】当前用纯 IP 直连后端（http://193.112.111.2:13896）。
//   - apiBaseUrl：REST 接口的基址。所有 service 请求路径都自带 /api/v1 前缀，
//     request.ts 只负责把这里的 apiBaseUrl 拼到路径前面。
//   - resourceBaseUrl：图片/音频/头像等静态资源(/api/v1/file/{bucket}/{object})的 host。
//
// 【资源 host 说明】图片/音频(/api/v1/file/...)由服务器 nginx(80端口)反代到 MinIO，
//   后端 13896 端口本身不提供文件服务(会 404)。所以：
//   - apiBaseUrl 用 :13896（后端 REST）；
//   - resourceBaseUrl 用 http://193.112.111.2（80端口 nginx，实测 /api/v1/file 返回 200 image/jpeg）。
//   模拟器需勾「不校验合法域名」才能加载 http 资源；加载失败时页面回退 emoji 占位(.placeholder-img)。
//
// 【备案上线后】拿到 https 域名后，只改下面这两行即可（其余代码无需改动）：
//   - 把 apiBaseUrl 改成 https 后端域名；
//   - 把 resourceBaseUrl 改成 nginx 暴露静态资源的 https 域名。
//   并记得在微信公众平台「开发设置 → 服务器域名」里把这两个域名加入
//   request 合法域名 / downloadFile 合法域名。

export interface AppConfig {
  /** REST 接口基址（不含 /api/v1，由各 service 的路径自带） */
  apiBaseUrl: string
  /** 静态资源(图片/音频/头像)host，配合 utils/asset.ts 的 resolveAsset 使用 */
  resourceBaseUrl: string
}

const config: AppConfig = {
  apiBaseUrl: 'http://193.112.111.2:13896',
  resourceBaseUrl: 'http://193.112.111.2'
}

export default config
