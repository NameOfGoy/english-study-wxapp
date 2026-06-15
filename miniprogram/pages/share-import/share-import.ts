// pages/share-import/share-import.ts —— 使用分享码导入（navigateTo 进入的普通页）
// 复刻 H5 src/components/dictionary/ShareImportModal.vue 的三步流 + 词条详情弹层：
//   第①步 输码：textarea 粘贴分享码 →「预览」(previewShare)。
//   第②步 预览：来自谁 / 数量 / 整体标签 + 标签导入模式(0不带/1仅系统/2全部,默认0,仅有标签时显示)
//             + 词条列表(点条目 → 详情弹层 getShareWordDetail) + 底部「重新输入 / 确认导入」(importShare)。
//   第③步 结果：导入统计(新增单词/短语 + 跳过数 + 新建标签数) →「完成」navigateBack。
// 导入成功后置 storage 脏标记 'wordbook_dirty'，回到词库 onShow 会强制重载。
//
// ⚠️ WXML 不能调方法：isPhrase / key / 选中态 / 例句归一 全部在 ts 预算成扁平字段。
import { previewShare, importShare, getShareWordDetail } from '../../services/share'
import { resolveAsset } from '../../utils/asset'
import { POS_CN_MAP } from '../../services/types'
import parseExamples from '../../utils/parseExamples'
import type { ParsedExample } from '../../utils/parseExamples'
import type { ShareWordItem, SharePreviewTag, WordType } from '../../services/types'

/** 预览词条渲染单元 */
interface PreviewItemVM {
  id: number
  wordType: WordType
  text: string
  translation: string
  tagNames: string[]
  /** word_type===2 → 显示「短语」小标 */
  isPhrase: boolean
  /** wx:key 用：'1_123' */
  key: string
}

/** 标签导入模式单选项 */
interface TagModeOption {
  value: 0 | 1 | 2
  label: string
}
const TAG_MODE_OPTIONS: TagModeOption[] = [
  { value: 0, label: '不带' },
  { value: 1, label: '仅系统' },
  { value: 2, label: '全部' }
]

/** 详情弹层：单词词性块 */
interface PosVM {
  posLabel: string
  translation: string
  /** 已 resolveAsset 的图片 URL（空串 = 无图） */
  pictureUrl: string
  examples: ParsedExample[]
}

/** 详情弹层：音标行 */
interface PhoneticVM {
  label: string
  text: string
}

interface PageData {
  /** 三步：input / preview / result */
  step: 'input' | 'preview' | 'result'
  token: string
  /** token 去空白后非空（驱动「预览」按钮可用，WXML 不能 trim） */
  canPreview: boolean
  previewing: boolean
  submitting: boolean

  // —— 预览数据 ——
  fromUsername: string
  wordCount: number
  phraseCount: number
  showWordCount: boolean
  showPhraseCount: boolean
  /** 单词与短语都 >0 → 显示中间分隔点 */
  showDot: boolean
  previewTags: SharePreviewTag[]
  hasTags: boolean
  items: PreviewItemVM[]

  // —— 标签导入模式 ——
  tagModeOptions: TagModeOption[]
  tagImportMode: number

  // —— 导入结果 ——
  rWordImported: number
  rPhraseImported: number
  rWordSkipped: number
  rPhraseSkipped: number
  rTagImported: number
  showWordSkip: boolean
  showPhraseSkip: boolean
  showTagImport: boolean

  // —— 详情弹层 ——
  detailVisible: boolean
  detailLoading: boolean
  detailTitle: string
  /** '' / 'word' / 'phrase' 决定渲染分支 */
  detailKind: '' | 'word' | 'phrase'
  detailPhonetics: PhoneticVM[]
  detailPosList: PosVM[]
  detailPhraseTranslation: string
  detailPhrasePictureUrl: string
  detailPhraseExamples: ParsedExample[]
  /** 图片加载失败回退集合（url -> true） */
  picErrorMap: Record<string, boolean>
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    step: 'input',
    token: '',
    canPreview: false,
    previewing: false,
    submitting: false,

    fromUsername: '',
    wordCount: 0,
    phraseCount: 0,
    showWordCount: false,
    showPhraseCount: false,
    showDot: false,
    previewTags: [],
    hasTags: false,
    items: [],

    tagModeOptions: TAG_MODE_OPTIONS,
    tagImportMode: 0,

    rWordImported: 0,
    rPhraseImported: 0,
    rWordSkipped: 0,
    rPhraseSkipped: 0,
    rTagImported: 0,
    showWordSkip: false,
    showPhraseSkip: false,
    showTagImport: false,

    detailVisible: false,
    detailLoading: false,
    detailTitle: '',
    detailKind: '',
    detailPhonetics: [],
    detailPosList: [],
    detailPhraseTranslation: '',
    detailPhrasePictureUrl: '',
    detailPhraseExamples: [],
    picErrorMap: {}
  },

  /** 分享码输入（textarea）→ 同步 token + 预算 canPreview */
  onTokenInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value || ''
    this.setData({ token: v, canPreview: v.trim().length > 0 })
  },

  /** 第①→②步：预览分享内容 */
  async onPreview() {
    const token = this.data.token.trim()
    if (!token || this.data.previewing) {
      return
    }
    this.setData({ previewing: true })
    try {
      const resp = await previewShare(token)
      const items: PreviewItemVM[] = (resp.items || []).map(
        (it: ShareWordItem): PreviewItemVM => ({
          id: it.id,
          wordType: it.word_type,
          text: it.text,
          translation: it.translation || '',
          tagNames: it.tag_names || [],
          isPhrase: it.word_type === 2,
          key: it.word_type + '_' + it.id
        })
      )
      const tags = resp.tags || []
      const wc = resp.word_count || 0
      const pc = resp.phrase_count || 0
      this.setData({
        step: 'preview',
        fromUsername: resp.from_username || '匿名用户',
        wordCount: wc,
        phraseCount: pc,
        showWordCount: wc > 0,
        showPhraseCount: pc > 0,
        showDot: wc > 0 && pc > 0,
        previewTags: tags,
        hasTags: tags.length > 0,
        items,
        // 切回预览时重置标签模式为默认「不带」
        tagImportMode: 0
      })
    } catch (e) {
      // request 层已统一 toast（分享码无效/过期/网络），这里仅恢复按钮态
    } finally {
      this.setData({ previewing: false })
    }
  },

  /** 标签导入模式单选 */
  onPickTagMode(e: WechatMiniprogram.TouchEvent) {
    const v = Number(e.currentTarget.dataset.value)
    this.setData({ tagImportMode: v })
  },

  /** 点词条 → 打开详情弹层，拉分享词详情 */
  async onItemTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const wordType = Number(e.currentTarget.dataset.type) as WordType
    const text = String(e.currentTarget.dataset.text || '')
    const token = this.data.token.trim()

    this.setData({
      detailVisible: true,
      detailLoading: true,
      detailTitle: text || '详情',
      detailKind: '',
      detailPhonetics: [],
      detailPosList: [],
      detailPhraseTranslation: '',
      detailPhrasePictureUrl: '',
      detailPhraseExamples: [],
      picErrorMap: {}
    })

    try {
      const resp = await getShareWordDetail(token, id, wordType)
      if (resp.word) {
        const w = resp.word
        const phonetics: PhoneticVM[] = []
        if (w.uk_phonetic) phonetics.push({ label: '英', text: w.uk_phonetic })
        if (w.us_phonetic) phonetics.push({ label: '美', text: w.us_phonetic })
        const posList: PosVM[] = (w.pos || []).map((p): PosVM => ({
          posLabel: POS_CN_MAP[p.pos || 0] || '词性',
          translation: p.translation || '',
          pictureUrl: resolveAsset(p.picture),
          // example 字段历史数据异构 → 统一过 parseExamples 归一为 {en, zh}
          examples: parseExamples((p.example as unknown as string[]) || [])
        }))
        this.setData({
          detailLoading: false,
          detailKind: 'word',
          detailPhonetics: phonetics,
          detailPosList: posList
        })
      } else if (resp.phrase) {
        const ph = resp.phrase
        this.setData({
          detailLoading: false,
          detailKind: 'phrase',
          detailPhraseTranslation: ph.translation || '',
          detailPhrasePictureUrl: resolveAsset(ph.picture),
          detailPhraseExamples: parseExamples(
            (ph.example as unknown as string[]) || []
          )
        })
      } else {
        // 后端没回 word/phrase：关闭弹层（request 已 toast 的情况走 catch）
        this.setData({ detailVisible: false, detailLoading: false })
      }
    } catch (e) {
      this.setData({ detailVisible: false, detailLoading: false })
    }
  },

  /** 详情图片加载失败 → 记录 url，WXML 回退 emoji 占位 */
  onPicError(e: WechatMiniprogram.BaseEvent) {
    const url = String(e.currentTarget.dataset.url || '')
    if (!url) return
    this.setData({ picErrorMap: { ...this.data.picErrorMap, [url]: true } })
  },

  closeDetail() {
    this.setData({ detailVisible: false })
  },

  /** 第②→③步：确认导入 */
  async onConfirm() {
    if (this.data.submitting) {
      return
    }
    const token = this.data.token.trim()
    this.setData({ submitting: true })
    try {
      const resp = await importShare(token, this.data.tagImportMode as 0 | 1 | 2)
      this.setData({
        step: 'result',
        rWordImported: resp.word_imported || 0,
        rPhraseImported: resp.phrase_imported || 0,
        rWordSkipped: resp.word_skipped || 0,
        rPhraseSkipped: resp.phrase_skipped || 0,
        rTagImported: resp.tag_imported || 0,
        showWordSkip: (resp.word_skipped || 0) > 0,
        showPhraseSkip: (resp.phrase_skipped || 0) > 0,
        showTagImport: (resp.tag_imported || 0) > 0
      })
      // 词库已变 → 置脏标记，回词库 onShow 强制重载
      wx.setStorageSync('wordbook_dirty', true)
    } catch (e) {
      // request 层已统一 toast，仅恢复按钮态
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 「重新输入」：回第①步并清空（同 H5 reset） */
  onReset() {
    this.setData({
      step: 'input',
      token: '',
      canPreview: false,
      items: [],
      previewTags: [],
      hasTags: false,
      tagImportMode: 0
    })
  },

  /** 「关闭 / 完成」：返回上一页（词库） */
  onClose() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/wordbook/wordbook' }) })
  },

  /** 弹层卡片内点击占位，阻止冒泡到蒙层关闭 */
  noop() {}
})
