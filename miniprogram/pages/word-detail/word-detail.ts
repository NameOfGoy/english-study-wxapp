// pages/word-detail/word-detail.ts —— 词条详情（普通页，query 收 id + type）
// 对照 H5 components/dictionary/WordDetailView.vue + PhraseDetailView.vue
//   + StatusEditModal.vue + TagEditModal.vue + TranslationEditModal.vue 复刻交互。
//
// type=1 单词：getWordDetail → 展示 word/英美音标(🔊发音)/各词性 pos(释义/变化形式/例句/配图)。
// type=2 短语：getPhraseDetail → 短语/发音(🔊)/释义/例句/图片。
//
// 顶部操作区四个入口（自绘 fixed 蒙层弹层，无组件库）：
//   ① 释义编辑：单词按 pos 多条 textarea → updateWordTranslation；
//              短语 → updatePhrase（先 getPhraseDetail 拿全字段，只换 translation 整体覆盖）。
//   ② 状态编辑：单选 学习/复习/强化/完成 → updateStatus。
//   ③ 标签编辑：chip 多选已有标签(getTagList) + 可新建(addTag, 12色调色板复用 tag-manage)
//              → updateWordTag 整体覆盖；进入弹层前 getWordTags 取当前已挂标签预选。
//   ④ 删除：wx.showModal 确认 → deleteWord / deletePhrase → navigateBack。
//
// 资源（uk_audio/us_audio/pronunciation/picture）相对 URL → resolveAsset；
// <image> binderror 回退 emoji 占位。发音用 wx.createInnerAudioContext。
import {
  getWordDetail,
  getPhraseDetail,
  getWordTags,
  updateWordTranslation,
  updatePhrase,
  updateStatus,
  updateWordTag,
  deleteWord,
  deletePhrase,
  generateWordPicture,
  updateWordPicture,
  generatePhrasePicture,
  updatePhrasePicture
} from '../../services/dictionary'
import { getTagList, addTag } from '../../services/tag'
import { uploadFile, OSS_BUCKET } from '../../services/file'
import { resolveAsset } from '../../utils/asset'
import parseExamples from '../../utils/parseExamples'
import {
  POS_SW_MAP,
  POS_CN_MAP,
  type Word,
  type WordPhrase,
  type WordType,
  type WordStatusCode,
  type Tag,
  type Example
} from '../../services/types'

/** 变化形式 key → 中文（与 H5 exchangeChineseMap 一致） */
const EXCHANGE_CN_MAP: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '名词复数'
}

/** 状态单选项（1学习/2复习/3强化/4完成）+ 各自小圆点修饰类 */
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

/** 例句视图模型 */
interface ExampleVM {
  en: string
  zh: string
}

/** 变化形式视图项 */
interface ExchangeVM {
  label: string
  value: string
}

/** 单词词性视图项（WXML 直接绑定） */
interface PosVM {
  /** 词性ID（word_pos_id，释义编辑/配图定位用） */
  id: number
  /** 词性缩写（n. / vt. ...） */
  sw: string
  /** 词性中文 */
  cn: string
  /** 该词性释义 */
  translation: string
  /** 变化形式 */
  exchanges: ExchangeVM[]
  /** 例句 */
  examples: ExampleVM[]
  /** 配图完整 URL（resolveAsset 后，空则不展示图块） */
  pictureUrl: string
}

/** 释义编辑弹层里的一条（单词每词性一条；短语恒单条） */
interface TransEditItem {
  /** 单词=word_pos_id；短语此处为短语 id（仅占位，提交走 updatePhrase） */
  id: number
  /** 词性标签（短语为空串，不展示） */
  posLabel: string
  /** 当前编辑值 */
  translation: string
}

/** 标签 chip 视图项（含是否已选） */
interface TagVM {
  id: number
  name: string
  style: string
  selected: boolean
}

interface PageData {
  loading: boolean
  loadError: boolean
  /** 1单词 / 2短语 */
  type: WordType
  /** 词条 id */
  id: number
  /** 顶部主词文本 */
  word: string

  // ---- 单词字段 ----
  ukPhonetic: string
  usPhonetic: string
  ukAudioUrl: string
  usAudioUrl: string
  posList: PosVM[]

  // ---- 短语字段 ----
  phraseTranslation: string
  phrasePronUrl: string
  phraseExamples: ExampleVM[]
  phrasePictureUrl: string

  // 配图加载失败标记（key = pictureUrl）
  picErrorMap: Record<string, boolean>

  // ---- 释义编辑弹层 ----
  transVisible: boolean
  transItems: TransEditItem[]
  transCanSubmit: boolean
  transSubmitting: boolean

  // ---- 状态编辑弹层 ----
  statusVisible: boolean
  statusOptions: { value: WordStatusCode; label: string; dot: string }[]
  statusValue: WordStatusCode
  statusSubmitting: boolean

  // ---- 标签编辑弹层 ----
  tagVisible: boolean
  tagList: TagVM[]
  tagSubmitting: boolean
  // 新建标签子表单
  tagCreateOpen: boolean
  tagNewName: string
  tagNewNameTrimmed: boolean
  tagNewColor: string
  tagPalette: string[]
  tagCreating: boolean

  // ---- 配图编辑弹层（AI 生成 / 本地上传，无裁剪，MVP） ----
  picVisible: boolean
  /** 'word' = 改某词性配图(picTargetId=word_pos_id)；'phrase' = 改短语配图(picTargetId=短语 id) */
  picKind: 'word' | 'phrase'
  picTargetId: number
  /** 配图对象的标题（词性 sw 或短语本体，弹层标题展示） */
  picTitle: string
  /** 进入弹层时的原图 URL（resolveAsset 后；"恢复原图"用） */
  picOriginalUrl: string
  /** 当前预览 URL（resolveAsset 后；原图或新图） */
  picPreviewUrl: string
  /** 待应用的图片相对 path（'' = 无改动，未生成/上传或已恢复原图） */
  picPendingPath: string
  picGenerating: boolean
  picUploading: boolean
  picApplying: boolean
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    loading: true,
    loadError: false,
    type: 1,
    id: 0,
    word: '',

    ukPhonetic: '',
    usPhonetic: '',
    ukAudioUrl: '',
    usAudioUrl: '',
    posList: [],

    phraseTranslation: '',
    phrasePronUrl: '',
    phraseExamples: [],
    phrasePictureUrl: '',

    picErrorMap: {},

    transVisible: false,
    transItems: [],
    transCanSubmit: false,
    transSubmitting: false,

    statusVisible: false,
    statusOptions: STATUS_OPTIONS,
    statusValue: 1,
    statusSubmitting: false,

    tagVisible: false,
    tagList: [],
    tagSubmitting: false,
    tagCreateOpen: false,
    tagNewName: '',
    tagNewNameTrimmed: false,
    tagNewColor: PALETTE[0],
    tagPalette: PALETTE,
    tagCreating: false,

    picVisible: false,
    picKind: 'word',
    picTargetId: 0,
    picTitle: '',
    picOriginalUrl: '',
    picPreviewUrl: '',
    picPendingPath: '',
    picGenerating: false,
    picUploading: false,
    picApplying: false
  },

  // 发音音频上下文（懒创建，卸载时销毁）
  _audioCtx: null as WechatMiniprogram.InnerAudioContext | null,
  // 右滑返回手势：起手坐标
  _touchStartX: 0,
  _touchStartY: 0,

  onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id || 0)
    // type 解析：2=短语，其余按 1=单词
    const type: WordType = Number(query.type) === 2 ? 2 : 1
    if (!id) {
      this.setData({ loading: false, loadError: true })
      return
    }
    this.setData({ id, type })
    // 导航栏标题区分单词/短语详情（对照 H5 nav-title）
    wx.setNavigationBarTitle({ title: type === 2 ? '短语详情' : '单词详情' })
    this.loadDetail()
  },

  onUnload() {
    if (this._audioCtx) {
      this._audioCtx.destroy()
      this._audioCtx = null
    }
  },

  /** 拉取详情：按 type 走单词 / 短语，分别装配视图模型 */
  async loadDetail() {
    this.setData({ loading: true, loadError: false })
    wx.showLoading({ title: '加载中', mask: false })
    try {
      if (this.data.type === 2) {
        const phrase = await getPhraseDetail(this.data.id)
        this._applyPhrase(phrase)
      } else {
        const word = await getWordDetail(this.data.id)
        this._applyWord(word)
      }
      this.setData({ loading: false })
    } catch (e) {
      // request 层已统一 toast
      this.setData({ loading: false, loadError: true })
    } finally {
      wx.hideLoading()
    }
  },

  /** Word → 视图字段 */
  _applyWord(word: Word) {
    const posList: PosVM[] = (word.pos || []).map((p) => {
      const exchanges: ExchangeVM[] = []
      if (p.exchange) {
        for (const key in p.exchange) {
          const value = p.exchange[key]
          if (value) {
            exchanges.push({ label: EXCHANGE_CN_MAP[key] || key, value })
          }
        }
      }
      // p.example 是 Example[]（对象数组）；parseExamples 的 collectFromItems 已能从对象元素
      // 取 {example, translation}，但其入参声明的数组分支是 string[]，故按 string[] 透传（运行时等价）。
      const examples = parseExamples(
        (p.example || []) as unknown as string[]
      ).map((e) => ({ en: e.en, zh: e.zh }))
      const posCode = p.pos == null ? 0 : p.pos
      return {
        id: p.id || 0,
        sw: POS_SW_MAP[posCode] || POS_SW_MAP[0],
        cn: POS_CN_MAP[posCode] || POS_CN_MAP[0],
        translation: p.translation || '',
        exchanges,
        examples,
        pictureUrl: resolveAsset(p.picture)
      }
    })
    this.setData({
      word: word.word,
      ukPhonetic: word.uk_phonetic || '',
      usPhonetic: word.us_phonetic || '',
      ukAudioUrl: resolveAsset(word.uk_audio),
      usAudioUrl: resolveAsset(word.us_audio),
      posList,
      picErrorMap: {}
    })
  },

  /** WordPhrase → 视图字段 */
  _applyPhrase(phrase: WordPhrase) {
    const examples = parseExamples(phrase.example as unknown as string[]).map((e) => ({
      en: e.en,
      zh: e.zh
    }))
    this.setData({
      word: phrase.phrase,
      phraseTranslation: phrase.translation || '',
      phrasePronUrl: resolveAsset(phrase.pronunciation),
      phraseExamples: examples,
      phrasePictureUrl: resolveAsset(phrase.picture),
      picErrorMap: {}
    })
  },

  /* ===================== 返回 / 发音 / 配图 ===================== */

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  /** 右滑返回手势·起手：记录坐标 */
  onTouchStart(e: WechatMiniprogram.TouchEvent) {
    const t = e.touches && e.touches[0]
    if (t) {
      this._touchStartX = t.clientX
      this._touchStartY = t.clientY
    }
  },

  /**
   * 右滑返回手势·收手：满足"右滑为主"则返回上一页。
   *   - 任一编辑弹层打开时不响应（避免误退页，弹层自身有蒙层可关）；
   *   - 从最左边缘(≤30px)起手交给系统原生返回，避免与原生边缘手势重复 pop；
   *   - 水平位移 >80px 且明显大于垂直位移才判为右滑（避免与竖向滚动冲突）。
   */
  onTouchEnd(e: WechatMiniprogram.TouchEvent) {
    if (
      this.data.transVisible ||
      this.data.statusVisible ||
      this.data.tagVisible ||
      this.data.picVisible
    ) {
      return
    }
    const t = e.changedTouches && e.changedTouches[0]
    if (!t || this._touchStartX <= 30) {
      return
    }
    const dx = t.clientX - this._touchStartX
    const dy = t.clientY - this._touchStartY
    if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      wx.navigateBack({ delta: 1 })
    }
  },

  /** 发音：data-src 完整 URL（单词 uk/us，短语 pronunciation） */
  onPlay(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.src as string
    if (!url) {
      wx.showToast({ title: '暂无发音', icon: 'none' })
      return
    }
    let ctx = this._audioCtx
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      ctx.onError(() => {
        wx.showToast({ title: '发音加载失败', icon: 'none' })
      })
      this._audioCtx = ctx
    }
    ctx.stop()
    ctx.src = url
    ctx.play()
  },

  /** 配图加载失败 → 记录该 URL，WXML 据此回退 emoji 占位 */
  onPicError(e: WechatMiniprogram.CustomEvent) {
    const url = e.currentTarget.dataset.url as string
    if (!url) {
      return
    }
    const map = { ...this.data.picErrorMap }
    map[url] = true
    this.setData({ picErrorMap: map })
  },

  /* ===================== 释义编辑弹层 ===================== */

  openTransEdit() {
    let items: TransEditItem[]
    if (this.data.type === 2) {
      // 短语：单条，id 占位短语 id（提交不直接用）
      items = [{ id: this.data.id, posLabel: '', translation: this.data.phraseTranslation }]
    } else {
      // 单词：每词性一条；过滤掉没有有效 word_pos_id 的（无法定位释义）
      items = this.data.posList
        .filter((p) => p.id > 0)
        .map((p) => ({ id: p.id, posLabel: p.sw, translation: p.translation }))
      if (items.length === 0) {
        wx.showToast({ title: '该词条无可编辑的释义', icon: 'none' })
        return
      }
    }
    this.setData({
      transVisible: true,
      transItems: items,
      transCanSubmit: items.some((i) => i.translation.trim().length > 0),
      transSubmitting: false
    })
  },

  closeTransEdit() {
    this.setData({ transVisible: false })
  },

  /** 释义 textarea 输入：data-index 定位行 */
  onTransInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index)
    const items = this.data.transItems.slice()
    if (!items[index]) {
      return
    }
    items[index] = { ...items[index], translation: e.detail.value }
    this.setData({
      transItems: items,
      transCanSubmit: items.some((i) => i.translation.trim().length > 0)
    })
  },

  /** 提交释义：单词 updateWordTranslation；短语 updatePhrase（保留其它字段整体覆盖） */
  async onTransSubmit() {
    if (!this.data.transCanSubmit || this.data.transSubmitting) {
      return
    }
    this.setData({ transSubmitting: true })
    try {
      if (this.data.type === 2) {
        const newTrans = (this.data.transItems[0].translation || '').trim()
        // 短语复用 updatePhrase：需要全量字段，先拉详情拿 phrase/pronunciation/example/picture。
        const detail = await getPhraseDetail(this.data.id)
        await updatePhrase({
          id: this.data.id,
          phrase: detail.phrase,
          translation: newTrans,
          pronunciation: detail.pronunciation || '',
          example: detail.example || [],
          picture: detail.picture || ''
        })
        // 本地同步
        this.setData({ phraseTranslation: newTrans })
      } else {
        const items = this.data.transItems.map((i) => ({
          word_pos_id: i.id,
          translation: (i.translation || '').trim()
        }))
        await updateWordTranslation({ items })
        // 本地同步各 pos.translation
        const posList = this.data.posList.map((p) => {
          const hit = items.find((it) => it.word_pos_id === p.id)
          return hit ? { ...p, translation: hit.translation } : p
        })
        this.setData({ posList })
      }
      wx.showToast({ title: '释义已更新', icon: 'success' })
      this.setData({ transVisible: false })
    } catch (e) {
      // request 层已统一 toast
    } finally {
      this.setData({ transSubmitting: false })
    }
  },

  /* ===================== 状态编辑弹层 ===================== */

  openStatusEdit() {
    this.setData({ statusVisible: true, statusSubmitting: false })
  },

  closeStatusEdit() {
    this.setData({ statusVisible: false })
  },

  /** 状态单选：data-value 1~4 */
  onStatusPick(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value) as WordStatusCode
    if (value >= 1 && value <= 4) {
      this.setData({ statusValue: value })
    }
  },

  async onStatusSubmit() {
    if (this.data.statusSubmitting) {
      return
    }
    this.setData({ statusSubmitting: true })
    try {
      await updateStatus({
        word_id: this.data.id,
        word_type: this.data.type,
        status: this.data.statusValue
      })
      wx.showToast({ title: '状态已更新', icon: 'success' })
      this.setData({ statusVisible: false })
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ statusSubmitting: false })
    }
  },

  /* ===================== 标签编辑弹层 ===================== */

  /** 打开标签弹层：先并发拉「全部可选标签」+「当前词条已挂标签」，装配选中态 */
  async openTagEdit() {
    this.setData({ tagVisible: true, tagSubmitting: false, tagCreateOpen: false })
    wx.showLoading({ title: '加载中', mask: false })
    try {
      const [all, mine] = await Promise.all([
        getTagList(),
        getWordTags({ word_id: [this.data.id], word_type: this.data.type })
      ])
      const selectedIds = new Set((mine || []).map((t) => t.tag_id))
      const tagList: TagVM[] = (all || []).map((t) => ({
        id: t.id,
        name: t.name,
        style: t.style || '#1989fa',
        selected: selectedIds.has(t.id)
      }))
      this.setData({ tagList })
    } catch (e) {
      // 已 toast；保持空列表
      this.setData({ tagList: [] })
    } finally {
      wx.hideLoading()
    }
  },

  closeTagEdit() {
    this.setData({ tagVisible: false })
  },

  /** 切换某标签选中态：data-id */
  onTagToggle(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const tagList = this.data.tagList.map((t) =>
      t.id === id ? { ...t, selected: !t.selected } : t
    )
    this.setData({ tagList })
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
    if (color) {
      this.setData({ tagNewColor: color })
    }
  },

  /** 创建标签 → addTag → 重新拉全量并把刚建的自动选中 */
  async createTag() {
    const name = this.data.tagNewName.trim()
    if (!name || this.data.tagCreating) {
      return
    }
    this.setData({ tagCreating: true })
    try {
      await addTag({ name, style: this.data.tagNewColor })
      // 刷新可选标签：保留已选状态，并自动选中刚新建的（按名字匹配）
      const all: Tag[] = await getTagList()
      const prevSelected = new Set(
        this.data.tagList.filter((t) => t.selected).map((t) => t.id)
      )
      const tagList: TagVM[] = (all || []).map((t) => ({
        id: t.id,
        name: t.name,
        style: t.style || '#1989fa',
        selected: prevSelected.has(t.id) || t.name === name
      }))
      this.setData({ tagList, tagCreateOpen: false, tagNewName: '', tagNewNameTrimmed: false })
      wx.showToast({ title: '已新建', icon: 'success' })
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ tagCreating: false })
    }
  },

  /** 提交标签：updateWordTag 整体覆盖（tags = 当前全部选中项；空数组=清空） */
  async onTagSubmit() {
    if (this.data.tagSubmitting) {
      return
    }
    this.setData({ tagSubmitting: true })
    try {
      const tags = this.data.tagList.filter((t) => t.selected).map((t) => t.id)
      await updateWordTag({
        word_id: this.data.id,
        word_type: this.data.type,
        tags
      })
      wx.showToast({ title: '标签已更新', icon: 'success' })
      this.setData({ tagVisible: false })
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ tagSubmitting: false })
    }
  },

  /* ===================== 删除 ===================== */

  onDelete() {
    const isPhrase = this.data.type === 2
    wx.showModal({
      title: '确认删除',
      content: `确定删除${isPhrase ? '短语' : '单词'}「${this.data.word}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          if (isPhrase) {
            await deletePhrase(this.data.id)
          } else {
            await deleteWord(this.data.id)
          }
          wx.showToast({ title: '已删除', icon: 'success' })
          // 略等 toast 后返回上一页
          setTimeout(() => {
            wx.navigateBack({ delta: 1 })
          }, 500)
        } catch (err) {
          // 已 toast
        }
      }
    })
  },

  /* ===================== 配图编辑弹层（AI 生成 / 上传，MVP 无裁剪） ===================== */

  /**
   * 打开配图弹层。data-kind('word'|'phrase') / data-id(word_pos_id 或短语 id) /
   * data-url(当前图 resolveAsset 后) / data-title(词性 sw 或短语本体)。
   */
  openPicEdit(e: WechatMiniprogram.TouchEvent) {
    const ds = e.currentTarget.dataset
    const kind = (ds.kind as 'word' | 'phrase') || 'word'
    const id = Number(ds.id || 0)
    if (!id) {
      wx.showToast({ title: '该词条暂不支持配图', icon: 'none' })
      return
    }
    const url = String(ds.url || '')
    this.setData({
      picVisible: true,
      picKind: kind,
      picTargetId: id,
      picTitle: String(ds.title || ''),
      picOriginalUrl: url,
      picPreviewUrl: url,
      picPendingPath: '',
      picGenerating: false,
      picUploading: false,
      picApplying: false
    })
  },

  closePicEdit() {
    if (this.data.picGenerating || this.data.picUploading || this.data.picApplying) {
      return
    }
    this.setData({ picVisible: false })
  },

  /** AI 生成配图 → 预览待应用 */
  async onPicGenerate() {
    if (this.data.picGenerating || this.data.picApplying) {
      return
    }
    this.setData({ picGenerating: true })
    wx.showLoading({ title: 'AI 生成中', mask: true })
    try {
      const link =
        this.data.picKind === 'phrase'
          ? await generatePhrasePicture(this.data.picTargetId)
          : await generateWordPicture(this.data.picTargetId)
      if (!link) {
        wx.showToast({ title: '生成失败，请重试', icon: 'none' })
        return
      }
      this.setData({ picPendingPath: link, picPreviewUrl: resolveAsset(link) })
    } catch (e) {
      // request 已 toast
    } finally {
      wx.hideLoading()
      this.setData({ picGenerating: false })
    }
  },

  /** 本地上传配图（MVP 无裁剪，直接传原图） → 预览待应用 */
  onPicUpload() {
    if (this.data.picUploading || this.data.picApplying) {
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.setData({ picUploading: true })
        wx.showLoading({ title: '上传中', mask: true })
        try {
          const m = /\.([a-zA-Z0-9]+)$/.exec(file.tempFilePath)
          const ext = m ? m[1].toLowerCase() : 'png'
          const prefix = this.data.picKind === 'phrase' ? 'phrase' : 'word'
          const object =
            'picture/' + prefix + '_' + this.data.picTargetId + '_' + Date.now() + '.' + ext
          const path = await uploadFile(file.tempFilePath, OSS_BUCKET, object)
          this.setData({ picPendingPath: path, picPreviewUrl: resolveAsset(path) })
        } catch (err) {
          const msg = err instanceof Error ? err.message : '上传失败'
          wx.showToast({ title: msg, icon: 'none' })
        } finally {
          wx.hideLoading()
          this.setData({ picUploading: false })
        }
      }
      // 用户取消 → fail 静默
    })
  },

  /** 恢复原图（放弃未应用的新图） */
  onPicRestore() {
    this.setData({ picPendingPath: '', picPreviewUrl: this.data.picOriginalUrl })
  },

  /** 应用配图（落库）→ 同步本地视图 */
  async onPicApply() {
    if (!this.data.picPendingPath || this.data.picApplying) {
      return
    }
    const path = this.data.picPendingPath
    this.setData({ picApplying: true })
    wx.showLoading({ title: '应用中', mask: true })
    try {
      if (this.data.picKind === 'phrase') {
        await updatePhrasePicture(this.data.picTargetId, path)
        this.setData({ phrasePictureUrl: resolveAsset(path) })
      } else {
        await updateWordPicture(this.data.picTargetId, path)
        // 同步对应 pos 的 pictureUrl
        const posList = this.data.posList.map((p) =>
          p.id === this.data.picTargetId ? { ...p, pictureUrl: resolveAsset(path) } : p
        )
        this.setData({ posList })
      }
      // 清掉这张图可能残留的加载失败标记
      const map = { ...this.data.picErrorMap }
      delete map[resolveAsset(path)]
      this.setData({ picErrorMap: map })
      wx.showToast({ title: '配图已更新', icon: 'success' })
      this.setData({ picVisible: false })
    } catch (e) {
      // request 已 toast
    } finally {
      wx.hideLoading()
      this.setData({ picApplying: false })
    }
  },

  // 弹层面板内部点击占位（阻止冒泡到蒙层关闭）
  noop() {},

  /** 右上角「···」→ 转发给朋友 */
  onShareAppMessage() {
    return {
      title: '单词记忆助手 · 一起来背单词',
      path: '/pages/home/home'
    }
  }
})
