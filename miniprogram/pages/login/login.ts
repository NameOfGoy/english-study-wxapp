// login.ts —— 微信登录页（自动微信登录 + 未关联弹层选关联/注册 + 账号登录兜底）
// 走真实 service：loginWx / registerWx / bindWx / login → auth.setToken/setUserInfo → switchTab 进首页。
// request 层失败已统一 toast(message)，这里只对 wx.login 授权失败自行 toast，API 错误不重复提示。
import { login, loginWx, registerWx, bindWx } from '../../services/user'
import { setToken, setUserInfo } from '../../utils/auth'
import type { LoginReply } from '../../services/types'

/** 页面状态机：
 *  auto   —— 进页面自动微信登录中（转圈）
 *  choice —— 该微信未关联账号，让用户选「关联已有账号 / 注册新账号」
 *  link   —— 关联已有账号（账号密码 + 绑定到此微信）
 *  manual —— 账号密码登录兜底
 */
type LoginMode = 'auto' | 'choice' | 'link' | 'manual'

Page({
  data: {
    /** 当前模式 */
    mode: 'auto' as LoginMode,
    account: '',
    password: '',
    /** 提交进行中（禁用按钮、防重复提交） */
    submitting: false
  },

  onLoad() {
    this.autoWxLogin()
  },

  /**
   * 取一个新鲜的 wx.login code（单次有效，每次后端调用前都要重新取）。
   * 授权失败或 code 为空一律 reject，由调用方决定提示文案。
   */
  getWxCode(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res.code)
          } else {
            reject(new Error('empty code'))
          }
        },
        fail: reject
      })
    })
  },

  /** 登录成功统一收尾：存 token/用户信息 + 成功 toast + 进首页 tab */
  loginSuccess(reply: LoginReply) {
    setToken(reply.token)
    setUserInfo(reply.data)
    wx.showToast({ title: '登录成功', icon: 'success' })
    wx.switchTab({ url: '/pages/home/home' })
  },

  // 账号输入
  onAccountInput(e: WechatMiniprogram.Input) {
    this.setData({ account: e.detail.value })
  },

  // 密码输入
  onPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value })
  },

  /**
   * 进页面自动微信登录：
   *  - reply.token 非空 → 已关联，直接登录成功；
   *  - reply.token 为空 → 该微信未关联账号，进 choice 让用户选；
   *  - getWxCode 失败 → 授权失败，落 manual 并自行 toast；
   *  - loginWx 抛错（后端/网络）→ 落 manual（request 已 toast，不重复）。
   */
  async autoWxLogin() {
    this.setData({ mode: 'auto' })
    let code = ''
    try {
      code = await this.getWxCode()
    } catch {
      // wx.login 授权失败：request 层管不到，需自行提示
      this.setData({ mode: 'manual' })
      wx.showToast({ title: '微信授权失败，请用账号登录', icon: 'none' })
      return
    }
    try {
      const reply = await loginWx(code)
      if (reply.token) {
        this.loginSuccess(reply)
      } else {
        // 该微信没有关联账号
        this.setData({ mode: 'choice' })
      }
    } catch {
      // 后端/网络错误：request 已统一 toast(message)，这里不重复，落账号登录兜底
      this.setData({ mode: 'manual' })
    }
  },

  /** choice：点「关联已有账号」→ 进 link，清空账号密码 */
  goLink() {
    this.setData({ mode: 'link', account: '', password: '' })
  },

  /** choice：点「注册新账号」→ 微信 openid 自动注册并登录 */
  async onRegister() {
    if (this.data.submitting) {
      return
    }
    this.setData({ submitting: true })
    // 1. 先拿新 code：失败属授权问题，request 层管不到，需自行 toast。
    let code = ''
    try {
      code = await this.getWxCode()
    } catch {
      this.setData({ submitting: false })
      wx.showToast({ title: '微信授权失败', icon: 'none' })
      return
    }
    // 2. 注册：失败由 request 层已统一 toast，这里不重复。
    try {
      const reply = await registerWx(code)
      this.loginSuccess(reply)
    } catch {
      // request 层已统一 toast(message)，这里不重复（按钮 loading 态已反馈进度）
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** link：确认关联并登录（验密码 + 绑 wxid + 登录） */
  async onLink() {
    if (this.data.submitting) {
      return
    }
    const account = this.data.account.trim()
    const password = this.data.password
    if (!account) {
      wx.showToast({ title: '请输入账号', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    // 1. 先拿新 code：授权失败需自行 toast。
    let code = ''
    try {
      code = await this.getWxCode()
    } catch {
      this.setData({ submitting: false })
      wx.showToast({ title: '微信授权失败', icon: 'none' })
      return
    }
    // 2. 验密码 + 绑 wxid + 登录：失败（密码错等）由 request 层已 toast，不重复。
    try {
      const reply = await bindWx(code, account, password)
      this.loginSuccess(reply)
    } catch {
      // request 层已统一 toast(message)，这里不重复（按钮 loading 态已反馈进度）
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** manual：账号密码登录 */
  async onManual() {
    if (this.data.submitting) {
      return
    }
    const account = this.data.account.trim()
    const password = this.data.password
    if (!account) {
      wx.showToast({ title: '请输入账号', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const reply = await login(account, password)
      this.loginSuccess(reply)
    } catch {
      // request 层已统一 toast(message)，这里不重复（按钮 loading 态已反馈进度）
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** choice / link 底部次要入口：切到账号密码登录 */
  goManual() {
    this.setData({ mode: 'manual' })
  },

  /** link 底部：返回 choice */
  backToChoice() {
    this.setData({ mode: 'choice' })
  }
})
