// components/article-renderer —— 文章双语高亮渲染（即时结果页 + 收录详情页共用）
// 复刻 H5 src/components/article/ArticleRenderer.vue：
//   头部(标题英/中 + 标签) + 双语正文(英文含高亮可点, 中文整句) + (可选)收录/返回固定栏。
//
// 与 H5 的差异（小程序适配）：H5 点高亮词弹「浮动气泡卡」(teleport+getBoundingClientRect 定位)，
//   小程序无 teleport、组件内 fixed 定位+SelectorQuery 易碎，改为**底部弹出释义卡**(更稳, 适合手机阅读)。
//   释义内容忠实保留：按词性分行 senses / 兜底 meaning / 词库未找到态 / 音标。
import { buildSegments, wordKey } from '../../utils/articleHighlight'
import type { Segment } from '../../utils/articleHighlight'
import type { ArticleView, ArticleUsedWord, ArticleSense } from '../../services/types'

/** 渲染用：一段（带稳定 key + 是否高亮 flag） */
interface SegVM extends Segment {
  id: string
  hl: boolean
}

/** 渲染用：一句（英文段数组 + 中文整句） */
interface SentenceVM {
  id: number
  zh: string
  segs: SegVM[]
}

Component({
  options: {
    // 让页面/全局样式（含 CSS 变量）可作用于组件；组件样式不外泄
    styleIsolation: 'apply-shared'
  },

  properties: {
    /** 文章完整渲染体 */
    article: {
      type: Object,
      value: {} as ArticleView
    },
    /** 是否显示底部「收录/返回」栏（即时结果页 true，详情页 false） */
    showArchive: {
      type: Boolean,
      value: false
    },
    /** 收录请求进行中（按钮 loading） */
    archiving: {
      type: Boolean,
      value: false
    },
    /** 是否已收录（按钮置为「已收录」并禁用） */
    archived: {
      type: Boolean,
      value: false
    }
  },

  data: {
    sentenceSegs: [] as SentenceVM[],
    hasTags: false,
    titleZh: '',
    // (word,type) → used_word 的查表，气泡卡查词用（不参与渲染，但放 data 规避组件实例字段的 TS 限制）
    wordMap: {} as Record<string, ArticleUsedWord>,
    // —— 底部释义弹卡 ——
    bubbleVisible: false,
    bubbleWord: '',
    bubbleSenses: [] as ArticleSense[],
    bubbleHasSenses: false,
    bubbleFallback: '',
    bubblePhonetic: ''
  },

  observers: {
    // article 属性变化（页面 setData 后）→ 重算分段 + wordMap
    article(article: ArticleView) {
      this._rebuild(article)
    }
  },

  methods: {
    /** 由 article 重建分段渲染数据 + wordMap（气泡卡查词用） */
    _rebuild(article: ArticleView) {
      const used: ArticleUsedWord[] = (article && article.used_words) || []
      const map: Record<string, ArticleUsedWord> = {}
      for (const u of used) {
        map[wordKey(u.word, u.word_type)] = u
      }

      const sentences = (article && article.sentences) || []
      const sentenceSegs: SentenceVM[] = sentences.map((s, i): SentenceVM => ({
        id: i,
        zh: s.zh || '',
        segs: buildSegments(s.en || '', used).map((seg, j): SegVM => ({
          text: seg.text,
          word: seg.word,
          type: seg.type,
          id: i + '_' + j,
          hl: !!seg.word
        }))
      }))

      this.setData({
        sentenceSegs,
        wordMap: map,
        hasTags: !!(article && article.tags && article.tags.length),
        titleZh: (article && article.title_zh) || ''
      })
    },

    /** 点高亮词 → 底部弹出释义卡 */
    onTapWord(e: WechatMiniprogram.TouchEvent) {
      const word = String(e.currentTarget.dataset.word || '')
      if (!word) {
        return
      }
      const type = Number(e.currentTarget.dataset.type)
      const info: Partial<ArticleUsedWord> =
        this.data.wordMap[wordKey(word, type)] || {}
      const senses = info.senses || []
      this.setData({
        bubbleVisible: true,
        bubbleWord: word,
        bubbleSenses: senses,
        bubbleHasSenses: senses.length > 0,
        bubbleFallback:
          info.found !== false ? info.meaning || '—' : '（词库中未找到）',
        bubblePhonetic: info.phonetic || '—'
      })
    },

    closeBubble() {
      this.setData({ bubbleVisible: false })
    },

    /** 阻止弹卡内部点击冒泡到蒙层 */
    noop() {},

    /** 收录 / 返回练习：抛事件给宿主页面处理 */
    onArchive() {
      this.triggerEvent('archive')
    },
    onHome() {
      this.triggerEvent('home')
    }
  }
})
