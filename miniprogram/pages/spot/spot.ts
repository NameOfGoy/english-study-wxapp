// 抽查 spot —— 真实闭环：getList("spot") → 揭示式卡片 → finishSpot(通过/没记住) → 下一张
// 对照 H5 src/views/PracticeSpot.vue 复刻三态揭示 + 通过/不通过交互。
import { getList, finishSpot } from '../../services/practise'
import type { WordCard, WordType } from '../../services/types'
import { resolveAsset } from '../../utils/asset'
import parseExamples, { ParsedExample } from '../../utils/parseExamples'
import { getPracticeTagFilter } from '../../utils/practiceTagFilter'

/** 抽查取词数量（对齐 H5：抽查 count=10） */
const SPOT_COUNT = 10

/** 卡片占位 emoji（资源取不到时回退用） */
const SPOT_EMOJI = '🎯'

/** 页面消费的卡片视图模型（保留原 UI 字段名：word/phoneticUS/phoneticUK/pos/meaning/examples/emoji） */
interface SpotCardVM {
  id: number
  word_type: WordType
  emoji: string
  word: string
  phoneticUS: string
  phoneticUK: string
  pos: string
  meaning: string
  examples: ParsedExample[]
  // 资源（过 resolveAsset，空则走占位）
  pictureUrl: string
  ukAudioUrl: string
  usAudioUrl: string
  picError: boolean
  /** 是否有真实配图（决定揭示阶段“中文提示”按钮是否可用，对齐 H5 hasImages） */
  hasImage: boolean
}

/** WordCard → 视图模型。短语(word_type===2)：发音只用 uk_audio，translation 直接中文。 */
function toVM(card: WordCard): SpotCardVM {
  const isPhrase = card.word_type === 2
  const firstItem = card.translation_items && card.translation_items[0]
  const pic = card.picture && card.picture[0]
  const pictureUrl = resolveAsset(pic)
  return {
    id: card.id,
    word_type: card.word_type,
    emoji: SPOT_EMOJI,
    word: card.word || '',
    phoneticUS: isPhrase ? '' : (card.us_phonetic || ''),
    phoneticUK: card.uk_phonetic || '',
    pos: firstItem ? firstItem.pos_label : '',
    meaning: card.translation || '',
    // 异构例句格式统一解析（替换原 naive split('\n')）
    examples: parseExamples(card.example),
    pictureUrl,
    ukAudioUrl: resolveAsset(card.uk_audio),
    usAudioUrl: resolveAsset(card.us_audio),
    picError: false,
    hasImage: !!pictureUrl
  }
}

Page({
  data: {
    word: null as SpotCardVM | null,
    current: 0,            // 本次抽查当前题序（1-based 显示）
    total: 0,              // 本次抽查总数
    percent: 0,            // 进度条百分比
    // 阶段：0=仅图回忆 / 1=显示单词音标 / 2=对答案显示释义例句
    phase: 0,
    loading: true,         // 列表加载态
    submitting: false,     // 提交中（防连点）
    // 完成 / 空态全屏蒙层
    showOverlay: false,    // 是否展示蒙层
    finishedCount: 0       // 本次完成数量（0 → 空态）
  },

  // 卡片列表与游标（不放 data，避免无谓渲染）
  _cards: [] as WordCard[],
  _index: 0,
  _done: 0,               // 本次已抽查完成数量（用于完成态统计）
  _audio: null as WechatMiniprogram.InnerAudioContext | null,

  onLoad() {
    this.loadList()
  },

  onUnload() {
    if (this._audio) {
      this._audio.destroy()
      this._audio = null
    }
  },

  // 拉取抽查列表（带全局标签筛选 tag_ids）
  loadList() {
    this.setData({ loading: true, showOverlay: false })
    wx.showLoading({ title: '加载中', mask: true })
    this._done = 0
    getList('spot', { count: SPOT_COUNT, random: true, tag_ids: getPracticeTagFilter() })
      .then((cards) => {
        wx.hideLoading()
        const list = cards || []
        if (list.length === 0) {
          // 无抽查任务 → 空态蒙层（finishedCount===0）
          this.setData({
            loading: false,
            word: null,
            total: 0,
            current: 0,
            percent: 0,
            showOverlay: true,
            finishedCount: 0
          })
          return
        }
        this._cards = list
        this._index = 0
        this.setData({
          loading: false,
          showOverlay: false,
          total: list.length
        })
        this.showCurrent()
      })
      .catch(() => {
        // request 层已 toast
        wx.hideLoading()
        this.setData({ loading: false, word: null, showOverlay: true, finishedCount: 0 })
      })
  },

  // 渲染当前游标对应卡片，重置到阶段0
  showCurrent() {
    const card = this._cards[this._index]
    if (!card) {
      // 全部做完
      this.finishAll()
      return
    }
    const total = this._cards.length
    const current = this._index + 1
    this.setData({
      word: toVM(card),
      current,
      total,
      percent: Math.round((current / total) * 100),
      phase: 0
    })
  },

  // 全部抽查完 → 完成态蒙层（finishedCount = 已完成数量）
  finishAll() {
    this.setData({
      word: null,
      showOverlay: true,
      finishedCount: this._done
    })
  },

  // 进入下一阶段（看单词 → 对答案）
  reveal() {
    if (this.data.phase < 2) {
      this.setData({ phase: this.data.phase + 1 })
    }
  },

  // 播放发音：短语/无美式音频时回退英式
  onPlay() {
    const vm = this.data.word
    if (!vm) {
      return
    }
    const src = vm.usAudioUrl || vm.ukAudioUrl
    if (!src) {
      wx.showToast({ title: '暂无发音', icon: 'none' })
      return
    }
    if (!this._audio) {
      this._audio = wx.createInnerAudioContext()
      this._audio.onError(() => {
        wx.showToast({ title: '发音播放失败', icon: 'none' })
      })
    }
    this._audio.stop()
    this._audio.src = src
    this._audio.play()
  },

  // 配图加载失败 → 回退 emoji 占位
  onPicError() {
    const vm = this.data.word
    if (vm && !vm.picError) {
      this.setData({ 'word.picError': true })
    }
  },

  // 通过 → finishSpot(operation=1)
  pass() {
    this.submit(1)
  },

  // 没记住 → finishSpot(operation=2)
  fail() {
    this.submit(2)
  },

  // 提交本题结果并切下一张
  submit(operation: 1 | 2) {
    const vm = this.data.word
    if (!vm || this.data.submitting) {
      return
    }
    this.setData({ submitting: true })
    finishSpot(vm.id, vm.word_type, operation)
      .then(() => {
        this._done += 1
        this.setData({ submitting: false })
        this.next()
      })
      .catch(() => {
        // request 层已 toast，允许重试
        this.setData({ submitting: false })
      })
  },

  // 切到下一题
  next() {
    this._index += 1
    this.showCurrent()
  },

  // 蒙层「再来一组」：重拉 list 并重置
  onRestart() {
    this.setData({ showOverlay: false })
    this.loadList()
  },

  // 蒙层「返回练习主页」：非 tab 页，返回上一级
  onHome() {
    wx.navigateBack({
      fail: () => {
        // 无上一级时兜底切到练习 tab
        wx.switchTab({ url: '/pages/practice/practice', fail: () => {} })
      }
    })
  }
})
