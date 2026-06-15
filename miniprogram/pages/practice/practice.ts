// pages/practice/practice.ts —— 练习 hub（tab 页）
// onShow 拉 dashboard 四个 count 填到四张模式卡的「待练数」；点击 navigateTo 对应练习页。
import { getDashboard } from '../../services/dashboard'
import type { PractiseMode, DashboardData } from '../../services/types'

/** 模式静态元信息（UI 文案/配色/跳转路径，非后端数据，固定写死） */
interface ModeMeta {
  key: PractiseMode
  name: string
  emoji: string
  colorVar: string   // 对应 CSS 变量字符串，WXML 里 style="--mode: {{colorVar}}"
  path: string       // wx.navigateTo 目标
  brief: string      // 一句话简介
  count: number      // 待练数（由 dashboard 填充）
}

// 各模式静态配置（顺序：学习/复习/加强/抽查），count 先置 0 待 dashboard 覆盖
const MODE_METAS: ModeMeta[] = [
  {
    key: 'study',
    name: '学习',
    emoji: '📘',
    colorVar: 'var(--mode-study)',
    path: '/pages/study/study',
    brief: '认识新词，建立第一印象',
    count: 0
  },
  {
    key: 'review',
    name: '复习',
    emoji: '🔁',
    colorVar: 'var(--mode-review)',
    path: '/pages/review/review',
    brief: '巩固记忆，看图回忆昨日所学',
    count: 0
  },
  {
    key: 'strength',
    name: '加强',
    emoji: '💪',
    colorVar: 'var(--mode-strength)',
    path: '/pages/strength/strength',
    brief: '攻克难词，反复确认易忘点',
    count: 0
  },
  {
    key: 'spot',
    name: '抽查',
    emoji: '🎯',
    colorVar: 'var(--mode-spot)',
    path: '/pages/spot/spot',
    brief: '随机检验，查漏补缺',
    count: 0
  }
]

Page({
  data: {
    // 初始用静态配置渲染（count=0），onShow 拉到 dashboard 后覆盖 count
    modes: MODE_METAS.map(m => ({ ...m }))
  },

  // tab 页：设置自定义 tabBar 选中索引（practice = 1） + 拉 dashboard 刷新待练数
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ selected: 1 })
    }
    this.loadCounts()
  },

  // 拉 dashboard 四个 count 填到四张模式卡
  loadCounts() {
    wx.showLoading({ title: '加载中', mask: false })
    getDashboard()
      .then((d: DashboardData) => {
        // dashboard 的四个 count 一一对应四个模式
        const countMap: Record<PractiseMode, number> = {
          study: d.study_count || 0,
          review: d.review_count || 0,
          strength: d.strengthen_count || 0,
          spot: d.spot_count || 0
        }
        this.setData({
          modes: MODE_METAS.map(m => ({ ...m, count: countMap[m.key] }))
        })
      })
      .catch(() => {
        // request 层已统一 toast；这里保持原静态列表（count 0），不再额外提示
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  // 点击模式卡 → 跳转到对应练习页
  goMode(e: WechatMiniprogram.TouchEvent) {
    const path = e.currentTarget.dataset.path as string
    if (path) {
      wx.navigateTo({ url: path })
    }
  },

  // 点击文章练习入口（即时文章 / 收录文章）→ 跳转
  goArticle(e: WechatMiniprogram.TouchEvent) {
    const path = e.currentTarget.dataset.path as string
    if (path) {
      wx.navigateTo({ url: path })
    }
  },

  // tag-filter-bar 的 change 事件：组件已自行持久化（wx.storage）选中的标签 id，
  // 是全局单一数据源。各词语练习页在 onLoad 拉 list 时会 getPracticeTagFilter() 读取并带入
  // getList 的 tag_ids，故 hub 本身无需缓存选择、也无需在此重拉列表（hub 不渲染词条列表）。
  // 保留此空回调仅为绑定 WXML 的 bind:change，避免未绑定事件告警；e.detail.ids 当前不需消费。
  onTagFilterChange(_e: WechatMiniprogram.CustomEvent<{ ids: number[] }>) {
    // no-op: 持久化与筛选数据源由组件 + utils/practiceTagFilter 统一管理
  }
})
