// app.ts —— 接入真实后端版：启动时做登录拦截（无 token → 直接进登录页）。
import { getToken } from './utils/auth'

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
    // 登录拦截：没有 token 直接 reLaunch 到登录页（登录页不是 tab）。
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
    }
    // 有 token 则正常进入 tab 首页（由 app.json 的 pages[0] 决定）。
  }
})
