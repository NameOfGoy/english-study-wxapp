// app.ts —— 接入真实后端版：启动时静默确保有 token（游客只读 / 真实登录），不强制跳登录。
import { ensureToken } from './utils/request'

interface IAppOption {
  globalData: {
    /** mock 开关：接入真实后端后置 false，数据全部走 services/*。 */
    useMock: boolean
    /** 应用名（占位用） */
    appName: string
  }
}

App<IAppOption>({
  globalData: {
    useMock: false,
    appName: '单词记忆助手'
  },
  onLaunch() {
    // 不再强制跳登录：静默确保有一个可用 token——
    //   已注册的微信用户 → 真实登录 token；未注册 → 后端发"游客"只读 token。
    // 让用户一进来就落到首页 tab 浏览体验，写操作时再由后端守卫 + 前端引导登录。
    ensureToken()
  }
})
