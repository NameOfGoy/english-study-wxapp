// pages/article-library/article-library.ts —— 收录文章库（navigateTo 普通页）
// 复刻 H5 src/views/ArticleLibrary.vue：搜索(标题/含词，300ms 防抖) + 可折叠标签多选筛选 +
//   分页列表(上拉 onReachBottom 加载更多)。
// 删除交互（两种模式，行为与 H5 端一致）：
//   普通模式：点条目进详情；条目左滑露出红色"删除"→二次确认→单删→就地移除。
//   多选模式：点条目=勾选/取消；底部操作条全选/已选N篇/批删。
import {
  getArticleList,
  deleteArticle,
  batchDeleteArticle
} from '../../services/article'
import { getTagList } from '../../services/tag'
import type { ArticleListItem, ArticleTag, Tag } from '../../services/types'

const LIMIT = 10
/** 左滑删除按钮宽度（rpx），与 wxss 的 .al-row__action 宽度一致 */
const DELETE_WIDTH = 140
/** 点击 / 滑动判定阈值（px）：横移超过它才算滑动，否则按点击处理 */
const MOVE_THRESHOLD = 8

/** 列表项渲染单元 */
interface ListVM {
  id: number
  titleMain: string
  /** title_en 存在时，括号里展示的中文标题（否则空） */
  titleSub: string
  hasTags: boolean
  tags: ArticleTag[]
  hasWords: boolean
  wordsText: string
  /** 左滑位移（rpx，<=0；0=关闭，-DELETE_WIDTH=完全打开） */
  offsetX: number
  /** 多选模式下是否勾选 */
  checked: boolean
}

/** 标签筛选 chip */
interface TagOption {
  id: number
  name: string
  style: string
  selected: boolean
}

interface PageData {
  keyword: string
  tagExpanded: boolean
  tagSummary: string
  tagsLoading: boolean
  tagOptions: TagOption[]

  list: ListVM[]
  loading: boolean
  finished: boolean
  empty: boolean
  emptyText: string

  /** 多选模式开关 */
  selectMode: boolean
  /** 已选篇数（底部操作条展示用） */
  selectedCount: number
  /** 是否已全选（左侧切换按钮文案用） */
  allSelected: boolean
  /** 左滑删除按钮宽度（rpx），供 wxml 绑定 transform 用 */
  deleteWidth: number
  /** 正在滑动：true 时关掉 content 的 transition，避免实时拖影 */
  swiping: boolean
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    keyword: '',
    tagExpanded: false,
    tagSummary: '全部',
    tagsLoading: false,
    tagOptions: [],

    list: [],
    loading: false,
    finished: false,
    empty: false,
    emptyText: '还没有收录任何文章',

    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    deleteWidth: DELETE_WIDTH,
    swiping: false
  },

  onLoad() {
    this._kwTimer = 0
    this._total = 0
    this._tagsLoaded = false
    // 左滑手势临时态（不入 data，避免频繁 setData 抖动）
    this._touchStartX = 0
    this._touchStartOffset = 0
    this._touchMoved = false
    this._touchIndex = -1
    // px→rpx 换算比例（设计宽 750rpx）。一次算好，避免每次 touchmove 调系统 API。
    let winW = 375
    try {
      winW = wx.getSystemInfoSync().windowWidth || 375
    } catch (e) {
      winW = 375
    }
    this._rpxRatio = 750 / winW
    this.reload()
  },

  onUnload() {
    if (this._kwTimer) {
      clearTimeout(this._kwTimer)
      this._kwTimer = 0
    }
  },

  /** 选中的标签 id */
  _selectedTagIds(): number[] {
    return this.data.tagOptions
      .filter((t: TagOption) => t.selected)
      .map((t: TagOption) => t.id)
  },

  _hasFilter(): boolean {
    return (
      (this.data.keyword || '').trim() !== '' ||
      this._selectedTagIds().length > 0
    )
  },

  /** 把后端列表项映射为渲染单元 */
  _toVM(item: ArticleListItem): ListVM {
    const en = item.title_en || ''
    const zh = item.title_zh || ''
    const words = item.words || []
    return {
      id: item.id,
      titleMain: en || zh || '无标题',
      titleSub: en && zh ? zh : '',
      hasTags: !!(item.tags && item.tags.length),
      tags: item.tags || [],
      hasWords: words.length > 0,
      wordsText: words.join(' · '),
      offsetX: 0,
      checked: false
    }
  },

  /** 重新加载第一页（搜索/标签变更后） */
  async reload() {
    this.setData({
      list: [],
      loading: true,
      finished: false,
      empty: false,
      emptyText: this._hasFilter() ? '没有匹配的文章' : '还没有收录任何文章'
    })
    this._total = 0
    await this._loadPage(true)
  },

  /** 上拉加载更多 */
  loadMore() {
    if (this.data.loading || this.data.finished) {
      return
    }
    this.setData({ loading: true })
    this._loadPage(false)
  },

  /** 加载一页（reset=true 时是首页） */
  async _loadPage(reset: boolean) {
    try {
      const offset = reset ? 0 : this.data.list.length
      const resp = await getArticleList({
        offset,
        limit: LIMIT,
        keyword: (this.data.keyword || '').trim(),
        tag_ids: this._selectedTagIds()
      })
      const data = resp.data || []
      const vms = data.map((it: ArticleListItem) => this._toVM(it))
      const list = reset ? vms : this.data.list.concat(vms)
      this._total = resp.total_count || 0
      const finished = data.length === 0 || list.length >= this._total
      this.setData({
        list,
        finished,
        empty: list.length === 0,
        loading: false
      })
      // 重拉首页后，多选态里的勾选已随新数据清空，同步底部计数
      if (reset && this.data.selectMode) {
        this._syncSelection()
      }
    } catch (e) {
      // request 已 toast；标记 finished 防止反复触发
      this.setData({ finished: true, loading: false, empty: this.data.list.length === 0 })
    }
  },

  onReachBottom() {
    this.loadMore()
  },

  // ---------------- 搜索 ----------------

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
    if (this._kwTimer) clearTimeout(this._kwTimer)
    this._kwTimer = setTimeout(() => this.reload(), 300)
  },

  // ---------------- 标签筛选 ----------------

  onToggleTagPanel() {
    const next = !this.data.tagExpanded
    this.setData({ tagExpanded: next })
    if (next && !this._tagsLoaded) {
      this.loadTags()
    }
  },

  async loadTags() {
    this.setData({ tagsLoading: true })
    try {
      const list = await getTagList()
      const options: TagOption[] = (list || []).map((t: Tag): TagOption => {
        const color = t.style || '#1989fa'
        return {
          id: t.id,
          name: t.name,
          style: 'background:' + color,
          selected: false
        }
      })
      this._tagsLoaded = true
      this.setData({ tagOptions: options })
    } catch (e) {
      this.setData({ tagOptions: [] })
    } finally {
      this.setData({ tagsLoading: false })
    }
  },

  onToggleTag(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const options = this.data.tagOptions.map((t: TagOption): TagOption =>
      t.id === id ? { ...t, selected: !t.selected } : t
    )
    const count = options.filter((t: TagOption) => t.selected).length
    this.setData({
      tagOptions: options,
      tagSummary: count > 0 ? '已选 ' + count + ' 个' : '全部'
    })
    this.reload()
  },

  // ---------------- 左滑删除（手写，无组件库） ----------------

  onRowTouchStart(e: WechatMiniprogram.TouchEvent) {
    if (this.data.selectMode) {
      return
    }
    const index = Number(e.currentTarget.dataset.index)
    const cur = this.data.list[index]
    this._touchIndex = index
    this._touchStartX = e.touches[0].clientX
    this._touchStartOffset = cur ? cur.offsetX : 0
    this._touchMoved = false
    // 起手前若有别的行打开着，先把它关上（同一时刻只允许一行打开）
    const opened = this.data.list.findIndex(
      (it: ListVM, i: number) => i !== index && it.offsetX !== 0
    )
    if (opened >= 0) {
      const list = this.data.list.map((it: ListVM, i: number): ListVM =>
        i === opened ? { ...it, offsetX: 0 } : it
      )
      this.setData({ list })
    }
  },

  onRowTouchMove(e: WechatMiniprogram.TouchEvent) {
    if (this.data.selectMode || this._touchIndex < 0) {
      return
    }
    const dx = e.touches[0].clientX - this._touchStartX
    if (Math.abs(dx) > MOVE_THRESHOLD) {
      this._touchMoved = true
    }
    // clientX 是 px，行位移用 rpx；按 onLoad 算好的比例换算
    let next = this._touchStartOffset + dx * this._rpxRatio
    if (next > 0) next = 0
    if (next < -DELETE_WIDTH) next = -DELETE_WIDTH
    const idx = this._touchIndex
    const list = this.data.list.map((it: ListVM, i: number): ListVM =>
      i === idx ? { ...it, offsetX: next } : it
    )
    // 滑动期间用 swiping 标志关掉 content 过渡，避免拖影（wxml 里据此切 class）
    this.setData({ list, swiping: true })
  },

  onRowTouchEnd() {
    if (this.data.selectMode || this._touchIndex < 0) {
      this._touchIndex = -1
      return
    }
    const idx = this._touchIndex
    const cur = this.data.list[idx]
    // 超过一半吸附打开，否则关闭
    const open = cur && cur.offsetX < -DELETE_WIDTH / 2
    const list = this.data.list.map((it: ListVM, i: number): ListVM =>
      i === idx ? { ...it, offsetX: open ? -DELETE_WIDTH : 0 } : it
    )
    this.setData({ list, swiping: false })
    this._touchIndex = -1
  },

  /** 点行本体：多选态=toggle 勾选；普通态=未滑动则进详情，滑开时先收起 */
  onRowTap(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.list[index]
    if (!item) {
      return
    }
    if (this.data.selectMode) {
      this._toggleChecked(index)
      return
    }
    // 普通态：若本行处于打开/正在滑动，点击只收起，不跳转
    if (item.offsetX !== 0 || this._touchMoved) {
      if (item.offsetX !== 0) {
        const list = this.data.list.map((it: ListVM, i: number): ListVM =>
          i === index ? { ...it, offsetX: 0 } : it
        )
        this.setData({ list })
      }
      return
    }
    this.openDetail(item.id)
  },

  /** 点左滑露出的"删除"按钮：二次确认 → 单删 → 就地移除 */
  onSwipeDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) {
      return
    }
    wx.showModal({
      title: '确认删除',
      content: '确定删除这篇文章吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          await deleteArticle(id)
          this._removeFromList(id)
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          // 已 toast
        }
      }
    })
  },

  // ---------------- 多选模式 ----------------

  /** 进入多选模式：清空已选 + 收起全部左滑 */
  enterSelectMode() {
    const list = this.data.list.map((it: ListVM): ListVM =>
      it.offsetX !== 0 || it.checked ? { ...it, offsetX: 0, checked: false } : it
    )
    this.setData({
      list,
      selectMode: true,
      selectedCount: 0,
      allSelected: false
    })
  },

  /** 退出多选模式：清空已选 */
  exitSelectMode() {
    const list = this.data.list.map((it: ListVM): ListVM =>
      it.checked ? { ...it, checked: false } : it
    )
    this.setData({
      list,
      selectMode: false,
      selectedCount: 0,
      allSelected: false
    })
  },

  /** toggle 某行勾选 */
  _toggleChecked(index: number) {
    const list = this.data.list.map((it: ListVM, i: number): ListVM =>
      i === index ? { ...it, checked: !it.checked } : it
    )
    this.setData({ list })
    this._syncSelection()
  },

  /** 根据 list 勾选态刷新底部计数 / 全选标志 */
  _syncSelection() {
    const list = this.data.list
    const count = list.filter((it: ListVM) => it.checked).length
    this.setData({
      selectedCount: count,
      allSelected: list.length > 0 && count === list.length
    })
  },

  /** 已选 id 列表 */
  _selectedArticleIds(): number[] {
    return this.data.list
      .filter((it: ListVM) => it.checked)
      .map((it: ListVM) => it.id)
  },

  /** 全选 / 取消全选切换 */
  onToggleSelectAll() {
    const target = !this.data.allSelected
    const list = this.data.list.map((it: ListVM): ListVM =>
      it.checked === target ? it : { ...it, checked: target }
    )
    this.setData({ list })
    this._syncSelection()
  },

  /** 批量删除：二次确认 → batch-delete → 就地移除 + 退出多选 */
  onBatchDelete() {
    const ids = this._selectedArticleIds()
    if (!ids.length) {
      return
    }
    wx.showModal({
      title: '确认删除',
      content: '确定删除选中的 ' + ids.length + ' 篇文章吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          const n = await batchDeleteArticle(ids)
          this._removeManyFromList(ids)
          this.exitSelectMode()
          wx.showToast({ title: '已删除 ' + n + ' 篇', icon: 'success' })
        } catch (err) {
          // 已 toast
        }
      }
    })
  },

  // ---------------- 导航 ----------------

  openDetail(id: number) {
    wx.navigateTo({
      url: '/pages/article-detail/article-detail?id=' + id
    })
  },

  /** 从当前列表按 id 就地移除一行，并同步总数 / 空态（与 _loadPage 的 empty 处理一致） */
  _removeFromList(id: number) {
    if (!id) {
      return
    }
    const list = this.data.list.filter((it: ListVM) => it.id !== id)
    if (list.length === this.data.list.length) {
      return
    }
    this._total = Math.max(0, (this._total || 0) - 1)
    // 就地删空了当前已加载项, 但服务端可能还有未加载文章 → 重拉首页, 避免误显"空库"
    if (list.length === 0 && this._total > 0) {
      this.reload()
      return
    }
    this.setData({ list, empty: list.length === 0 })
    if (this.data.selectMode) {
      this._syncSelection()
    }
  },

  /** 批量就地移除多行（复用单行逻辑，统一总数 / 空态处理） */
  _removeManyFromList(ids: number[]) {
    if (!ids || !ids.length) {
      return
    }
    const removeSet: Record<number, boolean> = {}
    for (const id of ids) removeSet[id] = true
    const list = this.data.list.filter((it: ListVM) => !removeSet[it.id])
    const removed = this.data.list.length - list.length
    if (removed <= 0) {
      return
    }
    this._total = Math.max(0, (this._total || 0) - removed)
    // 就地删空了当前已加载项, 但服务端可能还有未加载文章 → 重拉首页, 避免误显"空库"
    if (list.length === 0 && this._total > 0) {
      this.reload()
      return
    }
    this.setData({ list, empty: list.length === 0 })
  },

  /** 右上角「···」→ 转发给朋友 */
  onShareAppMessage() {
    return {
      title: '单词记忆助手 · 读短文记单词',
      path: '/pages/home/home'
    }
  }
})
