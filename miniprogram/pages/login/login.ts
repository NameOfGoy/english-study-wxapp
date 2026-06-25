// login.ts —— 微信登录页（自动微信登录 + 未关联弹层选关联/注册 + 账号登录兜底）
// 走真实 service：loginWx / registerWx / bindWx / login → auth.setToken/setUserInfo → switchTab 进首页。
// request 层失败已统一 toast(message)，这里只对 wx.login 授权失败自行 toast，API 错误不重复提示。
import { login, loginWx, registerWx, bindWx, updateUser } from '../../services/user'
import { setToken, setUserInfo, getUserInfo } from '../../utils/auth'
import { uploadFile, OSS_BUCKET } from '../../services/file'
import type { LoginReply, UserInfo } from '../../services/types'

/** 页面状态机：
 *  auto    —— 进页面自动微信登录中（转圈）
 *  choice  —— 该微信未关联账号，让用户选「关联已有账号 / 微信登录」
 *  link    —— 关联已有账号（账号密码 + 绑定到此微信）
 *  manual  —— 账号密码登录兜底
 *  profile —— 微信自动注册成功后，一次性「完善资料」（头像昵称填写能力）
 */
type LoginMode = 'auto' | 'choice' | 'link' | 'manual' | 'profile'

Page({
  data: {
    /** 当前模式 */
    mode: 'auto' as LoginMode,
    account: '',
    password: '',
    /** 提交进行中（禁用按钮、防重复提交） */
    submitting: false,
    // ---- 完善资料（微信自动注册成功后的一次性步骤）----
    /** chooseAvatar 选到的临时头像本地路径（空=未选） */
    profileAvatar: '',
    /** type=nickname 填到的昵称 */
    profileNickname: '',
    /** 完善资料保存中 */
    profileSaving: false
  },

  onLoad(options: Record<string, string>) {
    // 游客主动来登录/注册(「我的」点登录、或写操作被引导): 已持游客 token, 不静默自动登录,
    // 直接进「选择」页让用户选 微信登录(建号) / 绑定已有账号。
    if (options && options.from === 'guest') {
      this.setData({ mode: 'choice' })
      return
    }
    // 其它入口: 维持原自动微信登录(微信已注册→直接进首页; 未注册→落账号登录兜底)。
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
        // 该微信未注册/未关联 → 进选择页：微信登录(自动建号) / 绑定已有账号
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

  /** choice：点「微信登录」→ 微信 openid 自动注册并登录，成功后进「完善资料」拿微信头像昵称 */
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
      // 自动建号成功：先存登录态（完善资料要带 token 调 updateUser/上传），
      // 但不直接进首页 → 进「完善资料」一次性步骤（微信头像昵称填写能力）。
      setToken(reply.token)
      setUserInfo(reply.data)
      this.setData({
        mode: 'profile',
        profileAvatar: '',
        profileNickname: '',
        profileSaving: false
      })
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
  },

  /* ===================== 完善资料（微信自动注册成功后的一次性步骤） ===================== */

  /** 头像按钮 chooseAvatar 回调：拿到微信头像临时路径，先本地预览，提交时再上传 */
  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const detail = (e.detail || {}) as { avatarUrl?: string }
    const url = detail.avatarUrl || ''
    if (url) {
      this.setData({ profileAvatar: url })
    }
  },

  /** 昵称输入（type=nickname：点进去微信提示「使用微信昵称」，input/blur 都回填） */
  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ profileNickname: e.detail.value })
  },

  /** 完成：有头像则上传 + 落库昵称/头像 → 进首页；头像昵称都没填则等同跳过 */
  async onProfileDone() {
    if (this.data.profileSaving) {
      return
    }
    const cached = getUserInfo()
    if (!cached || cached.id == null) {
      // 理论不会（刚注册完已有登录态）；兜底直接进首页
      this.gotoHome()
      return
    }
    const nickname = (this.data.profileNickname || '').trim()
    const avatarPath = this.data.profileAvatar
    // 头像昵称都没填 → 等同跳过，保持后端默认「微信用户」
    if (!nickname && !avatarPath) {
      this.gotoHome()
      return
    }
    this.setData({ profileSaving: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      let avatar = cached.avatar
      if (avatarPath) {
        // chooseAvatar 给的是临时本地图，走和「我的」换头像同一上传通道 → 拿后端相对 path
        const object = 'avatar/' + cached.id + '/' + Date.now() + '.jpg'
        avatar = await uploadFile(avatarPath, OSS_BUCKET, object)
      }
      const next: UserInfo = {
        ...cached,
        name: nickname || cached.name,
        avatar
      }
      await updateUser(cached.id, next)
      setUserInfo(next)
      wx.hideLoading()
      this.gotoHome()
    } catch (e) {
      wx.hideLoading()
      this.setData({ profileSaving: false })
      // updateUser 走 request 已 toast；uploadFile 失败这里补 toast
      const msg = e instanceof Error ? e.message : ''
      if (msg) {
        wx.showToast({ title: msg, icon: 'none' })
      }
    }
  },

  /** 跳过完善资料：直接进首页（保持后端默认昵称/无头像，之后可在「我的」改） */
  onProfileSkip() {
    this.gotoHome()
  },

  /** 进首页收尾（完善资料完成/跳过共用） */
  gotoHome() {
    wx.showToast({ title: '登录成功', icon: 'success' })
    wx.switchTab({ url: '/pages/home/home' })
  }
})
