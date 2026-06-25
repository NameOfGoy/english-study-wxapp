// pages/wordbook/wordbook.ts —— 词库（tab 页 selected:2）
// 严格对照 H5 src/views/Dictionary.vue 复刻三视图，三视图都「先显示全部词语」：
//   ① 顶部搜索框（前缀搜，300ms 防抖）+ 词/短语胶囊 + 三视图切换（单词/状态/标签）+ 右侧 A-Z 字母条。
//   ② 单词视图：全部词按首字母分组 → 点词条跳详情页 /pages/word-detail。
//   ③ 状态视图：**显示全部词**，每条右侧状态角标（1学习/2复习/3强化/4完成）；
//        status>0 的在每个字母组内排前（对照 H5 getFilteredWordsForStatus）。
//        点词条 → 内联**状态编辑层**（单选 → updateStatus → 刷新该词角标）。
//   ④ 标签视图：**默认显示全部词**，每条下方挂它自己的标签 chip（无标签显示"暂无标签"）；
//        点词条 → 内联**标签编辑层**（chip 多选 + 当前已选态 + 新建标签 → updateWordTag 整体覆盖）。
//        顶部另有可折叠「按标签筛选」面板：勾选多个标签 → listWordsByTags(AND) 只显示同时拥有这些标签的词。
//   ⑤ 「+」浮动按钮 → wx.showActionSheet（添加 / 导入文件 / 中文搜索添加 / 生成分享码 / 使用分享码导入）。
//
// 数据策略（同 H5）：单词一次性全量加载（getWordList limit 100000）内存分组；短语 getPhraseList 全量。
//   进入状态视图 getStatusList（按 word_type 全量，不传 word_id 避免 URL 过长 414）关联到词；
//   进入标签视图 getWordTags（按 word_type 全量，不传 word_id）按 word_id 聚合关联到词。
//   三视图都基于内存里的同一份全量行，切视图只补 status / tags，不重复拉词表。
//
// ⚠️ WXML 不支持方法调用（indexOf 等）：chip 选中态、内联样式串全部在 JS 里预算成扁平字段再渲染。
import {
  getWordList,
  getPhraseList,
  getStatusList,
  getWordTags,
  updateStatus,
  updateWordTag,
  listWordsByTags,
  importWord,
  deleteWord,
  deletePhrase,
  batchDeleteWord,
  batchDeletePhrase
} from '../../services/dictionary'
import { getTagList, addTag } from '../../services/tag'
import { uploadFile, OSS_BUCKET } from '../../services/file'
import type {
  SimpleWord,
  WordStatus,
  WordTag,
  WordType,
  WordStatusCode,
  Tag,
  TaggedWord
} from '../../services/types'

type ViewKey = 'word' | 'status' | 'tag'
type Kind = 'word' | 'phrase'

interface ViewItem {
  key: ViewKey
  label: string
}

/** 视图切换胶囊（单词/状态/标签；"单词"标签随 kind 变"短语"） */
// 视图标签固定（词/短语 已挪到搜索栏左侧切换，第一个视图叫"列表"，不再随 kind 变）
const VIEW_KEYS: { key: ViewKey; label: string }[] = [
  { key: 'word', label: '列表' },
  { key: 'status', label: '状态' },
  { key: 'tag', label: '标签' }
]

/** 状态码（1学习/2复习/3强化/4完成）→ 文案 + 复用 app.wxss 的 .badge-status 修饰类 */
const STATUS_META: Record<WordStatusCode, { text: string; cls: string }> = {
  1: { text: '学习', cls: 'badge-status--new' },
  2: { text: '复习', cls: 'badge-status--learning' },
  3: { text: '强化', cls: 'badge-status--strength' },
  4: { text: '完成', cls: 'badge-status--mastered' }
}

/** 状态编辑弹层的单选项（含各自小圆点修饰类，复刻 word-detail / H5 StatusEditModal） */
const STATUS_OPTIONS: { value: WordStatusCode; label: string; dot: string }[] = [
  { value: 1, label: '学习', dot: 'study' },
  { value: 2, label: '复习', dot: 'review' },
  { value: 3, label: '强化', dot: 'strengthen' },
  { value: 4, label: '完成', dot: 'finish' }
]

/** 标签新建调色板：照搬 tag-manage / H5 colorPalette（12 色） */
const PALETTE: string[] = [
  '#ff6b6b', '#ff9800', '#feca57', '#4ecdc4',
  '#45b7d1', '#1989fa', '#5f27cd', '#ab47bc',
  '#ff9ff3', '#54a0ff', '#07c160', '#969799'
]

/** 「+」操作菜单（对照 H5 actionSheetActions，五项全部可用） */
const ACTION_VALUES = ['add', 'import', 'search-add', 'share-generate', 'share-import'] as const
type ActionValue = (typeof ACTION_VALUES)[number]

/** 自绘操作菜单项：emoji + 标题 + 描述 + 图标底色 + 是否待上线 */
interface ActionItem {
  value: ActionValue
  emoji: string
  title: string
  desc: string
  /** 图标底色（CSS 变量字符串） */
  mode: string
  /** 待上线 → 显示"即将上线"小标（当前全部已上线） */
  soon: boolean
}
const ACTION_ITEMS: ActionItem[] = [
  { value: 'add', emoji: '📝', title: '添加单词', desc: '手动录入新词条', mode: 'var(--mode-study)', soon: false },
  { value: 'import', emoji: '📄', title: '导入文件', desc: '从聊天文件选 txt / csv 批量导入', mode: 'var(--mode-review)', soon: false },
  { value: 'search-add', emoji: '🔎', title: '中文搜索添加', desc: '搜中文释义批量加词', mode: 'var(--mode-strength)', soon: false },
  { value: 'share-generate', emoji: '🔗', title: '生成分享码', desc: '把词库分享给好友', mode: 'var(--mode-spot)', soon: false },
  { value: 'share-import', emoji: '📥', title: '使用分享码导入', desc: '凭码导入好友词条', mode: 'var(--primary)', soon: false }
]

/** 一次性全量拉取的 limit（id+word 数据极小，几百~几千条一次拉完） */
const FULL_LIMIT = 100000

/** 左滑露出的按钮区总宽（rpx）：状态/标签/删除 三按钮，每钮 120rpx ×3。与 wxss 的 .wb-row__actions 宽度一致 */
const ACTIONS_WIDTH = 360

/** 词条挂的标签 chip（标签视图行内展示用） */
interface RowTag {
  id: number
  name: string
  style: string
}

/** WXML 渲染用的词条行 */
interface Row {
  id: number
  word: string
  /** 该词条状态码（0=未标记，不渲染角标） */
  status: WordStatusCode | 0
  /** 状态角标文案（status>0 时有值） */
  statusText: string
  /** 状态角标修饰类 */
  statusCls: string
  /** 该词条挂的标签 chip（标签视图展示；空数组=暂无标签） */
  tags: RowTag[]
  /** 是否处于左滑打开态（露出三按钮）。位移由 WXS 在渲染层驱动，这里只存"开/关"供程序化收起与 change 观察器同步 */
  open: boolean
  /** 多选模式下是否勾选 */
  checked: boolean
}

/** 字母分组：{ letter, rows[] } */
interface LetterGroup {
  letter: string
  rows: Row[]
}

/**
 * 标签编辑弹层里的可选标签项。
 * WXML 不支持方法调用，故"是否选中"与选中态内联样式预算好。
 */
interface TagOption {
  id: number
  name: string
  /** 选中态背景色（内联 style 字符串） */
  style: string
  /** 是否已选中（驱动 chip 高亮） */
  selected: boolean
}

/** 取首字母分组键：a-z 取小写首字母，其余归到 '#' */
function letterKeyOf(word: string): string {
  const c = (word.trim().charAt(0) || '#').toLowerCase()
  return /[a-z]/.test(c) ? c : '#'
}

/** 按首字母把行分组并排序（'#' 排最后），组内可选 status 优先排前。返回 LetterGroup[]。
 *  每行做一次浅拷贝并把左滑/勾选等临时态归零：渲染产物与 _rows 不共享同一引用，
 *  后续 setData 改 open/checked 时不会污染真源 _rows，重渲也总是干净起点。 */
function groupByLetter(rows: Row[], statusFirst = false): LetterGroup[] {
  const map: Record<string, Row[]> = {}
  for (const r of rows) {
    const k = letterKeyOf(r.word)
    if (!map[k]) map[k] = []
    map[k].push({ ...r, open: false, checked: false })
  }
  const letters = Object.keys(map).sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })
  return letters.map((letter) => {
    let rs = map[letter]
    if (statusFirst) {
      // 组内：status>0 在前、未标记在后；各自再按字母序（对照 H5 getFilteredWordsForStatus）
      const withStatus = rs.filter((r) => (r.status || 0) > 0)
      const without = rs.filter((r) => (r.status || 0) === 0)
      const byWord = (a: Row, b: Row) =>
        a.word.toLowerCase().localeCompare(b.word.toLowerCase())
      rs = [...withStatus.sort(byWord), ...without.sort(byWord)]
    } else {
      rs = rs.slice().sort((a, b) =>
        a.word.toLowerCase().localeCompare(b.word.toLowerCase())
      )
    }
    return { letter, rows: rs }
  })
}

interface PageData {
  views: { key: ViewKey; label: string }[]
  activeView: ViewKey
  activeKind: Kind
  keyword: string
  loading: boolean
  total: number

  // ---- 列表（三视图共用一套字母分组 + 字母条）----
  letterGroups: LetterGroup[]
  indexLetters: string[]
  activeLetter: string
  scrollIntoId: string

  // ---- 标签筛选面板（标签视图顶部，可折叠）----
  tagPanelOpen: boolean
  filterOptions: TagOption[]
  selectedFilterIds: number[]
  // 筛选 summary（已选 N 个 · M 条 / 全部）
  filterSummary: string
  tagFiltering: boolean

  // ---- 空态 ----
  empty: boolean
  emptyText: string

  // ---- 状态编辑弹层 ----
  statusVisible: boolean
  statusOptions: { value: WordStatusCode; label: string; dot: string }[]
  statusValue: WordStatusCode
  statusSubmitting: boolean
  editWord: string

  // ---- 标签编辑弹层 ----
  tagVisible: boolean
  tagOptions: TagOption[]
  tagSubmitting: boolean
  // 新建标签子表单
  tagCreateOpen: boolean
  tagNewName: string
  tagNewNameTrimmed: boolean
  tagNewColor: string
  tagPalette: string[]
  tagCreating: boolean

  // ---- 「+」操作菜单（自绘底部抽屉）----
  actionVisible: boolean
  actionItems: ActionItem[]

  // ---- 删除交互：多选批删 + 左滑露出三按钮（状态/标签/删除）----
  /** 多选模式开关（进入后点行=勾选，禁用左滑/详情） */
  selectMode: boolean
  /** 已选条数（底部操作条展示用） */
  selectedCount: number
  /** 是否已全选（左侧切换按钮文案用） */
  allSelected: boolean
  /** 左滑按钮区总宽（rpx），供 wxml 绑定按钮区宽度用 */
  actionsWidth: number
  /** 左滑按钮区总宽换算成 px，传给 WXS 做 transform clamp（onLoad 按屏宽算好） */
  actionsWidthPx: number
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    views: VIEW_KEYS.map((v) => ({ key: v.key, label: v.label })),
    activeView: 'word',
    activeKind: 'word',
    keyword: '',
    loading: false,
    total: 0,

    letterGroups: [],
    indexLetters: [],
    activeLetter: '',
    scrollIntoId: '',

    tagPanelOpen: false,
    filterOptions: [],
    selectedFilterIds: [],
    filterSummary: '全部',
    tagFiltering: false,

    empty: false,
    emptyText: '',

    statusVisible: false,
    statusOptions: STATUS_OPTIONS,
    statusValue: 1,
    statusSubmitting: false,
    editWord: '',

    tagVisible: false,
    tagOptions: [],
    tagSubmitting: false,
    tagCreateOpen: false,
    tagNewName: '',
    tagNewNameTrimmed: false,
    tagNewColor: PALETTE[0],
    tagPalette: PALETTE,
    tagCreating: false,

    actionVisible: false,
    actionItems: [],

    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    actionsWidth: ACTIONS_WIDTH,
    // 初值按设计宽 750rpx/2 估个 px，onLoad 拿到真实屏宽后覆盖
    actionsWidthPx: ACTIONS_WIDTH / 2
  },

  // 搜索防抖计时器
  _searchTimer: 0 as number,
  // 滚动定位字母高亮的节流锁
  _scrollSpyLock: false,
  // 当前全量行（按当前 kind + 关键词拉到的全部）。三视图基于它分组/补 status/补 tags，不重复请求。
  _rows: [] as Row[],
  // status 是否已关联到 _rows（首次切到状态视图时拉一次；切 kind / 重搜时失效）
  _statusLoaded: false,
  // tags 是否已关联到 _rows（首次切到标签视图时拉一次；切 kind / 重搜时失效）
  _tagsLoaded: false,
  // 标签全集（编辑弹层 + 筛选面板共用；getTagList 一次拉全量）
  _allTags: [] as Tag[],
  // 标签全集是否已拉
  _allTagsLoaded: false,
  // 当前正在编辑（状态/标签弹层）的词条 id
  _editId: 0,

  // ---- 左滑打开态追踪 ----
  // 手势位移在 WXS 渲染层直接驱动（不过桥），逻辑层只记"哪一行开着"：维持一次只一行、支持程序化收起。
  // 当前左滑打开的行 id（0=无），配合 _openG/_openR 做定向 setData 收起。
  _openId: 0,
  _openG: -1,
  _openR: -1,
  // px→rpx 换算比例（设计宽 750rpx）。onLoad 一次算好，把 ACTIONS_WIDTH(rpx) 换成 px 传给 WXS clamp。
  _rpxRatio: 2,

  onLoad() {
    // 实例级可变状态显式初始化：保证 onShow 读 this._rows 前它已存在。
    // （声明式类字段在部分编译/运行态下可能未挂到实例上，导致 this._rows undefined 崩溃。）
    this._rows = []
    this._statusLoaded = false
    this._tagsLoaded = false
    this._allTags = []
    this._allTagsLoaded = false
    this._editId = 0
    this._scrollSpyLock = false
    // 左滑打开态
    this._openId = 0
    this._openG = -1
    this._openR = -1
    // px→rpx 换算比例（设计宽 750rpx）。一次算好，把按钮区宽度换成 px 传 WXS。
    let winW = 375
    try {
      winW = wx.getSystemInfoSync().windowWidth || 375
    } catch (e) {
      winW = 375
    }
    this._rpxRatio = 750 / winW
    // ACTIONS_WIDTH 是 rpx；px = rpx / (750/winW) = rpx / _rpxRatio
    this.setData({ actionsWidthPx: ACTIONS_WIDTH / this._rpxRatio })
  },

  onShow() {
    // tab 页：词库 = 索引 2；并确保 tabBar 复位为显示（防从弹层中途 navigate 走后留隐藏态）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ selected: 2, hidden: false })
    }
    // 防御：极端情况下 _rows 仍未初始化也不崩
    if (!this._rows) this._rows = []
    // 脏标记：分享导入等外部页改了词库后置 'wordbook_dirty'，回到本页强制全量重载。
    const dirty = wx.getStorageSync('wordbook_dirty')
    if (dirty) {
      wx.removeStorageSync('wordbook_dirty')
      if (!this.data.loading) {
        this.reload()
      }
      return
    }
    if (this._rows.length === 0 && !this.data.loading) {
      this.reload()
    }
  },

  onUnload() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = 0
    }
  },

  /** 当前 kind 对应的 word_type（1单词 / 2短语） */
  _wordType(): WordType {
    return this.data.activeKind === 'phrase' ? 2 : 1
  },

  /**
   * 从头加载当前 kind + 关键词的全量列表，关联失效，按当前视图装配。
   * 切 kind / 改关键词 / 下拉刷新时调用。
   */
  async reload() {
    this.setData({ loading: true, empty: false })
    wx.showLoading({ title: '加载中', mask: true })
    try {
      this._rows = await this._fetchAll()
      // 词表变了，status / tags 关联全部失效，切到对应视图时重拉
      this._statusLoaded = false
      this._tagsLoaded = false
      this.setData({ total: this._rows.length })
      await this._renderView(this.data.activeView)
    } catch (e) {
      this._rows = []
      this.setData({
        total: 0,
        letterGroups: [],
        indexLetters: [],
        empty: true,
        emptyText: this.data.keyword ? '没有匹配的词条' : '词库还是空的'
      })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  /** 按当前 kind + 关键词全量拉取词条，转成 Row[]（status/tags 留空，按视图再补） */
  async _fetchAll(): Promise<Row[]> {
    const prefix = this.data.keyword.trim()
    let items: SimpleWord[] = []
    if (this.data.activeKind === 'phrase') {
      const page = await getPhraseList({
        offset: 0,
        limit: FULL_LIMIT,
        ...(prefix ? { phrase_prefix: prefix } : {})
      })
      items = page.data || []
    } else {
      const page = await getWordList({
        offset: 0,
        limit: FULL_LIMIT,
        ...(prefix ? { word_prefix: prefix } : {})
      })
      items = page.data || []
    }
    return items.map((w) => ({
      id: w.id,
      word: w.word,
      status: 0 as WordStatusCode | 0,
      statusText: '',
      statusCls: '',
      tags: [] as RowTag[],
      open: false,
      checked: false
    }))
  },

  /** 按 key 渲染对应视图（状态/标签视图会先确保关联数据已就绪） */
  async _renderView(view: ViewKey) {
    if (view === 'status') {
      if (!this._statusLoaded) await this._loadStatus()
    } else if (view === 'tag') {
      if (!this._tagsLoaded) await this._loadTags()
      // 标签视图额外需要标签全集（筛选面板 chip）
      if (!this._allTagsLoaded) await this._ensureAllTags()
      this._rebuildFilterOptions()
    }
    this._renderList()
  },

  /**
   * 状态视图数据：一次性拉该用户该类型全部 status（不传 word_id，避免拼几百 id 进 URL 触发 414），
   * 关联到每行（对照 H5 loadStatusData）。失败则全部归"未标记"。
   */
  async _loadStatus() {
    let statusMap: Record<number, WordStatusCode> = {}
    try {
      const statuses: WordStatus[] = await getStatusList({
        offset: 0,
        limit: FULL_LIMIT,
        word_type: this._wordType()
      })
      statusMap = statuses.reduce((acc, s) => {
        acc[s.word_id] = s.status
        return acc
      }, {} as Record<number, WordStatusCode>)
    } catch (e) {
      statusMap = {}
    }
    this._rows = this._rows.map((r: Row) => {
      const s = statusMap[r.id]
      const meta = s ? STATUS_META[s] : undefined
      return {
        ...r,
        status: (s || 0) as WordStatusCode | 0,
        statusText: meta ? meta.text : '',
        statusCls: meta ? meta.cls : ''
      }
    })
    this._statusLoaded = true
  },

  /**
   * 标签视图数据：一次性拉该用户该类型全部 word_tag（不传 word_id），按 word_id 聚合后
   * 关联到每行（对照 H5 groupTagsByWordId + loadTagData）。失败则各行无标签。
   */
  async _loadTags() {
    let tagMap: Record<number, RowTag[]> = {}
    try {
      // word_id 传空数组：buildQuery 跳过空数组 → URL 仅含 word_type，等价 H5 不传 ids 取全量
      const rows: WordTag[] = await getWordTags({
        word_id: [],
        word_type: this._wordType()
      })
      tagMap = rows.reduce((acc, r) => {
        const wid = r.word_id
        if (wid == null) return acc
        if (!acc[wid]) acc[wid] = []
        acc[wid].push({ id: r.tag_id, name: r.name, style: r.style || '#3DA5F4' })
        return acc
      }, {} as Record<number, RowTag[]>)
    } catch (e) {
      tagMap = {}
    }
    this._rows = this._rows.map((r: Row) => ({ ...r, tags: tagMap[r.id] || [] }))
    this._tagsLoaded = true
  },

  /** 确保标签全集已拉（筛选面板 / 编辑弹层共用） */
  async _ensureAllTags() {
    try {
      this._allTags = (await getTagList()) || []
    } catch (e) {
      this._allTags = []
    }
    this._allTagsLoaded = true
  },

  /**
   * 渲染列表区：
   *   - 标签视图且有勾选筛选标签：用 listWordsByTags（AND）结果分组（不复用全量行）。
   *   - 其余（单词/状态/标签未筛选）：用内存全量行分组；状态视图组内 status 优先。
   */
  _renderList(forceFilter = false) {
    // 列表重建 → 所有行回到关闭态，清掉打开追踪
    this._openId = 0
    this._openG = -1
    this._openR = -1
    const view = this.data.activeView
    // 标签视图 + 已勾选筛选标签 → 走服务端 AND 筛选（异步），其余走全量内存分组
    if (view === 'tag' && this.data.selectedFilterIds.length > 0) {
      if (forceFilter || !this.data.tagFiltering) this._applyTagFilter()
      return
    }
    const statusFirst = view === 'status'
    const groups = groupByLetter(this._rows, statusFirst)
    const letters = groups.map((g) => g.letter)
    this.setData({
      letterGroups: groups,
      indexLetters: letters,
      activeLetter: letters[0] || '',
      empty: this._rows.length === 0,
      emptyText: this.data.keyword ? '没有匹配的词条' : '词库还是空的'
    })
    this._updateFilterSummary()
  },

  /**
   * 标签 AND 筛选：listWordsByTags(tag_ids 重复键, AND)，只显示同时拥有这些标签的词。
   * 对照 H5 fetchTagFilter + displayWordsByLetter（筛选时用结果，否则用全量）。
   */
  async _applyTagFilter() {
    // 列表重建 → 清打开追踪
    this._openId = 0
    this._openG = -1
    this._openR = -1
    const ids = this.data.selectedFilterIds
    if (!ids.length) {
      this._renderList()
      return
    }
    this.setData({ tagFiltering: true })
    try {
      const result: TaggedWord[] = await listWordsByTags({
        tag_ids: ids,
        word_type: this._wordType()
      })
      const rows: Row[] = (result || []).map((t) => ({
        id: t.id,
        word: t.word,
        status: 0 as WordStatusCode | 0,
        statusText: '',
        statusCls: '',
        tags: (t.tags || []).map((tg) => ({
          id: tg.id,
          name: tg.name,
          style: tg.style || '#3DA5F4'
        })),
        open: false,
        checked: false
      }))
      const groups = groupByLetter(rows)
      const letters = groups.map((g) => g.letter)
      this.setData({
        letterGroups: groups,
        indexLetters: letters,
        activeLetter: letters[0] || '',
        empty: rows.length === 0,
        emptyText: '没有同时拥有这些标签的词条'
      })
      this._updateFilterSummary(rows.length)
    } catch (e) {
      this.setData({
        letterGroups: [],
        indexLetters: [],
        empty: true,
        emptyText: '没有同时拥有这些标签的词条'
      })
    } finally {
      this.setData({ tagFiltering: false })
    }
  },

  /** 刷新筛选 summary 文案：已选 N 个 · M 条 / 全部 */
  _updateFilterSummary(filteredCount?: number) {
    const n = this.data.selectedFilterIds.length
    if (n === 0) {
      this.setData({ filterSummary: '全部' })
      return
    }
    const m = filteredCount == null ? this.data.letterGroups.reduce(
      (acc, g) => acc + g.rows.length, 0
    ) : filteredCount
    this.setData({ filterSummary: '已选 ' + n + ' 个 · ' + m + ' 条' })
  },

  /** 用 _allTags + selectedFilterIds 预算筛选面板 chip（含 selected / 内联色），WXML 不能调 indexOf */
  _rebuildFilterOptions() {
    const selected = this.data.selectedFilterIds
    const options: TagOption[] = this._allTags.map((t: Tag) => {
      const color = t.style || '#3DA5F4'
      return {
        id: t.id,
        name: t.name,
        style: 'background:' + color + ';border-color:' + color,
        selected: selected.indexOf(t.id) >= 0
      }
    })
    this.setData({ filterOptions: options })
  },

  /* ===================== 顶部交互：切视图 / 切 kind / 搜索 / 字母条 ===================== */

  /** 切视图（单词/状态/标签）。复用内存全量行，按需补 status / 拉标签。
   *  切视图前退出多选 / 收起左滑（避免跨视图残留勾选/激活态）。 */
  async onSwitchView(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as ViewKey
    if (key === this.data.activeView) return
    if (this.data.selectMode) this.exitSelectMode()
    this.setData({ activeView: key, scrollIntoId: '' })
    await this._renderView(key)
  },

  /** 切 词 / 短语（搜索栏左侧 toggle，二选一）。整列表换源 → 退出多选、收起左滑、全量重载。 */
  async onToggleKind() {
    const kind: Kind = this.data.activeKind === 'phrase' ? 'word' : 'phrase'
    if (this.data.selectMode) this.exitSelectMode()
    this.setData({ activeKind: kind, scrollIntoId: '' })
    await this.reload()
  },

  /** 搜索输入：300ms 防抖后按前缀全量重查并重渲当前视图。 */
  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.reload()
    }, 300) as unknown as number
  },

  /** 点击右侧字母条：scroll-into-view 跳到对应首字母分组锚点。 */
  onTapLetter(e: WechatMiniprogram.TouchEvent) {
    const letter = e.currentTarget.dataset.letter as string
    if (!letter) return
    this.setData({ activeLetter: letter, scrollIntoId: 'letter-' + letter })
  },

  /**
   * 滚动定位：列表滚动时算出当前顶部对应的字母组，高亮右侧字母条对应项。
   * 节流 80ms；用 SelectorQuery 取各分组相对滚动容器顶部的位置，找最后一个已越过顶部的组。
   */
  onListScroll() {
    if (this._scrollSpyLock) return
    this._scrollSpyLock = true
    setTimeout(() => {
      this._scrollSpyLock = false
    }, 80)
    const q = wx.createSelectorQuery()
    q.select('.wb-az__scroll').boundingClientRect()
    q.selectAll('.wb-group').boundingClientRect()
    q.exec((res: any[]) => {
      const box = res && res[0]
      const groups = (res && res[1]) || []
      if (!box || !groups.length) return
      // 容器顶部稍下 6px 处作为判定线
      const line = box.top + 6
      let activeId = ''
      for (const g of groups) {
        if (g.top <= line) activeId = g.id
        else break
      }
      if (activeId) {
        const letter = activeId.replace('letter-', '')
        if (letter && letter !== this.data.activeLetter) {
          this.setData({ activeLetter: letter })
        }
      }
    })
  },

  /* ===================== 列表项点击 → 内联编辑 / 跳详情 ===================== */

  /**
   * 列表项点击（bindtap）。删除交互接入后分三种处置：
   *   - 多选模式：toggle 勾选（不进详情、不滑）。
   *   - 普通模式且本行处于「滑开 / 刚滑过」：仅收起左滑，吞掉本次点击（防误进详情）。
   *   - 其余：统一进单词详情（三视图一致；状态/标签编辑改走左滑按钮）。
   */
  onTapItem(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    if (this.data.selectMode) {
      this._toggleCheckedAt(
        Number(e.currentTarget.dataset.g),
        Number(e.currentTarget.dataset.r)
      )
      return
    }
    // 有行处于「左滑打开」态时：
    //   - 点的就是这一行（3 按钮外的内容区）→ 仅滑动收回，不进详情；
    //   - 点的是别的行 → 收起打开的行 + 进被点行的详情。
    // 真正左滑的手势位移很大、框架不会判成 tap，故无需额外的"滑动吞点击"标记。
    if (this._openId) {
      if (id === this._openId) {
        this._closeAllSwipe()
        return
      }
      this._closeAllSwipe()
      this._openRow(id)
      return
    }
    // 没有打开的行 → 直接进单词详情
    this._openRow(id)
  },

  /** 统一进单词详情（三视图一致）。状态/标签编辑改走左滑按钮，不再按视图分派。 */
  _openRow(id: number) {
    wx.navigateTo({
      url: `/pages/word-detail/word-detail?id=${id}&type=${this._wordType()}`,
      fail: () => wx.showToast({ title: '详情页开发中', icon: 'none' })
    })
  },

  /** 按 id 在当前展示的分组里找词条文本（弹层标题用） */
  _findWord(id: number): string {
    for (const g of this.data.letterGroups) {
      const hit = g.rows.find((r) => r.id === id)
      if (hit) return hit.word
    }
    return ''
  },

  /** 按 id 在当前展示的分组里找词条已挂标签 id 集合（标签弹层预选用） */
  _findRowTagIds(id: number): number[] {
    for (const g of this.data.letterGroups) {
      const hit = g.rows.find((r) => r.id === id)
      if (hit) return (hit.tags || []).map((t) => t.id)
    }
    return []
  },

  /* ===================== 删除交互：左滑/勾选行的二维定位与批量改写工具 ===================== */

  /** 收起当前打开的行（点空白/进多选/切视图/点状态·标签·删除前调用）。
   *  设 open=false → WXS 的 change:swopen 观察器在渲染层把它滑回 0。 */
  _closeAllSwipe() {
    if (!this._openId) return
    const g = this._openG
    const r = this._openR
    const grp = this.data.letterGroups[g]
    const cur = grp ? grp.rows[r] : undefined
    if (cur && cur.open) {
      this.setData({ [`letterGroups[${g}].rows[${r}].open`]: false })
    }
    this._openId = 0
    this._openG = -1
    this._openR = -1
  },

  /* ===================== 左滑露出三按钮：手势位移在 WXS 渲染层执行(见 swipe.wxs)，逻辑层只在松手后同步开/关 ===================== */

  /**
   * WXS end() 松手定开/关后 callMethod 回来（渲染层 → 逻辑层，一次，不逐帧）。
   * 维持"同一时刻只一行打开"：若新开了一行，先把上一打开行 open 置 false（其 WXS 观察器自动滑回）。
   * g/r 取自手势那一刻 dataset，对应当前渲染的 letterGroups，定向 setData 不整表回传。
   */
  onSwipeSettle(detail: { id: number; g: number; r: number; open: boolean }) {
    const id = Number(detail.id)
    const g = Number(detail.g)
    const r = Number(detail.r)
    const open = !!detail.open
    if (open) {
      // 先关上一行（存在且非本行）
      if (this._openId && this._openId !== id) {
        const pg = this.data.letterGroups[this._openG]
        const pcur = pg ? pg.rows[this._openR] : undefined
        if (pcur && pcur.open) {
          this.setData({
            [`letterGroups[${this._openG}].rows[${this._openR}].open`]: false
          })
        }
      }
      this.setData({ [`letterGroups[${g}].rows[${r}].open`]: true })
      this._openId = id
      this._openG = g
      this._openR = r
    } else {
      this.setData({ [`letterGroups[${g}].rows[${r}].open`]: false })
      if (this._openId === id) {
        this._openId = 0
        this._openG = -1
        this._openR = -1
      }
    }
  },

  /** 点左滑露出的「状态」按钮（catchtap）：复用状态编辑弹层 */
  onSwipeStatus(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    this._closeAllSwipe()
    this._openStatusModal(id)
  },

  /** 点左滑露出的「标签」按钮（catchtap）：复用标签编辑弹层 */
  onSwipeTag(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    this._closeAllSwipe()
    this._openTagModal(id)
  },

  /** 点左滑露出的「删除」按钮（catchtap）：二次确认 → 按 kind 单删 → 就地移除 */
  onSwipeDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    const phrase = this.data.activeKind === 'phrase'
    wx.showModal({
      title: '确认删除',
      content: '确定删除这个' + (phrase ? '短语' : '单词') + '吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (phrase) await deletePhrase(id)
          else await deleteWord(id)
          this._removeFromList([id])
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          // request 层已统一 toast
        }
      }
    })
  },

  /* ===================== 多选批删模式 ===================== */

  /** 顶部「多选 / 取消」入口（同一按钮 toggle） */
  onToggleSelectMode() {
    if (this.data.selectMode) this.exitSelectMode()
    else this.enterSelectMode()
  },

  /** 进入多选模式：收起全部左滑、清空勾选、归零计数 */
  enterSelectMode() {
    const groups = this.data.letterGroups.map((grp) => ({
      letter: grp.letter,
      rows: grp.rows.map((row) =>
        row.open || row.checked
          ? { ...row, open: false, checked: false }
          : row
      )
    }))
    this._openId = 0
    this._openG = -1
    this._openR = -1
    this.setData({
      letterGroups: groups,
      selectMode: true,
      selectedCount: 0,
      allSelected: false
    })
    this._setTabBarHidden(true) // 多选底部操作条也会被 tabBar 盖住，进入多选即隐藏 tabBar
  },

  /** 退出多选模式：清空勾选 */
  exitSelectMode() {
    const groups = this.data.letterGroups.map((grp) => ({
      letter: grp.letter,
      rows: grp.rows.map((row) =>
        row.checked ? { ...row, checked: false } : row
      )
    }))
    this.setData({
      letterGroups: groups,
      selectMode: false,
      selectedCount: 0,
      allSelected: false
    })
    this._setTabBarHidden(false)
  },

  /** 按 id toggle 某行勾选（多选模式下点行调用） */
  _toggleCheckedAt(g: number, r: number) {
    const grp = this.data.letterGroups[g]
    const cur = grp ? grp.rows[r] : undefined
    if (!cur) return
    // 数据路径 setData：只改这一行的 checked，不整表重传 → 大词库勾选不卡
    this.setData({ [`letterGroups[${g}].rows[${r}].checked`]: !cur.checked })
    this._syncSelection()
  },

  /** 遍历所有分组刷新底部计数 / 全选标志 */
  _syncSelection() {
    let total = 0
    let checked = 0
    for (const g of this.data.letterGroups) {
      for (const r of g.rows) {
        total++
        if (r.checked) checked++
      }
    }
    this.setData({
      selectedCount: checked,
      allSelected: total > 0 && checked === total
    })
  },

  /** 当前勾选的 id 列表 */
  _selectedIds(): number[] {
    const ids: number[] = []
    for (const g of this.data.letterGroups) {
      for (const r of g.rows) {
        if (r.checked) ids.push(r.id)
      }
    }
    return ids
  },

  /** 全选 / 取消全选切换 */
  onToggleSelectAll() {
    const target = !this.data.allSelected
    const groups = this.data.letterGroups.map((grp) => ({
      letter: grp.letter,
      rows: grp.rows.map((row) =>
        row.checked === target ? row : { ...row, checked: target }
      )
    }))
    this.setData({ letterGroups: groups })
    this._syncSelection()
  },

  /** 批量删除：二次确认 → 按 kind 批删 → 就地移除 + 退出多选 */
  onBatchDelete() {
    const ids = this._selectedIds()
    if (!ids.length) return
    const phrase = this.data.activeKind === 'phrase'
    wx.showModal({
      title: '确认删除',
      content:
        '确定删除选中的 ' + ids.length + ' 个' +
        (phrase ? '短语' : '单词') + '吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const n = phrase
            ? await batchDeletePhrase(ids)
            : await batchDeleteWord(ids)
          this._removeFromList(ids)
          this.exitSelectMode()
          wx.showToast({ title: '已删除 ' + n + ' 个', icon: 'success' })
        } catch (err) {
          // 已 toast
        }
      }
    })
  },

  /**
   * 删除成功后就地移除若干 id：
   *   1) 从内存真源 _rows 删（保证三视图切换/重渲不再出现已删项）；
   *   2) 从当前 letterGroups 删（即时反映，免整页重渲抖动）；
   *   3) 同步 total / 空态；若当前在多选态还同步底部计数。
   * 标签 AND 筛选态下 letterGroups 来自 listWordsByTags（不源自 _rows），同样直接按 id 过滤即可。
   */
  _removeFromList(ids: number[]) {
    if (!ids || !ids.length) return
    // 列表行索引会因删除整体前移 → 清掉左滑打开追踪，防 _openG/_openR 指向错行（防御性）
    this._openId = 0
    this._openG = -1
    this._openR = -1
    const removeSet: Record<number, boolean> = {}
    for (const id of ids) removeSet[id] = true
    // 真源 _rows 同步删
    this._rows = this._rows.filter((r: Row) => !removeSet[r.id])
    // 当前展示的分组同步删（删空的字母组整组移除）
    const groups: LetterGroup[] = []
    for (const grp of this.data.letterGroups) {
      const rows = grp.rows.filter((row) => !removeSet[row.id])
      if (rows.length) groups.push({ letter: grp.letter, rows })
    }
    const letters = groups.map((g) => g.letter)
    const empty = groups.length === 0
    // 空态文案：标签 AND 筛选态用「没有同时拥有这些标签的词条」，否则按是否在搜索区分
    const inTagFilter =
      this.data.activeView === 'tag' && this.data.selectedFilterIds.length > 0
    const emptyText = inTagFilter
      ? '没有同时拥有这些标签的词条'
      : (this.data.keyword ? '没有匹配的词条' : '词库还是空的')
    this.setData({
      letterGroups: groups,
      indexLetters: letters,
      activeLetter: letters.indexOf(this.data.activeLetter) >= 0
        ? this.data.activeLetter
        : (letters[0] || ''),
      total: this._rows.length,
      empty,
      emptyText
    })
    // 标签 AND 筛选态下「· M 条」随删除变化，刷新 summary（其余视图无 summary 影响）
    if (this.data.activeView === 'tag' && this.data.selectedFilterIds.length > 0) {
      this._updateFilterSummary()
    }
    if (this.data.selectMode) this._syncSelection()
  },

  /* ===================== 状态编辑弹层（对照 H5 StatusEditModal） ===================== */

  _openStatusModal(id: number) {
    this._editId = id
    // 取当前角标状态作为默认选中（无则默认"学习"=1）
    let cur: WordStatusCode = 1
    for (const g of this.data.letterGroups) {
      const hit = g.rows.find((r) => r.id === id)
      if (hit && (hit.status || 0) > 0) {
        cur = hit.status as WordStatusCode
        break
      }
    }
    this.setData({
      statusVisible: true,
      statusValue: cur,
      statusSubmitting: false,
      editWord: this._findWord(id)
    })
    this._setTabBarHidden(true)
  },

  closeStatusEdit() {
    this.setData({ statusVisible: false })
    this._setTabBarHidden(false)
  },

  /** 隐藏/显示自定义 tabBar：弹层打开时隐藏，避免它盖住弹层底部按钮（框架 tabBar 在独立层，z-index 盖不住） */
  _setTabBarHidden(hidden: boolean) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar()!.setData({ hidden })
    }
  },

  onStatusPick(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value) as WordStatusCode
    if (value >= 1 && value <= 4) this.setData({ statusValue: value })
  },

  /** 提交状态：updateStatus → 本地回填该词角标 + 重渲列表 */
  async onStatusSubmit() {
    if (this.data.statusSubmitting || !this._editId) return
    this.setData({ statusSubmitting: true })
    try {
      const status = this.data.statusValue
      await updateStatus({
        word_id: this._editId,
        word_type: this._wordType(),
        status
      })
      // 本地回填角标（_rows 是真源，重渲后字母组内 status 优先排序也会刷新）
      const meta = STATUS_META[status]
      this._rows = this._rows.map((r: Row) =>
        r.id === this._editId
          ? { ...r, status, statusText: meta.text, statusCls: meta.cls }
          : r
      )
      wx.showToast({ title: '状态已更新', icon: 'success' })
      this.setData({ statusVisible: false })
      this._setTabBarHidden(false)
      this._renderList()
    } catch (e) {
      // request 层已统一 toast
    } finally {
      this.setData({ statusSubmitting: false })
    }
  },

  /* ===================== 标签编辑弹层（对照 H5 TagEditModal） ===================== */

  /** 打开标签弹层：确保标签全集就绪，用当前行已挂标签预选；新建表单复位 */
  async _openTagModal(id: number) {
    this._editId = id
    this.setData({
      tagVisible: true,
      tagSubmitting: false,
      tagCreateOpen: false,
      tagNewName: '',
      tagNewNameTrimmed: false,
      tagNewColor: PALETTE[0],
      editWord: this._findWord(id)
    })
    this._setTabBarHidden(true)
    if (!this._allTagsLoaded) {
      wx.showLoading({ title: '加载中', mask: false })
      await this._ensureAllTags()
      wx.hideLoading()
    }
    this._rebuildTagOptions(this._findRowTagIds(id))
  },

  closeTagEdit() {
    this.setData({ tagVisible: false })
    this._setTabBarHidden(false)
  },

  /** 用 _allTags + 选中 id 集合预算编辑弹层 chip（含 selected / 选中态内联色） */
  _rebuildTagOptions(selectedIds: number[]) {
    const options: TagOption[] = this._allTags.map((t: Tag) => {
      const color = t.style || '#3DA5F4'
      return {
        id: t.id,
        name: t.name,
        style: 'background:' + color,
        selected: selectedIds.indexOf(t.id) >= 0
      }
    })
    this.setData({ tagOptions: options })
  },

  /** 切换某标签选中态：data-id */
  onTagToggle(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const options = this.data.tagOptions.map((t) =>
      t.id === id ? { ...t, selected: !t.selected } : t
    )
    this.setData({ tagOptions: options })
  },

  // ---- 新建标签子表单 ----
  openTagCreate() {
    this.setData({
      tagCreateOpen: true,
      tagNewName: '',
      tagNewNameTrimmed: false,
      tagNewColor: PALETTE[0]
    })
  },

  cancelTagCreate() {
    this.setData({ tagCreateOpen: false, tagNewName: '' })
  },

  onTagNameInput(e: WechatMiniprogram.Input) {
    const name = e.detail.value
    this.setData({ tagNewName: name, tagNewNameTrimmed: !!name.trim() })
  },

  onTagColorPick(e: WechatMiniprogram.TouchEvent) {
    const color = e.currentTarget.dataset.color as string
    if (color) this.setData({ tagNewColor: color })
  },

  /** 创建标签 → addTag → 重拉全量并保留已选、自动选中刚建的（按名字匹配） */
  async createTag() {
    const name = this.data.tagNewName.trim()
    if (!name || this.data.tagCreating) return
    this.setData({ tagCreating: true })
    try {
      await addTag({ name, style: this.data.tagNewColor })
      const prevSelected = new Set(
        this.data.tagOptions.filter((t) => t.selected).map((t) => t.id)
      )
      // 重拉全量（含刚建的）
      this._allTags = (await getTagList()) || []
      this._allTagsLoaded = true
      const options: TagOption[] = this._allTags.map((t: Tag) => {
        const color = t.style || '#3DA5F4'
        return {
          id: t.id,
          name: t.name,
          style: 'background:' + color,
          selected: prevSelected.has(t.id) || t.name === name
        }
      })
      this.setData({
        tagOptions: options,
        tagCreateOpen: false,
        tagNewName: '',
        tagNewNameTrimmed: false
      })
      // 筛选面板也用同一份全集，标记其待重建
      wx.showToast({ title: '已新建', icon: 'success' })
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ tagCreating: false })
    }
  },

  /** 提交标签：updateWordTag 整体覆盖（tags=当前全部选中；空数组=清空），本地回填该行标签 */
  async onTagSubmit() {
    if (this.data.tagSubmitting || !this._editId) return
    this.setData({ tagSubmitting: true })
    try {
      const selected = this.data.tagOptions.filter((t) => t.selected)
      const tags = selected.map((t) => t.id)
      await updateWordTag({
        word_id: this._editId,
        word_type: this._wordType(),
        tags
      })
      // 本地回填该行标签 chip（_rows 真源）
      const rowTags: RowTag[] = selected.map((t) => ({
        id: t.id,
        name: t.name,
        style: (t.style.replace('background:', '') || '#3DA5F4')
      }))
      this._rows = this._rows.map((r: Row) =>
        r.id === this._editId ? { ...r, tags: rowTags } : r
      )
      wx.showToast({ title: '标签已更新', icon: 'success' })
      this.setData({ tagVisible: false })
      this._setTabBarHidden(false)
      // 若当前在筛选态，标签变了可能影响命中 → 重跑筛选；否则重渲全量
      this._renderList(true)
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ tagSubmitting: false })
    }
  },

  /* ===================== 标签筛选面板（对照 H5 tag-filter-panel） ===================== */

  onToggleTagPanel() {
    this.setData({ tagPanelOpen: !this.data.tagPanelOpen })
  },

  /** 勾选 / 取消筛选标签，重算面板 chip 并重做 AND 筛选 */
  onToggleFilterTag(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    const set = this.data.selectedFilterIds.slice()
    const i = set.indexOf(id)
    if (i >= 0) set.splice(i, 1)
    else set.push(id)
    this.setData({ selectedFilterIds: set })
    this._rebuildFilterOptions()
    this._renderList(true)
  },

  /** 清空筛选 → 回到显示全部 */
  onClearFilter() {
    if (!this.data.selectedFilterIds.length) return
    this.setData({ selectedFilterIds: [] })
    this._rebuildFilterOptions()
    this._renderList()
  },

  /* ===================== 「+」浮动按钮 → 操作菜单（对照 H5 actionSheetActions） ===================== */

  /** 打开自绘操作菜单（添加项标题随 词/短语 变） */
  onTapFab() {
    const phrase = this.data.activeKind === 'phrase'
    const items = ACTION_ITEMS.map((it) =>
      it.value === 'add'
        ? {
            ...it,
            title: phrase ? '添加短语' : '添加单词',
            desc: phrase ? '手动录入新短语' : '手动录入新词条'
          }
        : it
    )
    this.setData({ actionItems: items, actionVisible: true })
    this._setTabBarHidden(true)
  },

  closeAction() {
    this.setData({ actionVisible: false })
    this._setTabBarHidden(false)
  },

  /** 菜单项点击分派：add 跳新增页 / import 走聊天文件导入流 / 其余跳各自功能页 */
  onActionItem(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value as ActionValue
    this.setData({ actionVisible: false })
    this._setTabBarHidden(false)
    if (value === 'add') {
      wx.navigateTo({ url: `/pages/word-add/word-add?type=${this._wordType()}` })
      return
    }
    if (value === 'import') {
      this.importFromFile()
      return
    }
    const urls: Record<string, string> = {
      'search-add': '/pages/search-add/search-add',
      'share-generate': '/pages/share-generate/share-generate',
      'share-import': '/pages/share-import/share-import'
    }
    wx.navigateTo({ url: urls[value] })
  },

  /**
   * 导入文件流（对照 H5 handleImportFile）：
   *   选文件(小程序只能从聊天记录选: wx.chooseMessageFile, 限 txt/csv)
   *   → 上传 englishstudy 桶 import/{ts}_{name}（同 H5 命名）
   *   → POST operation/import 建异步任务 → 跳导入历史页看实时进度。
   */
  importFromFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'csv'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        wx.showLoading({ title: '正在上传文件', mask: true })
        try {
          const object = `import/${Date.now()}_${file.name}`
          const path = await uploadFile(file.path, OSS_BUCKET, object)
          await importWord(path, file.name)
          wx.hideLoading()
          wx.showToast({ title: '导入任务已创建', icon: 'success' })
          // 直接带去历史页看进度（3s 轮询），免得用户找不到入口
          wx.navigateTo({ url: '/pages/import-history/import-history' })
        } catch (err) {
          wx.hideLoading()
          // uploadFile 不走 request.ts 不会自动 toast；importWord 失败已 toast，重复一次无害
          const msg = err instanceof Error ? err.message : '导入失败'
          wx.showToast({ title: msg, icon: 'none' })
        }
      }
      // 用户取消选文件 → fail 静默，无需提示
    })
  },

  /** 弹层面板内部点击占位（阻止 catchtap 冒泡到遮罩关闭） */
  noop() {},

  /** 下拉刷新：标签全集失效 → 全量重载并重渲当前视图 */
  async onPullDownRefresh() {
    this._allTagsLoaded = false
    await this.reload()
    wx.stopPullDownRefresh()
  },

  /** 右上角「···」→ 转发给朋友 */
  onShareAppMessage() {
    return {
      title: '单词记忆助手 · 我的英语词库',
      path: '/pages/home/home'
    }
  }
})
