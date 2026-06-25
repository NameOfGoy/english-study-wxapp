// home.ts —— 首页 dashboard（数据来自真实后端 service：dashboard.getDashboard）
import { getDashboard } from '../../services/dashboard'
import { getUserInfo } from '../../utils/auth'
import type { DashboardData } from '../../services/types'

interface HomeView {
  greetingName: string
  greetingHi: string
  // streak 暂无后端字段：用 showStreak 控制是否渲染火苗块（默认隐藏，待后端补 streak 字段再开启）
  showStreak: boolean
  streakDays: number
  todayDone: number
  todayTotal: number
  todayPercent: number
  todayLeft: number
  todayStats: { label: string; value: number; emoji: string }[]
}

// 四模式入口卡的静态元信息（名称/emoji/描述/配色/跳转路径不来自后端，count 由 dashboard 填充）
interface ModeCard {
  key: 'study' | 'review' | 'strength' | 'spot'
  name: string
  emoji: string
  desc: string
  count: number
  colorVar: string
  path: string
}

const MODE_META: ModeCard[] = [
  {
    key: 'study',
    name: '学习',
    emoji: '📘',
    desc: '认识新单词，建立第一印象',
    count: 0,
    colorVar: 'var(--mode-study)',
    path: '/pages/study/study'
  },
  {
    key: 'review',
    name: '复习',
    emoji: '🔁',
    desc: '看图回忆，巩固昨日所学',
    count: 0,
    colorVar: 'var(--mode-review)',
    path: '/pages/review/review'
  },
  {
    key: 'strength',
    name: '加强',
    emoji: '💪',
    desc: '反复确认，攻克易忘词',
    count: 0,
    colorVar: 'var(--mode-strength)',
    path: '/pages/strength/strength'
  },
  {
    key: 'spot',
    name: '抽查',
    emoji: '🎯',
    desc: '随机检测，查漏补缺',
    count: 0,
    colorVar: 'var(--mode-spot)',
    path: '/pages/spot/spot'
  }
]

// 空态默认视图（接口未回来 / 失败时展示，避免 WXML 取到 undefined）
function emptyHome(): HomeView {
  const info = getUserInfo()
  return {
    greetingName: info && info.name ? info.name : '同学',
    greetingHi: '👋',
    showStreak: false,
    streakDays: 0,
    todayDone: 0,
    todayTotal: 0,
    todayPercent: 0,
    todayLeft: 0,
    todayStats: [
      { label: '已学习', value: 0, emoji: '📘' },
      { label: '已复习', value: 0, emoji: '🔁' },
      { label: '已加强', value: 0, emoji: '💪' }
    ]
  }
}

Page({
  data: {
    home: emptyHome() as HomeView,
    modes: MODE_META as ModeCard[]
  },

  onLoad() {
    // 先放空态，onShow 再拉真实数据
    this.setData({ home: emptyHome() })
  },

  // tab 页：进入时设置自定义 tabBar 选中项（首页索引 0）
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ selected: 0 })
    }
    this.loadDashboard()
  },

  // 拉取 dashboard 并映射到视图字段
  async loadDashboard() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const d: DashboardData = await getDashboard()
      this.applyDashboard(d)
    } catch (e) {
      // request.ts 已统一 toast，这里仅保留空态，不再重复提示
    } finally {
      wx.hideLoading()
    }
  },

  applyDashboard(d: DashboardData) {
    const info = getUserInfo()
    const total = d.total_words || 0
    const done = d.finished_words || 0
    const percent = Math.round((d.progress_rate || 0) * 100)

    const home: HomeView = {
      greetingName: info && info.name ? info.name : '同学',
      greetingHi: '👋',
      // 后端暂无连续打卡字段 → 隐藏火苗块；后端补 streak 后改为 true 并填 streakDays
      showStreak: false,
      streakDays: 0,
      todayDone: done,
      todayTotal: total,
      todayPercent: percent,
      todayLeft: Math.max(total - done, 0),
      todayStats: [
        { label: '已学习', value: d.today_studied || 0, emoji: '📘' },
        { label: '已复习', value: d.today_reviewed || 0, emoji: '🔁' },
        { label: '已加强', value: d.today_strengthened || 0, emoji: '💪' }
      ]
    }

    // 四模式入口卡 count：注意「加强」对应 strengthen_count
    const modes = MODE_META.map((m) => {
      let count = 0
      if (m.key === 'study') count = d.study_count || 0
      else if (m.key === 'review') count = d.review_count || 0
      else if (m.key === 'strength') count = d.strengthen_count || 0
      else if (m.key === 'spot') count = d.spot_count || 0
      return { ...m, count }
    })

    this.setData({ home, modes })
  },

  // 点击模式卡 → 跳转对应练习页
  goMode(e: WechatMiniprogram.TouchEvent) {
    const path = e.currentTarget.dataset.path as string
    if (path) {
      wx.navigateTo({ url: path })
    }
  },

  /** 右上角「···」→ 转发给朋友（朋友点开落首页，游客模式可直接浏览） */
  onShareAppMessage() {
    return {
      title: '单词记忆助手 · 每天进步一点点',
      path: '/pages/home/home'
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return {
      title: '单词记忆助手 · 每天进步一点点'
    }
  }
})
