// review.ts —— 复习模式：getList("review") 拉卡片，三态揭示（看图/提示 → 中文释义 → 完整答案）+ finishReview 闭环
// 对照 H5 PracticeReview.vue 复刻：
//   initial：有图展示配图 / 无图直接给中文释义；按钮「中文提示」(仅有图时) + 「查看答案」
//   hint   ：配图 + 中文释义；按钮「查看答案」
//   full   ：单词 + 音标 + 释义 + 例句轮播；按钮「已掌握」(op=1) /「不记得」(op=2)
// 全局标签筛选：getList 带 tag_ids（来自 utils/practiceTagFilter，单一数据源；标签在练习 hub 选好后进入本页生效）。
// 完成 / 空态用 completion-overlay 组件。
import { getList, finishReview } from '../../services/practise'
import type { WordCard, WordType, ReviewOperation } from '../../services/types'
import { resolveAsset } from '../../utils/asset'
import parseExamples, { ParsedExample } from '../../utils/parseExamples'
import { getPracticeTagFilter } from '../../utils/practiceTagFilter'

/** 三态：initial=看图回忆 / hint=中文提示 / full=对答案 */
type ReviewState = 'initial' | 'hint' | 'full'

/** 渲染用卡片视图模型（在真实 WordCard 基础上预处理好绑定字段） */
interface CardVM {
  id: number
  word: string
  wordType: WordType
  /** 词性标签，如 "n." / "vt."（短语无，取空串） */
  pos: string
  /** 完整释义（多行 \n 拆成多行展示） */
  meaningLines: string[]
  /** 音标：单词取美式，短语取英式 */
  phonetic: string
  /** 发音音频完整 URL：单词取 us_audio，短语取 uk_audio */
  audioUrl: string
  /** 配图完整 URL（取首张），空则走 emoji 占位 */
  pictureUrl: string
  /** 是否有真实配图（决定 initial 态展示配图还是直接给释义、是否给「中文提示」按钮） */
  hasImage: boolean
  /** 占位 emoji（图片缺失/加载失败时显示） */
  emoji: string
  /** 例句（归一为 {en,zh}[]，用 parseExamples 覆盖异构格式） */
  examples: ParsedExample[]
}

/** 占位 emoji 兜底（资源调试期图片大概率取不到） */
const FALLBACK_EMOJI = '🔁'
/** 复习模式色变量（占位块渐变用） */
const REVIEW_MODE_VAR = 'var(--mode-review)'

/** 把真实 WordCard 映射为页面视图模型 */
function toCardVM(card: WordCard): CardVM {
  const isPhrase = card.word_type === 2
  // 短语发音只有 uk_audio；单词优先美式
  const audio = isPhrase ? card.uk_audio : card.us_audio
  const phonetic = isPhrase ? card.uk_phonetic : card.us_phonetic
  // 词性标签：取首个结构化释义项的 pos_label（短语通常无）
  const pos = card.translation_items && card.translation_items.length > 0
    ? card.translation_items[0].pos_label
    : ''
  // 完整释义：多行 \n 拆成多行展示（短语为直接中文）
  const meaningLines = (card.translation || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const pic = card.picture && card.picture.length > 0 ? card.picture[0] : ''
  const pictureUrl = resolveAsset(pic)
  return {
    id: card.id,
    word: card.word,
    wordType: card.word_type,
    pos,
    meaningLines: meaningLines.length > 0 ? meaningLines : [card.translation || ''],
    phonetic,
    audioUrl: resolveAsset(audio),
    pictureUrl,
    hasImage: !!pictureUrl,
    emoji: FALLBACK_EMOJI,
    examples: parseExamples(card.example)
  }
}

Page({
  data: {
    loading: true,                 // 首屏加载态
    cards: [] as CardVM[],         // 本轮复习卡片队列
    index: 0,                      // 当前卡片下标
    total: 0,                      // 本轮总卡数
    state: 'initial' as ReviewState, // 三态：initial/hint/full
    word: null as CardVM | null,   // 当前卡片视图模型
    exIndex: 0,                    // 当前例句轮播下标
    imgError: false,               // 当前卡片图片是否加载失败（回退 emoji 占位）
    submitting: false,             // 判定提交中（防连点）
    // 完成 / 空态蒙层
    showOverlay: false,            // 是否显示 completion-overlay
    finishedCount: 0,              // 本次完成数量（0=空态 / >0=完成态）
    modeVar: REVIEW_MODE_VAR
  },

  // 内部音频上下文（懒创建，页面卸载时销毁）
  _audioCtx: null as WechatMiniprogram.InnerAudioContext | null,

  onLoad() {
    this.loadCards()
  },

  onUnload() {
    if (this._audioCtx) {
      this._audioCtx.destroy()
      this._audioCtx = null
    }
  },

  // 拉本轮复习卡片：带全局标签筛选 tag_ids（getPracticeTagFilter 为单一数据源）
  loadCards() {
    this.setData({ loading: true, showOverlay: false })
    wx.showLoading({ title: '加载中', mask: true })
    const tagIds = getPracticeTagFilter()
    getList('review', { count: 10, random: true, tag_ids: tagIds })
      .then((list: WordCard[]) => {
        const cards = (list || []).map(toCardVM)
        if (cards.length === 0) {
          // 没有可复习的词 → 空态蒙层（count=0）
          this.setData({
            loading: false,
            cards: [],
            total: 0,
            index: 0,
            word: null,
            showOverlay: true,
            finishedCount: 0
          })
          return
        }
        this.setData({
          loading: false,
          cards,
          total: cards.length,
          index: 0,
          state: 'initial',
          exIndex: 0,
          imgError: false,
          word: cards[0],
          showOverlay: false,
          finishedCount: 0
        })
      })
      .catch(() => {
        // request 层已统一 toast；这里结束 loading 并呈现空态蒙层
        this.setData({
          loading: false,
          cards: [],
          total: 0,
          word: null,
          showOverlay: true,
          finishedCount: 0
        })
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  // initial → hint：显示中文释义提示
  onShowHint() {
    this.setData({ state: 'hint' })
  },

  // → full：揭晓完整答案（单词 + 音标 + 释义 + 例句）
  onShowAnswer() {
    this.setData({ state: 'full' })
  },

  // 图片加载失败 → 回退 emoji 占位
  onImgError() {
    this.setData({ imgError: true })
  },

  // 例句轮播切换
  onExChange(e: WechatMiniprogram.SwiperChange) {
    this.setData({ exIndex: e.detail.current })
  },

  // 发音：用内部音频上下文播放真实音频，无音频则轻提示
  onPlaySound() {
    const word = this.data.word
    if (!word || !word.audioUrl) {
      wx.showToast({ title: '暂无发音', icon: 'none', duration: 800 })
      return
    }
    let ctx = this._audioCtx
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      ctx.onError(() => {
        wx.showToast({ title: '发音加载失败', icon: 'none', duration: 800 })
      })
      this._audioCtx = ctx
    }
    ctx.stop()
    ctx.src = word.audioUrl
    ctx.play()
  },

  // 已掌握 → finishReview(operation=1)
  onMastered() {
    this.submit(1)
  },

  // 不记得 → finishReview(operation=2)
  onUnknown() {
    this.submit(2)
  },

  // 提交本卡判定结果，成功后切下一张
  submit(operation: ReviewOperation) {
    const word = this.data.word
    if (!word || this.data.submitting) {
      return
    }
    this.setData({ submitting: true })
    finishReview(word.id, word.wordType, operation, 4)
      .then(() => {
        wx.showToast({
          title: operation === 1 ? '已掌握 ✅' : '稍后再练 🤔',
          icon: 'none',
          duration: 600
        })
        this.next()
      })
      .catch(() => {
        // request 层已统一 toast，本卡保持原态，允许重试
      })
      .finally(() => {
        this.setData({ submitting: false })
      })
  },

  // 切到下一张；越界则进完成态蒙层（finishedCount = 本轮总数）
  next() {
    this._stopAudio()
    const nextIndex = this.data.index + 1
    if (nextIndex >= this.data.cards.length) {
      this.setData({
        word: null,
        state: 'initial',
        imgError: false,
        showOverlay: true,
        finishedCount: this.data.total
      })
      return
    }
    this.setData({
      index: nextIndex,
      word: this.data.cards[nextIndex],
      state: 'initial',
      exIndex: 0,
      imgError: false
    })
  },

  // completion-overlay：再来一组 → 重新拉本轮卡片
  onRestart() {
    this.setData({ showOverlay: false })
    this.loadCards()
  },

  // completion-overlay：返回练习主页（非 tab 页，navigateBack 回 hub）
  onHome() {
    this._stopAudio()
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/practice/practice',
          fail: () => {
            wx.redirectTo({ url: '/pages/practice/practice' })
          }
        })
      }
    })
  },

  // 停止当前发音（切卡 / 离开时）
  _stopAudio() {
    if (this._audioCtx) {
      this._audioCtx.stop()
    }
  }
})
