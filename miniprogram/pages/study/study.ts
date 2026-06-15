// pages/study/study.ts —— 学习模式闭环（真实 service）
// onLoad/onShow 读全局标签筛选 → getList('study', {count:5, random:true, tag_ids}) 拿 WordCard[]，逐张渲染；
// 「完成学习」→ finishStudy(card.id, card.word_type) → 下一张；
// 列表为空 / 最后一张完成后 → completion-overlay 蒙层（空态 / 完成态）。
import { getList, finishStudy } from '../../services/practise'
import type { WordCard } from '../../services/types'
import { resolveAsset } from '../../utils/asset'
import { getPracticeTagFilter } from '../../utils/practiceTagFilter'
import parseExamples from '../../utils/parseExamples'

/** 例句拆出的中/英两行 */
interface ExampleVM {
  en: string
  zh: string
}

/** 渲染用的卡片视图模型（由 WordCard 映射，字段已转好供 WXML 直接绑定） */
interface StudyCardVM {
  id: number
  word: string
  isPhrase: boolean
  /** 美式音标（短语为空时不展示该行） */
  phoneticUS: string
  /** 英式音标 */
  phoneticUK: string
  /** 释义按 \n 拆成多行 */
  meaningLines: string[]
  /** 例句（统一 {en, zh}，由 parseExamples 归一） */
  examples: ExampleVM[]
  /** 配图完整 URL（resolveAsset 后；空则走 emoji 占位） */
  pictureUrl: string
  /** 美式音频完整 URL */
  usAudioUrl: string
  /** 英式音频完整 URL */
  ukAudioUrl: string
}

/** 占位渐变块固定用学习模式色 */
const STUDY_MODE_VAR = 'var(--mode-study)'
/** 配图加载失败 / 无图时的兜底 emoji */
const STUDY_EMOJI = '📘'

/** WordCard → StudyCardVM（含短语特判：word_type===2 只用 uk_audio，translation 直接中文） */
function toCardVM(card: WordCard): StudyCardVM {
  const isPhrase = card.word_type === 2
  const meaningLines = (card.translation || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // 例句改用统一的 parseExamples 归一解析（覆盖纯文本 / "英文\n中文" / JSON 串等异构格式）
  const examples = parseExamples(card.example).map((e) => ({ en: e.en, zh: e.zh }))
  return {
    id: card.id,
    word: card.word,
    isPhrase,
    phoneticUS: isPhrase ? '' : (card.us_phonetic || ''),
    phoneticUK: card.uk_phonetic || '',
    meaningLines: meaningLines.length > 0 ? meaningLines : [card.translation || ''],
    examples,
    pictureUrl: resolveAsset(card.picture && card.picture.length > 0 ? card.picture[0] : ''),
    // 短语没有 us_audio，发音统一落到 uk_audio
    usAudioUrl: isPhrase ? resolveAsset(card.uk_audio) : resolveAsset(card.us_audio),
    ukAudioUrl: resolveAsset(card.uk_audio)
  }
}

Page({
  data: {
    loading: true as boolean,
    showOverlay: false as boolean,     // 完成 / 空态蒙层显隐
    finishedCount: 0 as number,        // 本批卡片张数；传给蒙层 count（0=空态，>0=完成态）
    cards: [] as StudyCardVM[],        // 全部卡片
    index: 0,                          // 当前卡片下标
    word: null as StudyCardVM | null,  // 当前卡片（= cards[index]）
    exIndex: 0,                        // 当前例句轮播下标
    picError: false as boolean,        // 当前卡配图是否加载失败
    submitting: false as boolean,      // 正在提交「完成学习」
    // 顶部进度 / 占位块样式
    progressCurrent: 0,
    progressTotal: 0,
    barPercent: 0,
    modeVar: STUDY_MODE_VAR,
    emoji: STUDY_EMOJI
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

  // 拉取学习卡列表（读全局标签筛选注入 tag_ids）
  loadCards() {
    this.setData({ loading: true, showOverlay: false })
    wx.showLoading({ title: '加载中', mask: false })
    // 全局标签筛选：[] = 全部不筛选；[id...] = 仅取打了任一标签的词条
    const tagIds = getPracticeTagFilter()
    getList('study', { count: 5, random: true, tag_ids: tagIds })
      .then((list: WordCard[]) => {
        const cards = (list || []).map(toCardVM)
        if (cards.length === 0) {
          // 没有可学的词，进空态蒙层（count=0）
          this.setData({
            loading: false,
            showOverlay: true,
            finishedCount: 0,
            cards: [],
            word: null,
            progressCurrent: 0,
            progressTotal: 0,
            barPercent: 0
          })
          return
        }
        this.setData({
          loading: false,
          showOverlay: false,
          finishedCount: 0,
          cards,
          index: 0,
          word: cards[0],
          exIndex: 0,
          picError: false,
          progressCurrent: 1,
          progressTotal: cards.length,
          barPercent: Math.round((1 / cards.length) * 100)
        })
      })
      .catch(() => {
        // request 层已统一 toast；这里保持加载结束、展示空态蒙层
        this.setData({ loading: false, showOverlay: true, finishedCount: 0, word: null })
      })
      .finally(() => {
        wx.hideLoading()
      })
  },

  // 发音按钮：data-type us/uk，播对应音频；URL 为空时 toast 占位
  onPlay(e: WechatMiniprogram.TouchEvent) {
    const word = this.data.word
    if (!word) {
      return
    }
    const type = e.currentTarget.dataset.type === 'uk' ? 'uk' : 'us'
    const url = type === 'uk' ? word.ukAudioUrl : word.usAudioUrl
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

  // 例句轮播切换
  onExChange(e: WechatMiniprogram.SwiperChange) {
    this.setData({ exIndex: e.detail.current })
  },

  // 配图加载失败 → 回退 emoji 占位
  onPicError() {
    this.setData({ picError: true })
  },

  // 完成学习：提交后切下一张；最后一张完成后进完成态蒙层
  onDone() {
    const word = this.data.word
    if (!word || this.data.submitting) {
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })
    // word_type：短语 2 / 单词 1（透传卡片真实类型）
    const wordType = word.isPhrase ? 2 : 1
    finishStudy(word.id, wordType)
      .then(() => {
        this.goNext()
      })
      .catch(() => {
        // request 层已 toast；不前进，允许重试
      })
      .finally(() => {
        wx.hideLoading()
        this.setData({ submitting: false })
      })
  },

  // 切到下一张；越界则进完成态蒙层（count=本批张数）
  goNext() {
    const next = this.data.index + 1
    const total = this.data.cards.length
    if (next >= total) {
      this.setData({ showOverlay: true, finishedCount: total, word: null })
      return
    }
    this.setData({
      index: next,
      word: this.data.cards[next],
      exIndex: 0,
      picError: false,
      progressCurrent: next + 1,
      progressTotal: total,
      barPercent: Math.round(((next + 1) / total) * 100)
    })
  },

  // 蒙层「再来一组」：隐藏蒙层并重新拉一批
  onRestart() {
    this.setData({ showOverlay: false })
    this.loadCards()
  },

  // 蒙层「返回练习主页」：回首页 tab
  onHome() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
