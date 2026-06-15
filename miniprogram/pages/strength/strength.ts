// strength.ts —— 加强模式：choice → full 两态流程，对照 H5 PracticeStrength.vue 复刻
//
// 交互（区别于其它模式的"选择即翻页"）：
//   choice 态：只给配图 + 中文释义，二选一「记得(op=1)」/「不记得(op=2)」。
//     —— 选择即调 finishStrength(id, wordType, operation)；成功后【停在同一张卡】切到 full。
//   full 态：揭示 单词 + 音标 + 完整释义 + 例句；底部单个「下一个」手动翻页。
//     —— 「下一个」index++ 并重置回 choice；最后一张之后弹 completion-overlay。
//   getList('strength', { random: true, tag_ids })（无 count）；tag_ids 取全局标签筛选。
//   例句用 parseExamples 归一异构格式；保留发音 / 配图 emoji 占位回退。
import { getList, finishStrength } from '../../services/practise'
import { resolveAsset } from '../../utils/asset'
import { getPracticeTagFilter } from '../../utils/practiceTagFilter'
import parseExamples from '../../utils/parseExamples'
import type { WordCard, WordType } from '../../services/types'

/** 例句视图模型（与各页一致：英文 + 中文） */
interface ExampleVM {
  en: string
  zh: string
}

/** 页面消费的卡片视图模型（在原始 WordCard 上补好 UI 派生字段） */
interface StrengthCardVM {
  id: number
  word: string
  word_type: WordType
  /** 美式音标（短语无，取空串则不展示该行） */
  phoneticUS: string
  /** 英式音标 */
  phoneticUK: string
  /** 词性标签拼接（如 "n. / vt."），无则空串 */
  pos: string
  /** 完整释义（短语为直接中文；单词为多行 \n 合并展示文本） */
  meaning: string
  /** 例句（parseExamples 归一） */
  examples: ExampleVM[]
  /** 配图完整 URL（resolveAsset 处理过），空串则走 emoji 占位 */
  pictureUrl: string
  /** 美式音频完整 URL（短语回退 uk_audio） */
  usAudioUrl: string
  /** 英式音频完整 URL */
  ukAudioUrl: string
  /** 占位 emoji（图片缺失/加载失败时显示） */
  emoji: string
}

const MODE_COLOR = 'var(--mode-strength)'
const PLACEHOLDER_EMOJI = '💪'

/** WordCard → 页面视图模型 */
function toVM(card: WordCard): StrengthCardVM {
  const isPhrase = card.word_type === 2
  const pos = (card.translation_items || [])
    .map((t) => t.pos_label)
    .filter((s) => !!s)
    .join(' / ')
  const meaning = (card.translation || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('  ')
  const firstPic = card.picture && card.picture.length ? card.picture[0] : ''
  return {
    id: card.id,
    word: card.word || '',
    word_type: card.word_type,
    phoneticUS: isPhrase ? '' : (card.us_phonetic || ''),
    phoneticUK: card.uk_phonetic || '',
    pos,
    meaning: meaning || (card.translation || ''),
    examples: parseExamples(card.example),
    pictureUrl: resolveAsset(firstPic),
    // 短语没有 us_audio，发音统一回退 uk_audio
    usAudioUrl: isPhrase ? resolveAsset(card.uk_audio) : resolveAsset(card.us_audio),
    ukAudioUrl: resolveAsset(card.uk_audio),
    emoji: PLACEHOLDER_EMOJI
  }
}

Page({
  data: {
    modeColorVar: MODE_COLOR,
    loading: true,
    // 卡片列表与当前下标
    cards: [] as StrengthCardVM[],
    index: 0,
    current: null as StrengthCardVM | null,
    // 两态：'choice' 只给释义二选一 / 'full' 揭示全部
    phase: 'choice' as 'choice' | 'full',
    // 顶部进度（已练 / 本批总数）
    total: 0,
    percent: 0,
    // 当前卡图片是否加载失败（失败则回退 emoji 占位）
    imgError: false,
    // 提交中（防连点）
    submitting: false,
    // 完成 / 空态全屏蒙层
    showOverlay: false,
    finishedCount: 0
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

  // 拉取一批加强卡片：random + 全局标签筛选（不传 count，对照 H5）
  loadCards() {
    this.setData({ loading: true, showOverlay: false })
    wx.showLoading({ title: '加载中', mask: true })
    getList('strength', { random: true, tag_ids: getPracticeTagFilter() })
      .then((list: WordCard[]) => {
        const cards = (list || []).map(toVM)
        if (cards.length === 0) {
          // 没有可加强的词 → 空态蒙层（count=0）
          this.setData({
            loading: false,
            cards: [],
            current: null,
            total: 0,
            percent: 0,
            showOverlay: true,
            finishedCount: 0
          })
          return
        }
        this.setData({
          loading: false,
          cards,
          index: 0,
          current: cards[0],
          phase: 'choice',
          total: cards.length,
          percent: Math.round((1 / cards.length) * 100),
          imgError: false,
          showOverlay: false
        })
      })
      .catch(() => {
        // request 层已统一 toast；这里仅结束 loading，呈现空态蒙层
        this.setData({
          loading: false,
          cards: [],
          current: null,
          total: 0,
          percent: 0,
          showOverlay: true,
          finishedCount: 0
        })
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  // 记得 → finishStrength(operation=1)
  onRemember() {
    this.submitChoice(1)
  },

  // 不记得 → finishStrength(operation=2)
  onForget() {
    this.submitChoice(2)
  },

  // 选择即提交；成功后【停在同一张卡】切到 full 态揭示答案（对照 H5 handleChoice）
  submitChoice(operation: 1 | 2) {
    const card = this.data.current
    if (!card || this.data.submitting) {
      return
    }
    // word_type 安全收敛到 1/2（对照 H5：异常值回退 1）
    const raw = Number(card.word_type)
    const safeWordType: WordType = raw === 2 ? 2 : 1
    this.setData({ submitting: true })
    finishStrength(card.id, safeWordType, operation)
      .then(() => {
        this.setData({ phase: 'full' })
      })
      .catch(() => {
        // request 层已统一 toast；提交失败保持 choice 态，允许重试
      })
      .finally(() => {
        this.setData({ submitting: false })
      })
  },

  // 「下一个」：index++ 重置回 choice；最后一张之后弹完成蒙层
  onNext() {
    const next = this.data.index + 1
    const total = this.data.cards.length
    this._stopAudio()
    if (next >= total) {
      // 本批练完 → 完成态蒙层（count = 本批总数）
      this.setData({
        current: null,
        showOverlay: true,
        finishedCount: total
      })
      return
    }
    this.setData({
      index: next,
      current: this.data.cards[next],
      phase: 'choice',
      percent: Math.round(((next + 1) / total) * 100),
      imgError: false
    })
  },

  // 发音：data-type us/uk，播对应音频；URL 为空时轻提示
  onPlay(e: WechatMiniprogram.TouchEvent) {
    const card = this.data.current
    if (!card) {
      return
    }
    const type = e.currentTarget.dataset.type === 'uk' ? 'uk' : 'us'
    const url = type === 'uk' ? card.ukAudioUrl : card.usAudioUrl
    if (!url) {
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
    ctx.src = url
    ctx.play()
  },

  // 配图加载失败 → 回退 emoji 占位
  onImgError() {
    this.setData({ imgError: true })
  },

  // 完成蒙层「再来一组」：重拉一批并重置
  onRestart() {
    this.setData({ showOverlay: false })
    this.loadCards()
  },

  // 完成蒙层「返回练习主页」：返回上一页（hub 由 navigateTo 进入）
  onHome() {
    this._stopAudio()
    wx.navigateBack({
      fail: () => {
        // 无上一页时兜底切到练习 tab
        wx.switchTab({ url: '/pages/practice/practice' })
      }
    })
  },

  // 停止当前发音（翻页/返回时调用）
  _stopAudio() {
    if (this._audioCtx) {
      this._audioCtx.stop()
    }
  }
})
