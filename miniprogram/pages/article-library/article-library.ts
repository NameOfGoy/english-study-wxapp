// pages/article-library/article-library.ts —— 收录文章库（navigateTo 普通页）
// 复刻 H5 src/views/ArticleLibrary.vue：搜索(标题/含词，300ms 防抖) + 可折叠标签多选筛选 +
//   分页列表(上拉 onReachBottom 加载更多)。点条目进详情页。
import { getArticleList } from '../../services/article'
import { getTagList } from '../../services/tag'
import type { ArticleListItem, ArticleTag, Tag } from '../../services/types'

const LIMIT = 10

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
    emptyText: '还没有收录任何文章'
  },

  onLoad() {
    this._kwTimer = 0
    this._total = 0
    this._tagsLoaded = false
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
      wordsText: words.join(' · ')
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

  // ---------------- 导航 ----------------

  openDetail(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    wx.navigateTo({ url: '/pages/article-detail/article-detail?id=' + id })
  }
})
