// pages/profile/profile.ts —— 我的(tab页)
// 数据来自真实 service：用户信息走 auth.getUserInfo() 先渲染，再 user.getUser(id) 刷新；
// 统计三项(总词数/已掌握) 走 dashboard.getDashboard()，连续天数后端暂无 → 隐藏占位。
//
// 本页交互（对照 H5 Profile.vue 复刻）：
//   ① 头像可点击换头像：chooseAndUploadAvatar(uid) → 拿到相对 path → updateUser 落库 → setUserInfo + 刷新显示。
//   ② "个人资料"设置项 → 弹底部编辑层（昵称/手机/邮箱可改，账号只读展示）→ 保存调 updateUser → 刷新。
//   ③ "标签管理"设置项 → navigateTo /pages/tag-manage/tag-manage。
//   其余设置项（导入历史/关于）保留 toast 占位。
import { getUserInfo, setUserInfo, clearToken, clearUserInfo } from '../../utils/auth'
import { getUser, updateUser } from '../../services/user'
import { getDashboard } from '../../services/dashboard'
import { chooseAndUploadAvatar } from '../../services/file'
import { resolveAsset } from '../../utils/asset'
import type { UserInfo, DashboardData } from '../../services/types'

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
    nickname: info && info.name ? info.name : '未登录',
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
    // 头像上传锁：上传中禁止重复点头像
    avatarUploading: false,
    // 编辑层显隐 + 表单 + 保存锁
    editVisible: false,
    editSaving: false,
    editForm: { name: '', account: '', phone: '', email: '' } as EditForm
  },

  onShow() {
    // tab 页：设置自定义 tabBar 选中项（profile = 3）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ selected: 3 })
    }
    // 先用本地缓存渲染，再异步刷新
    this.setData({ profile: buildProfile(getUserInfo()) })
    this.refresh()
  },

  // 拉取最新用户信息 + dashboard 统计
  async refresh() {
    const cached = getUserInfo()
    wx.showLoading({ title: '加载中', mask: true })
    try {
      // 并行拉取：用户详情(若有 id) + dashboard 统计
      // 注意 id 用 != null 判断：超管 sssadmin 的 user id 就是 0，truthy 判断会把它当成未登录
      const userP: Promise<UserInfo | null> =
        cached && cached.id != null
          ? getUser(cached.id).catch(() => cached)
          : Promise.resolve(cached)
      const dashP: Promise<DashboardData | undefined> = getDashboard().catch(
        () => undefined
      )

      const [user, dash] = await Promise.all([userP, dashP])

      // 用户信息有更新则回写缓存
      if (user) {
        setUserInfo(user)
      }
      this.setData({ profile: buildProfile(user, dash) })
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

  // 点击头像换头像：选图 → 上传 → updateUser 落库（avatar 写后端返回的相对 path）→ setUserInfo + 刷新显示。
  // 注意：updateUser 回传的 avatar 必须是相对 path（后端返回值），不能是 resolveAsset 后的 http 绝对地址，否则会把 http URL 写库。
  async onTapAvatar() {
    if (this.data.avatarUploading) return
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

  // 退出登录：清 token + 用户信息，reLaunch 到登录页
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          clearToken()
          clearUserInfo()
          wx.reLaunch({ url: '/pages/login/login' })
        }
      }
    })
  }
})
