// pages/word-add/word-add.ts —— 添加词条（普通页，从词库进入）
// 复刻 H5 AddWordModal.vue + AddPhraseModal.vue（并参考 WordDetailView/PhraseEditModal 的字段集）：
//   - 顶部「单词 / 短语」切换胶囊，两套表单互斥渲染。
//   - 单词表单：word + 美/英音标(可空) + 至少一个词性块(词性选择 + 释义) + is_generate_picture 开关 → addWord。
//   - 短语表单：phrase + translation + pronunciation(可空) + is_generate_picture 开关 → addPhrase。
//   - 校验必填：单词非空且至少一条释义；短语非空。提交成功 toast 后默认 navigateBack。
// 无 vant：表单字段、词性选择器均自绘；蓝色活力风复用 app.wxss 全局类。
import { addWord, addPhrase } from '../../services/dictionary'
import { POS_SW_MAP, POS_CN_MAP } from '../../services/types'
import type { AddWordParams, AddPhraseParams, WordPos, Example } from '../../services/types'

// 词性选项：从 POS_*_MAP 派生（去掉 0=未知，与 H5 词性下拉一致）。
// label 形如「n. 名词」，value 是后端词性码。
interface PosOption {
  value: number
  label: string
}
const POS_OPTIONS: PosOption[] = Object.keys(POS_SW_MAP)
  .map((k) => Number(k))
  .filter((code) => code !== 0)
  .map((code) => ({
    value: code,
    label: `${POS_SW_MAP[code]} ${POS_CN_MAP[code]}`
  }))

// 单词表单里的一个词性块（词性码 + 该词性下的中文释义）。
interface PosBlock {
  // 词性码（默认取第一个可选项）
  pos: number
  // 该词性的中文释义
  translation: string
}

interface WordForm {
  word: string
  ukPhonetic: string
  usPhonetic: string
  pos: PosBlock[]
  isGeneratePicture: boolean
}

interface PhraseForm {
  phrase: string
  translation: string
  pronunciation: string
  isGeneratePicture: boolean
}

interface PageData {
  // 'word' 单词 / 'phrase' 短语
  kind: 'word' | 'phrase'
  posOptions: PosOption[]
  wordForm: WordForm
  phraseForm: PhraseForm
  // 提交中（禁用按钮 + loading）
  submitting: boolean
  // 单词表单是否可提交（word 去空非空 且 至少一条释义去空非空）
  wordValid: boolean
  // 短语表单是否可提交（phrase 去空非空）
  phraseValid: boolean
}

// 新建一个默认词性块（词性取第一项，释义空）
function blankPosBlock(): PosBlock {
  const first = POS_OPTIONS[0]
  return { pos: first ? first.value : 1, translation: '' }
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    kind: 'word',
    posOptions: POS_OPTIONS,
    wordForm: {
      word: '',
      ukPhonetic: '',
      usPhonetic: '',
      pos: [blankPosBlock()],
      isGeneratePicture: false
    },
    phraseForm: {
      phrase: '',
      translation: '',
      pronunciation: '',
      isGeneratePicture: false
    },
    submitting: false,
    wordValid: false,
    phraseValid: false
  },

  // ---------------- 顶部切换 ----------------
  onSwitchKind(e: WechatMiniprogram.TouchEvent) {
    const kind = e.currentTarget.dataset.kind as 'word' | 'phrase'
    if (kind && kind !== this.data.kind && !this.data.submitting) {
      this.setData({ kind })
    }
  },

  // ---------------- 单词表单输入 ----------------
  onWordInput(e: WechatMiniprogram.Input) {
    this.setData({ 'wordForm.word': e.detail.value }, () => this.recomputeWordValid())
  },

  onUkPhoneticInput(e: WechatMiniprogram.Input) {
    this.setData({ 'wordForm.ukPhonetic': e.detail.value })
  },

  onUsPhoneticInput(e: WechatMiniprogram.Input) {
    this.setData({ 'wordForm.usPhonetic': e.detail.value })
  },

  // 选中某个词性块的词性（自绘 chip，data-index 块下标，data-pos 词性码）
  onPickPos(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const pos = Number(e.currentTarget.dataset.pos)
    if (Number.isNaN(index) || Number.isNaN(pos)) {
      return
    }
    this.setData({ [`wordForm.pos[${index}].pos`]: pos })
  },

  // 某个词性块的释义输入
  onPosTranslationInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) {
      return
    }
    this.setData(
      { [`wordForm.pos[${index}].translation`]: e.detail.value },
      () => this.recomputeWordValid()
    )
  },

  // 新增一个词性块
  onAddPos() {
    const pos = this.data.wordForm.pos.concat(blankPosBlock())
    this.setData({ 'wordForm.pos': pos }, () => this.recomputeWordValid())
  },

  // 删除一个词性块（至少保留一个）
  onRemovePos(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index) || this.data.wordForm.pos.length <= 1) {
      return
    }
    const pos = this.data.wordForm.pos.slice()
    pos.splice(index, 1)
    this.setData({ 'wordForm.pos': pos }, () => this.recomputeWordValid())
  },

  onWordGenToggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ 'wordForm.isGeneratePicture': !!e.detail.value })
  },

  // 单词可提交：word 去空非空 且 至少一条词性释义去空非空
  recomputeWordValid() {
    const f = this.data.wordForm
    const hasWord = !!f.word.trim()
    const hasTranslation = f.pos.some((p) => !!p.translation.trim())
    this.setData({ wordValid: hasWord && hasTranslation })
  },

  // ---------------- 短语表单输入 ----------------
  onPhraseInput(e: WechatMiniprogram.Input) {
    this.setData({ 'phraseForm.phrase': e.detail.value }, () => this.recomputePhraseValid())
  },

  onPhraseTranslationInput(e: WechatMiniprogram.Input) {
    this.setData({ 'phraseForm.translation': e.detail.value })
  },

  onPronunciationInput(e: WechatMiniprogram.Input) {
    this.setData({ 'phraseForm.pronunciation': e.detail.value })
  },

  onPhraseGenToggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ 'phraseForm.isGeneratePicture': !!e.detail.value })
  },

  // 短语可提交：phrase 去空非空
  recomputePhraseValid() {
    this.setData({ phraseValid: !!this.data.phraseForm.phrase.trim() })
  },

  // ---------------- 提交 ----------------
  onSubmit() {
    if (this.data.submitting) {
      return
    }
    if (this.data.kind === 'word') {
      this.submitWord()
    } else {
      this.submitPhrase()
    }
  },

  async submitWord() {
    const f = this.data.wordForm
    const word = f.word.trim()
    if (!word) {
      wx.showToast({ title: '请输入单词', icon: 'none' })
      return
    }
    // 只提交「有释义」的词性块；word_id 占位 0（后端新增时按返回的 word 自行关联）。
    const pos: WordPos[] = f.pos
      .filter((p) => !!p.translation.trim())
      .map((p) => ({
        word_id: 0,
        pos: p.pos,
        translation: p.translation.trim()
      }))
    if (!pos.length) {
      wx.showToast({ title: '至少填写一条释义', icon: 'none' })
      return
    }
    const req: AddWordParams = {
      word,
      uk_phonetic: f.ukPhonetic.trim(),
      us_phonetic: f.usPhonetic.trim(),
      pos,
      is_generate_picture: f.isGeneratePicture
    }
    this.setData({ submitting: true })
    try {
      await addWord(req)
      this.afterAdded('已添加单词')
    } catch (e) {
      // request 层已统一 toast；仅恢复按钮态
    } finally {
      this.setData({ submitting: false })
    }
  },

  async submitPhrase() {
    const f = this.data.phraseForm
    const phrase = f.phrase.trim()
    if (!phrase) {
      wx.showToast({ title: '请输入短语', icon: 'none' })
      return
    }
    const example: Example[] = []
    const req: AddPhraseParams = {
      phrase,
      translation: f.translation.trim(),
      pronunciation: f.pronunciation.trim(),
      example,
      is_generate_picture: f.isGeneratePicture
    }
    this.setData({ submitting: true })
    try {
      await addPhrase(req)
      this.afterAdded('已添加短语')
    } catch (e) {
      // request 层已统一 toast
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 成功后：toast + 回到上一页（词库列表）。toast 短暂展示再返回，避免被销毁打断。
  afterAdded(title: string) {
    wx.showToast({ title, icon: 'success', duration: 800 })
    setTimeout(() => {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        // 无上一页（直接进入）兜底：重置表单续添
        this.resetForms()
      }
    }, 800)
  },

  // 重置两套表单到初始态
  resetForms() {
    this.setData({
      wordForm: {
        word: '',
        ukPhonetic: '',
        usPhonetic: '',
        pos: [blankPosBlock()],
        isGeneratePicture: false
      },
      phraseForm: {
        phrase: '',
        translation: '',
        pronunciation: '',
        isGeneratePicture: false
      },
      wordValid: false,
      phraseValid: false
    })
  }
})
