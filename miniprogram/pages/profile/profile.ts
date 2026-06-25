// pages/profile/profile.ts —— 我的(tab页)
// 数据来自真实 service：用户信息走 auth.getUserInfo() 先渲染，再 user.getUser(id) 刷新；
// 统计三项(总词数/已掌握) 走 dashboard.getDashboard()，连续天数后端暂无 → 隐藏占位。
//
// 本页交互（对照 H5 Profile.vue 复刻）：
//   ① 头像可点击换头像：chooseAndUploadAvatar(uid) → 拿到相对 path → updateUser 落库 → setUserInfo + 刷新显示。
//   ② "个人资料"设置项 → 弹底部编辑层（昵称/手机/邮箱可改，账号只读展示）→ 保存调 updateUser → 刷新。
//   ③ "标签管理"设置项 → navigateTo /pages/tag-manage/tag-manage。
//   其余设置项（导入历史/关于）保留 toast 占位。
import { getUserInfo, setUserInfo, isGuest, ROLE_GUEST } from '../../utils/auth'
import { getUser, updateUser, setupCredentials } from '../../services/user'
import { getDashboard } from '../../services/dashboard'
import { chooseAndUploadAvatar } from '../../services/file'
import { resolveAsset } from '../../utils/asset'
import { validatePassword } from '../../utils/password'
import type { UserInfo, DashboardData } from '../../services/types'

// 微信自动注册账号的保留前缀：account 形如 wx_xxxx 即"占位账号"，
// 表示该用户由微信一键登录自动建号、尚未设置真实账号密码（密码为后端占位值）。
// 据此在「我的」页显示一次性的「设置账号密码」入口；设置成功后 account 不再以 wx_ 开头，入口随之消失。
function isWxAutoAccount(info: UserInfo | null): boolean {
  return !!(info && info.account && info.account.indexOf('wx_') === 0)
}

// 设置项静态元信息（点击行为按 id 分派：profile=编辑层 / tags=跳转 / 其余=toast）
interface SettingEntry {
  id: string
  emoji: string
  text: string
}

const SETTINGS: SettingEntry[] = [
  { id: 'profile', emoji: '🪪', text: '个人资料' },
  { id: 'tags', emoji: '🏷️', text: '标签管理' },
  { id: 'import', emoji: '📥', text: '导入历史' },
  { id: 'about', emoji: 'ℹ️', text: '关于' }
]

// 单条统计的视图结构
interface StatItem {
  label: string
  value: number
}

interface ProfileView {
  nickname: string
  // 头像：avatarUrl 为空 或 加载失败(avatarError) → 回退 emoji 占位
  avatarUrl: string
  avatarEmoji: string
  avatarError: boolean
  // 连续天数后端暂无字段 → showStreak 控制是否渲染该统计列
  showStreak: boolean
  stats: StatItem[]
  settings: SettingEntry[]
}

// 编辑层的表单结构（账号只读展示，不参与提交字段集合）
interface EditForm {
  name: string
  account: string
  phone: string
  email: string
}

// 「设置账号密码」弹层的表单结构（一次性：自定义账号 + 新密码 + 确认）
interface SetupForm {
  account: string
  password: string
  confirm: string
}

// 由 UserInfo + (可选)DashboardData 组装视图
function buildProfile(
  info: UserInfo | null,
  dash?: DashboardData
): ProfileView {
  const totalWords = dash ? dash.total_words || 0 : 0
  const finishedWords = dash ? dash.finished_words || 0 : 0

  const stats: StatItem[] = [
    { label: '总词数', value: totalWords },
    { label: '已掌握', value: finishedWords }
    // 连续天数后端无字段，先不展示（showStreak=false）
  ]

  return {
    nickname:
      info && info.role === ROLE_GUEST
        ? '游客'
        : info && info.name
          ? info.name
          : '未登录',
    avatarUrl: info ? resolveAsset(info.avatar) : '',
    avatarEmoji: '🦊',
    avatarError: false,
    showStreak: false,
    stats,
    settings: SETTINGS
  }
}

Page({
  data: {
    profile: buildProfile(getUserInfo()) as ProfileView,
    // 游客只读身份 → 显示「登录/注册」入口、拦截写操作入口
    isGuest: isGuest(),
    // 头像上传锁：上传中禁止重复点头像
    avatarUploading: false,
    // 编辑层显隐 + 表单 + 保存锁
    editVisible: false,
    editSaving: false,
    editForm: { name: '', account: '', phone: '', email: '' } as EditForm,
    // 「设置账号密码」入口：仅微信占位账号(wx_ 前缀)显示，一次性
    needSetup: isWxAutoAccount(getUserInfo()),
    setupVisible: false,
    setupSaving: false,
    setupForm: { account: '', password: '', confirm: '' } as SetupForm
  },

  onShow() {
    // tab 页：设置自定义 tabBar 选中项（profile = 3）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ selected: 3 })
    }
    // 先用本地缓存渲染，再异步刷新
    const cachedInfo = getUserInfo()
    this.setData({
      profile: buildProfile(cachedInfo),
      needSetup: isWxAutoAccount(cachedInfo),
      isGuest: !!(cachedInfo && cachedInfo.role === ROLE_GUEST)
    })
    this.refresh()
  },

  // 拉取最新用户信息 + dashboard 统计
  async refresh() {
    const cached = getUserInfo()
    // 游客身份由 token 的 role 决定(缓存里 role=2)：不要用 getUser 刷新覆盖
    // （共享游客账号的 DB 行 role 可能是 0，会把游客误判成正式用户、登录入口消失）。
    // 游客只刷 dashboard(演示统计)。
    const guest = !!(cached && cached.role === ROLE_GUEST)
    wx.showLoading({ title: '加载中', mask: true })
    try {
      // 并行拉取：用户详情(若有 id 且非游客) + dashboard 统计
      // 注意 id 用 != null 判断：超管 sssadmin 的 user id 就是 0，truthy 判断会把它当成未登录
      const userP: Promise<UserInfo | null> =
        !guest && cached && cached.id != null
          ? getUser(cached.id).catch(() => cached)
          : Promise.resolve(cached)
      const dashP: Promise<DashboardData | undefined> = getDashboard().catch(
        () => undefined
      )

      const [user, dash] = await Promise.all([userP, dashP])

      // 用户信息有更新则回写缓存（游客不回写，保持 role=2）
      if (user && !guest) {
        setUserInfo(user)
      }
      this.setData({
        profile: buildProfile(user, dash),
        needSetup: isWxAutoAccount(user),
        isGuest: guest
      })
    } catch (e) {
      // request.ts 已统一 toast；这里保留已渲染的缓存视图，不再重复提示
    } finally {
      wx.hideLoading()
    }
  },

  // 头像加载失败 → 回退 emoji 占位
  onAvatarError() {
    this.setData({ 'profile.avatarError': true })
  },

  // 游客 → 去登录/注册（login 页 choice 模式，不静默自动登录）
  goLoginRegister() {
    wx.navigateTo({ url: '/pages/login/login?from=guest' })
  },

  // 点击头像换头像：选图 → 上传 → updateUser 落库（avatar 写后端返回的相对 path）→ setUserInfo + 刷新显示。
  // 注意：updateUser 回传的 avatar 必须是相对 path（后端返回值），不能是 resolveAsset 后的 http 绝对地址，否则会把 http URL 写库。
  async onTapAvatar() {
    if (this.data.avatarUploading) return
    if (isGuest()) {
      this.goLoginRegister()
      return
    }
    const cached = getUserInfo()
    if (!cached || cached.id == null) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ avatarUploading: true })
    wx.showLoading({ title: '上传中', mask: true })
    try {
      // 选图 + 上传，拿到后端返回的相对资源 path（含 upload/{userId}/ 前缀）
      const avatar = await chooseAndUploadAvatar(cached.id)
      // 落库：回传当前 info 的全部字段，仅替换 avatar 为新的相对 path
      const next: UserInfo = { ...cached, avatar }
      await updateUser(cached.id, next)
      // 本地缓存 + 视图同步（渲染前过 resolveAsset，并清除上一张图的加载失败标记）
      setUserInfo(next)
      this.setData({
        'profile.avatarUrl': resolveAsset(avatar),
        'profile.avatarError': false
      })
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (e) {
      // 用户取消选图：chooseAndUploadAvatar reject(Error('已取消')) → 静默不弹错
      const msg = e instanceof Error ? e.message : ''
      if (msg && msg !== '已取消') {
        // file.ts 不走 request.ts（不会自动 toast），上传/落库失败需自行提示
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      wx.hideLoading()
      this.setData({ avatarUploading: false })
    }
  },

  // 设置项点击：按 id 分派
  onTapSetting(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (id === 'profile') {
      this.openEdit()
      return
    }
    if (id === 'tags') {
      wx.navigateTo({ url: '/pages/tag-manage/tag-manage' })
      return
    }
    if (id === 'import') {
      wx.navigateTo({ url: '/pages/import-history/import-history' })
      return
    }
    const item = this.data.profile.settings.find((s) => s.id === id)
    wx.showToast({
      title: item ? `${item.text}（待实现）` : '待实现',
      icon: 'none'
    })
  },

  // 打开个人资料编辑层：用当前缓存 info 预填表单
  openEdit() {
    if (isGuest()) {
      this.goLoginRegister()
      return
    }
    const cached = getUserInfo()
    if (!cached || cached.id == null) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    this.setData({
      editVisible: true,
      editForm: {
        name: cached.name || '',
        account: cached.account || '',
        phone: cached.phone || '',
        email: cached.email || ''
      }
    })
  },

  // 关闭编辑层（取消 / 点蒙层）：保存中不允许关闭
  closeEdit() {
    if (this.data.editSaving) return
    this.setData({ editVisible: false })
  },

  // 阻断编辑层卡片内的点击冒泡到蒙层，避免点输入区误关闭
  noop() {},

  // 表单输入绑定（name/phone/email；账号只读不可改）
  onEditInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof EditForm
    if (field === 'account') return
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  // 保存个人资料：校验 → updateUser → setUserInfo + 刷新视图。
  // avatar 字段回传当前缓存里已存的相对 path（不动头像，且不能回传 resolveAsset 后的绝对地址）。
  async saveEdit() {
    if (this.data.editSaving) return
    const cached = getUserInfo()
    if (!cached || cached.id == null) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const form = this.data.editForm
    const name = (form.name || '').trim()
    const phone = (form.phone || '').trim()
    const email = (form.email || '').trim()

    // 基础校验（对照 H5：昵称必填；手机/邮箱有值才校验格式）
    if (!name) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' })
      return
    }

    this.setData({ editSaving: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      // 全量回传：保留 account/avatar/role 等不变字段，仅覆盖可编辑项
      const next: UserInfo = {
        ...cached,
        name,
        phone,
        email
      }
      await updateUser(cached.id, next)
      setUserInfo(next)
      this.setData({
        editVisible: false,
        'profile.nickname': name
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      // updateUser 走 request.ts，失败已统一 toast，这里静默
    } finally {
      wx.hideLoading()
      this.setData({ editSaving: false })
    }
  },

  // 打开「设置账号密码」弹层（仅占位账号 needSetup 时可用），清空表单
  openSetup() {
    if (!this.data.needSetup) return
    this.setData({
      setupVisible: true,
      setupForm: { account: '', password: '', confirm: '' }
    })
  },

  // 关闭弹层（取消 / 点蒙层）：保存中不允许关闭
  closeSetup() {
    if (this.data.setupSaving) return
    this.setData({ setupVisible: false })
  },

  // 弹层输入绑定（account / password / confirm）
  onSetupInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof SetupForm
    this.setData({ [`setupForm.${field}`]: e.detail.value })
  },

  // 提交设置：校验账号 + 密码强度 + 两次一致 → setupCredentials → 同步本地 account、隐藏入口。
  // 成功后弹「请牢记」强提示；密码不入本地缓存。一次性操作，成功即不再显示入口。
  async saveSetup() {
    if (this.data.setupSaving) return
    const cached = getUserInfo()
    if (!cached || cached.id == null) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const form = this.data.setupForm
    const account = (form.account || '').trim()
    const password = form.password || ''
    const confirm = form.confirm || ''

    if (!account) {
      wx.showToast({ title: '请输入账号', icon: 'none' })
      return
    }
    // wx_ 是自动注册账号的保留前缀，禁止用户设成这个（否则占位判断失准）
    if (account.indexOf('wx_') === 0) {
      wx.showToast({ title: '账号不能以 wx_ 开头', icon: 'none' })
      return
    }
    const pwdErr = validatePassword(password)
    if (pwdErr) {
      wx.showToast({ title: pwdErr, icon: 'none' })
      return
    }
    if (password !== confirm) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' })
      return
    }

    this.setData({ setupSaving: true })
    wx.showLoading({ title: '设置中', mask: true })
    try {
      await setupCredentials(account, password)
    } catch (e) {
      // setupCredentials 走 request.ts，失败已统一 toast，这里静默
      wx.hideLoading()
      this.setData({ setupSaving: false })
      return
    }
    wx.hideLoading()
    // 落库成功：本地缓存账号同步为新账号（不缓存密码），入口随之消失
    const next: UserInfo = { ...cached, account }
    setUserInfo(next)
    this.setData({
      setupVisible: false,
      setupSaving: false,
      needSetup: false
    })
    wx.showModal({
      title: '设置成功',
      content: '请牢记你的账号和密码，仅可设置一次，之后将无法在小程序内修改。',
      showCancel: false,
      confirmText: '我已记住'
    })
  }
})
