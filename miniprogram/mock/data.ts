// mock/data.ts —— 展示原型假数据（无任何接口调用）
// 所有页面从这里 import 数据；字段贴合各页面消费需要。

/* ============ 类型定义 ============ */

/** 四个练习模式标识 */
export type ModeKey = 'study' | 'review' | 'strength' | 'spot'

/** 单词状态（决定 .badge-status 类名后缀） */
export type WordStatus = 'new' | 'learning' | 'strength' | 'mastered' | 'unknown'

export interface ModeMeta {
  key: ModeKey
  name: string          // 学习/复习/加强/抽查
  emoji: string         // 📘🔁💪🎯
  desc: string          // 一句简介
  count: number         // 待练数量
  /** 对应的 CSS 变量名，页面直接 style="--mode:var(--mode-study)" */
  colorVar: string      // 'var(--mode-study)' 等
  path: string          // wx.navigateTo 目标
}

export interface ExampleSentence {
  en: string
  zh: string
}

export interface WordItem {
  id: number
  word: string
  phoneticUS: string    // 美式音标，如 /əˈbænd(ə)n/
  phoneticUK: string    // 英式音标
  pos: string           // 词性，如 v. / n. / adj.
  meaning: string       // 中文释义
  examples: ExampleSentence[]
  status: WordStatus
  /** 占位图主题色（CSS 变量字符串） + emoji */
  colorVar: string
  emoji: string
  isPhrase?: boolean    // 是否短语（词库词/短语切换用）
}

export interface SettingEntry {
  id: string
  emoji: string
  text: string
  path: string          // 占位路径，原型不跳转
}

/* ============ 首页 home ============ */
export const homeData = {
  greetingName: '同学',
  greetingHi: '👋',
  streakDays: 7,            // 🔥 连续打卡天数
  todayDone: 32,           // 今日已完成
  todayTotal: 47,          // 今日总数
  get todayPercent(): number {
    return Math.round((this.todayDone / this.todayTotal) * 100) // 68
  },
  // 今日完成小统计（已学/已复习/已加强/已抽查）
  todayStats: [
    { label: '已学习', value: 12, emoji: '📘' },
    { label: '已复习', value: 10, emoji: '🔁' },
    { label: '已加强', value: 6, emoji: '💪' },
    { label: '已抽查', value: 4, emoji: '🎯' }
  ]
}

/* ============ 四个练习模式（首页入口卡 & 练习 hub 共用） ============ */
export const modes: ModeMeta[] = [
  {
    key: 'study',
    name: '学习',
    emoji: '📘',
    desc: '认识新单词，建立第一印象',
    count: 18,
    colorVar: 'var(--mode-study)',
    path: '/pages/study/study'
  },
  {
    key: 'review',
    name: '复习',
    emoji: '🔁',
    desc: '看图回忆，巩固昨日所学',
    count: 24,
    colorVar: 'var(--mode-review)',
    path: '/pages/review/review'
  },
  {
    key: 'strength',
    name: '加强',
    emoji: '💪',
    desc: '反复确认，攻克易忘词',
    count: 9,
    colorVar: 'var(--mode-strength)',
    path: '/pages/strength/strength'
  },
  {
    key: 'spot',
    name: '抽查',
    emoji: '🎯',
    desc: '随机检测，查漏补缺',
    count: 50,
    colorVar: 'var(--mode-spot)',
    path: '/pages/spot/spot'
  }
]

/** 按 key 取模式色，供 study/review/strength/spot 页直接使用 */
export const modeColor: Record<ModeKey, string> = {
  study: 'var(--mode-study)',
  review: 'var(--mode-review)',
  strength: 'var(--mode-strength)',
  spot: 'var(--mode-spot)'
}

/* ============ 示例单词（学习/复习/加强/抽查/词库共用） ============ */
export const words: WordItem[] = [
  {
    id: 1,
    word: 'abandon',
    phoneticUS: '/əˈbændən/',
    phoneticUK: '/əˈbændən/',
    pos: 'v.',
    meaning: '抛弃，放弃；遗弃',
    examples: [
      { en: 'He had to abandon his car in the snow.', zh: '他不得不把车丢弃在雪地里。' },
      { en: 'They abandoned the idea of building a bridge.', zh: '他们放弃了建桥的想法。' }
    ],
    status: 'new',
    colorVar: 'var(--mode-study)',
    emoji: '🧳'
  },
  {
    id: 2,
    word: 'benefit',
    phoneticUS: '/ˈbenɪfɪt/',
    phoneticUK: '/ˈbenɪfɪt/',
    pos: 'n. & v.',
    meaning: '利益，好处；受益',
    examples: [
      { en: 'Regular exercise has many health benefits.', zh: '规律运动对健康有许多好处。' },
      { en: 'We all benefit from a good night sleep.', zh: '我们都能从一夜好眠中受益。' }
    ],
    status: 'learning',
    colorVar: 'var(--mode-review)',
    emoji: '🎁'
  },
  {
    id: 3,
    word: 'curious',
    phoneticUS: '/ˈkjʊriəs/',
    phoneticUK: '/ˈkjʊəriəs/',
    pos: 'adj.',
    meaning: '好奇的；求知欲强的',
    examples: [
      { en: 'Children are naturally curious about the world.', zh: '孩子天生对世界充满好奇。' },
      { en: 'I am curious to know what happened next.', zh: '我很想知道接下来发生了什么。' }
    ],
    status: 'strength',
    colorVar: 'var(--mode-strength)',
    emoji: '🔍'
  },
  {
    id: 4,
    word: 'determine',
    phoneticUS: '/dɪˈtɜːrmɪn/',
    phoneticUK: '/dɪˈtɜːmɪn/',
    pos: 'v.',
    meaning: '决定；确定；查明',
    examples: [
      { en: 'Your attitude can determine your success.', zh: '你的态度能决定你的成功。' },
      { en: 'Scientists try to determine the cause.', zh: '科学家试图查明原因。' }
    ],
    status: 'mastered',
    colorVar: 'var(--mode-spot)',
    emoji: '🎯'
  },
  {
    id: 5,
    word: 'efficient',
    phoneticUS: '/ɪˈfɪʃ(ə)nt/',
    phoneticUK: '/ɪˈfɪʃ(ə)nt/',
    pos: 'adj.',
    meaning: '高效的；效率高的',
    examples: [
      { en: 'The new system is much more efficient.', zh: '新系统的效率高得多。' },
      { en: 'She is an efficient and reliable worker.', zh: '她是个高效可靠的员工。' }
    ],
    status: 'learning',
    colorVar: 'var(--mode-review)',
    emoji: '⚡'
  },
  {
    id: 6,
    word: 'fragile',
    phoneticUS: '/ˈfrædʒ(ə)l/',
    phoneticUK: '/ˈfrædʒaɪl/',
    pos: 'adj.',
    meaning: '易碎的；脆弱的',
    examples: [
      { en: 'Please handle this fragile package with care.', zh: '请小心轻放这个易碎包裹。' },
      { en: 'The peace between them was fragile.', zh: '他们之间的和平很脆弱。' }
    ],
    status: 'new',
    colorVar: 'var(--mode-study)',
    emoji: '🥚'
  },
  {
    id: 7,
    word: 'genuine',
    phoneticUS: '/ˈdʒenjuɪn/',
    phoneticUK: '/ˈdʒenjuɪn/',
    pos: 'adj.',
    meaning: '真正的；真诚的',
    examples: [
      { en: 'She showed genuine interest in the project.', zh: '她对这个项目表现出真诚的兴趣。' },
      { en: 'Is this a genuine leather bag?', zh: '这是真皮包吗？' }
    ],
    status: 'unknown',
    colorVar: 'var(--mode-spot)',
    emoji: '💎'
  },
  {
    id: 8,
    word: 'hesitate',
    phoneticUS: '/ˈhezɪteɪt/',
    phoneticUK: '/ˈhezɪteɪt/',
    pos: 'v.',
    meaning: '犹豫；踌躇',
    examples: [
      { en: 'Do not hesitate to ask for help.', zh: '需要帮助时别犹豫。' },
      { en: 'He hesitated before answering.', zh: '他回答前犹豫了一下。' }
    ],
    status: 'strength',
    colorVar: 'var(--mode-strength)',
    emoji: '🤔'
  }
]

/** 短语示例（词库 词/短语切换用） */
export const phrases: WordItem[] = [
  {
    id: 101,
    word: 'give up',
    phoneticUS: '/ɡɪv ʌp/',
    phoneticUK: '/ɡɪv ʌp/',
    pos: 'phr.',
    meaning: '放弃；停止',
    examples: [
      { en: 'Never give up on your dreams.', zh: '永远不要放弃你的梦想。' }
    ],
    status: 'learning',
    colorVar: 'var(--mode-review)',
    emoji: '🙅',
    isPhrase: true
  },
  {
    id: 102,
    word: 'look forward to',
    phoneticUS: '/lʊk ˈfɔːrwərd tuː/',
    phoneticUK: '/lʊk ˈfɔːwəd tuː/',
    pos: 'phr.',
    meaning: '期待，盼望',
    examples: [
      { en: 'I look forward to hearing from you.', zh: '我期待你的回复。' }
    ],
    status: 'mastered',
    colorVar: 'var(--mode-spot)',
    emoji: '🌅',
    isPhrase: true
  },
  {
    id: 103,
    word: 'take care of',
    phoneticUS: '/teɪk ker əv/',
    phoneticUK: '/teɪk keə əv/',
    pos: 'phr.',
    meaning: '照顾；处理',
    examples: [
      { en: 'Please take care of yourself.', zh: '请照顾好自己。' }
    ],
    status: 'new',
    colorVar: 'var(--mode-study)',
    emoji: '🤲',
    isPhrase: true
  }
]

/* ============ 词库视图切换胶囊 / 状态标签中文映射 ============ */
export const wordbookViews = [
  { key: 'alpha', label: '字母' },
  { key: 'status', label: '状态' },
  { key: 'tag', label: '标签' }
]

/** 状态 → 中文文案 + .badge-status 修饰类后缀 */
export const statusMeta: Record<WordStatus, { text: string; cls: string }> = {
  new:       { text: '新词',   cls: 'badge-status--new' },
  learning:  { text: '学习中', cls: 'badge-status--learning' },
  strength:  { text: '加强中', cls: 'badge-status--strength' },
  mastered:  { text: '已掌握', cls: 'badge-status--mastered' },
  unknown:   { text: '不熟',   cls: 'badge-status--unknown' }
}

/* ============ 加强 / 抽查 进度 ============ */
export const strengthData = {
  // 顶部连续记得进度 2/3
  needStreak: 3,
  currentStreak: 2
}

export const spotData = {
  // 本次抽查 12/50
  current: 12,
  total: 50
}

/* ============ 个人页 profile ============ */
export const profileData = {
  nickname: '英语小达人',
  avatarEmoji: '🦊',          // 用 emoji 占位头像，不用外链
  stats: [
    { label: '总词数', value: 1280 },
    { label: '已掌握', value: 860 },
    { label: '连续天数', value: 7 }
  ],
  settings: <SettingEntry[]>[
    { id: 'profile', emoji: '🪪', text: '个人资料', path: '' },
    { id: 'tags', emoji: '🏷️', text: '标签管理', path: '' },
    { id: 'import', emoji: '📥', text: '导入历史', path: '' },
    { id: 'about', emoji: 'ℹ️', text: '关于', path: '' }
  ]
}
