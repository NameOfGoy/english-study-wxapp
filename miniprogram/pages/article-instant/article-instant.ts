// pages/article-instant/article-instant.ts —— 即时文章生成向导（navigateTo 普通页）
// 复刻 H5 src/views/ArticleInstant.vue：4 步向导（方式→筛选→[自选选词]→生成结果）。
//   step1 挑方式：随机(目标词数 3~8) / 自选。
//   step2 筛选：状态(学习/复习/强化/完成/全部) + 类别(标签/单词/词语/全部)，类别=标签时多选标签。
//          随机 → 直接生成；自选 → 拉候选词进 step3。
//   step3 自选词语：搜索过滤 + 勾选(需 3~8) → 生成。
//   step4 结果：article-renderer 渲染(可点词看释义) + 收录/返回；失败显示重试。
// 生成中全屏 loading + 实时秒数(>=20s 提示耐心等待)。
import {
  generateArticle,
  getArticleCandidates,
  saveArticle
} from '../../services/article'
import { getTagList } from '../../services/tag'
import type {
  ArticleView,
  ArticleCandidate,
  SelfSelectWord,
  Tag,
  WordType
} from '../../services/types'

/** 状态/类别单选项 */
interface Option {
  label: string
  value: number
}
// 状态：全部=0 学习=1 复习=2 强化=3 完成=4
const STATUS_OPTIONS: Option[] = [
  { label: '学习', value: 1 },
  { label: '复习', value: 2 },
  { label: '强化', value: 3 },
  { label: '完成', value: 4 },
  { label: '全部', value: 0 }
]
// 类别：标签=1 单词=2 词语=3 全部=4
const CATEGORY_OPTIONS: Option[] = [
  { label: '标签', value: 1 },
  { label: '单词', value: 2 },
  { label: '词语', value: 3 },
  { label: '全部', value: 4 }
]

/** 标签多选 chip */
interface TagOption {
  id: number
  name: string
  /** 选中态内联样式串（注入标签色） */
  style: string
  selected: boolean
}

/** 候选词渲染单元 */
interface CandidateVM {
  word_id: number
  word_type: WordType
  word: string
  meaning: string
  typeLabel: string
  /** 已勾选 */
  picked: boolean
  /** 未勾选且已达 8 个上限 → 置灰不可选 */
  disabledPick: boolean
  key: string
}

/** 已选词（够生成 payload 用） */
interface PickedWord {
  word_id: number
  word_type: WordType
  word: string
}

interface PageData {
  step: number
  stepTitles: string[]
  stepActive: number

  method: 'random' | 'self'
  randomCount: number

  statusOptions: Option[]
  categoryOptions: Option[]
  filterStatus: number
  filterCategory: number
  /** 类别=标签 时显示标签多选 */
  showTagPicker: boolean
  tagsLoading: boolean
  tagOptions: TagOption[]

  candidatesLoading: boolean
  candidateKeyword: string
  candidateView: CandidateVM[]
  selectedCount: number
  selectedOk: boolean

  article: ArticleView | null
  generating: boolean
  generationError: boolean
  archiving: boolean
  archived: boolean
  seconds: number
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    step: 1,
    stepTitles: ['方式', '筛选', '生成'],
    stepActive: 0,

    method: 'random',
    randomCount: 5,

    statusOptions: STATUS_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    filterStatus: 0,
    filterCategory: 4,
    showTagPicker: false,
    tagsLoading: false,
    tagOptions: [],

    candidatesLoading: false,
    candidateKeyword: '',
    candidateView: [],
    selectedCount: 0,
    selectedOk: false,

    article: null,
    generating: false,
    generationError: false,
    archiving: false,
    archived: false,
    seconds: 0
  },

  onLoad() {
    // 实例状态
    this._timer = 0
    this._kwTimer = 0
    this._candidates = [] as ArticleCandidate[]
    this._selected = [] as PickedWord[]
    this._syncSteps()
  },

  onUnload() {
    this._stopTimer()
    if (this._kwTimer) {
      clearTimeout(this._kwTimer)
      this._kwTimer = 0
    }
  },

  /** 重算步骤指示（method/step 变化后） */
  _syncSteps() {
    const titles =
      this.data.method === 'self'
        ? ['方式', '筛选', '选词', '生成']
        : ['方式', '筛选', '生成']
    this.setData({
      stepTitles: titles,
      stepActive: Math.min(this.data.step - 1, titles.length - 1)
    })
  },

  // ---------------- step1: 方式 ----------------

  onPickMethod(e: WechatMiniprogram.TouchEvent) {
    const method = e.currentTarget.dataset.method as 'random' | 'self'
    if (method === this.data.method) return
    this.setData({ method }, () => this._syncSteps())
  },

  onChangeCount(e: WechatMiniprogram.TouchEvent) {
    const delta = Number(e.currentTarget.dataset.delta)
    let n = this.data.randomCount + delta
    if (n < 3) n = 3
    if (n > 8) n = 8
    this.setData({ randomCount: n })
  },

  toStep2() {
    this.setData({ step: 2 }, () => this._syncSteps())
    // 类别已是标签则确保标签已加载
    if (this.data.filterCategory === 1 && this.data.tagOptions.length === 0) {
      this.loadTags()
    }
  },

  // ---------------- step2: 筛选 ----------------

  onPickStatus(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filterStatus: Number(e.currentTarget.dataset.value) })
  },

  onPickCategory(e: WechatMiniprogram.TouchEvent) {
    const v = Number(e.currentTarget.dataset.value)
    this.setData({ filterCategory: v, showTagPicker: v === 1 })
    if (v === 1 && this.data.tagOptions.length === 0) {
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
    this.setData({ tagOptions: options })
  },

  /** 收集当前筛选标签 id */
  _selectedTagIds(): number[] {
    return this.data.tagOptions
      .filter((t: TagOption) => t.selected)
      .map((t: TagOption) => t.id)
  },

  /** step2 主按钮：随机→生成；自选→拉候选词进 step3 */
  async onStep2Next() {
    if (this.data.method === 'random') {
      this.generate()
      return
    }
    this.setData({ candidatesLoading: true })
    this._selected = []
    try {
      const list = await getArticleCandidates({
        status: this.data.filterStatus,
        category: this.data.filterCategory,
        tag_ids: this.data.filterCategory === 1 ? this._selectedTagIds() : []
      })
      this._candidates = list || []
      this.setData(
        { step: 3, candidateKeyword: '', selectedCount: 0, selectedOk: false },
        () => this._syncSteps()
      )
      this._refreshCandidateView()
    } catch (e) {
      // request 已 toast
    } finally {
      this.setData({ candidatesLoading: false })
    }
  },

  // ---------------- step3: 自选词语 ----------------

  onCandidateInput(e: WechatMiniprogram.Input) {
    this.setData({ candidateKeyword: e.detail.value })
    if (this._kwTimer) clearTimeout(this._kwTimer)
    this._kwTimer = setTimeout(() => this._refreshCandidateView(), 200)
  },

  /** 按关键词过滤 + 预算 picked/disabled flag */
  _refreshCandidateView() {
    const kw = (this.data.candidateKeyword || '').trim().toLowerCase()
    const pickedKeys = new Set(
      this._selected.map((s: PickedWord) => s.word_id + '_' + s.word_type)
    )
    const atLimit = this._selected.length >= 8
    const view: CandidateVM[] = []
    for (const c of this._candidates as ArticleCandidate[]) {
      if (
        kw &&
        (c.word || '').toLowerCase().indexOf(kw) < 0 &&
        (c.meaning || '').toLowerCase().indexOf(kw) < 0
      ) {
        continue
      }
      const key = c.word_id + '_' + c.word_type
      const picked = pickedKeys.has(key)
      view.push({
        word_id: c.word_id,
        word_type: c.word_type,
        word: c.word,
        meaning: c.meaning || '',
        typeLabel: c.word_type === 2 ? '词语' : '单词',
        picked,
        disabledPick: !picked && atLimit,
        key
      })
    }
    this.setData({ candidateView: view })
  },

  onTogglePick(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key)
    const idx = this._selected.findIndex(
      (s: PickedWord) => s.word_id + '_' + s.word_type === key
    )
    if (idx >= 0) {
      this._selected.splice(idx, 1)
    } else {
      if (this._selected.length >= 8) {
        wx.showToast({ title: '最多选择 8 个词语', icon: 'none' })
        return
      }
      const c = (this._candidates as ArticleCandidate[]).find(
        (x) => x.word_id + '_' + x.word_type === key
      )
      if (c) {
        this._selected.push({
          word_id: c.word_id,
          word_type: c.word_type,
          word: c.word
        })
      }
    }
    const n = this._selected.length
    this.setData({ selectedCount: n, selectedOk: n >= 3 && n <= 8 })
    this._refreshCandidateView()
  },

  // ---------------- 生成 ----------------

  async generate() {
    if (this.data.method === 'self' && !this.data.selectedOk) {
      wx.showToast({ title: '请选择 3~8 个词语', icon: 'none' })
      return
    }
    const isSelf = this.data.method === 'self'
    const words: SelfSelectWord[] = isSelf
      ? this._selected.map((c: PickedWord) => ({
          word_id: c.word_id,
          word_type: c.word_type
        }))
      : []

    this.setData({ generating: true, generationError: false, seconds: 0 })
    this._startTimer()
    try {
      const article = await generateArticle({
        method: isSelf ? 2 : 1,
        count: isSelf ? undefined : this.data.randomCount,
        status: this.data.filterStatus,
        category: this.data.filterCategory,
        tag_ids: this.data.filterCategory === 1 ? this._selectedTagIds() : [],
        words: isSelf ? words : []
      })
      this.setData(
        { article, archived: false, step: 4 },
        () => this._syncSteps()
      )
    } catch (e) {
      this.setData({ generationError: true, step: 4 }, () => this._syncSteps())
    } finally {
      this.setData({ generating: false })
      this._stopTimer()
    }
  },

  _startTimer() {
    this._stopTimer()
    this._timer = setInterval(() => {
      this.setData({ seconds: this.data.seconds + 1 })
    }, 1000) as unknown as number
  },

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = 0
    }
  },

  /** 重试（错误页） */
  onRetry() {
    this.generate()
  },

  /** 返回修改（错误页） → 退回上一步 */
  onBackToEdit() {
    const target = this.data.method === 'self' ? 3 : 2
    this.setData({ step: target, generationError: false }, () => this._syncSteps())
  },

  // ---------------- step 间「上一步」 ----------------

  onPrevStep() {
    let target = this.data.step - 1
    if (target < 1) target = 1
    this.setData({ step: target }, () => this._syncSteps())
  },

  // ---------------- 结果页：收录 / 返回 ----------------

  /** article-renderer 抛 archive 事件 */
  async onArchive() {
    const article = this.data.article
    if (!article || this.data.archived || this.data.archiving) return
    this.setData({ archiving: true })
    try {
      await saveArticle({
        title_en: article.title_en,
        title_zh: article.title_zh,
        sentences: article.sentences,
        used_words: article.used_words
      })
      this.setData({ archived: true })
      wx.showToast({ title: '已收录', icon: 'success' })
    } catch (e) {
      // request 已 toast
    } finally {
      this.setData({ archiving: false })
    }
  },

  /** article-renderer 抛 home 事件 → 回练习 */
  onHome() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/practice/practice' })
    })
  }
})
