// services/types.ts —— 后端契约的 TS 类型定义（与 go-zero 后端字段一一对应）
// 命名约定：直接照搬后端 JSON key（snake_case），不在这里做驼峰转换，
// 以便 service 层零成本透传；页面层如需驼峰可自行映射。

/* ============ 通用响应包装 ============ */
// 后端 HTTP 恒为 200，业务结果靠 body.code 区分：code===0 才算成功。
// JSON key 是 "message"（不是 msg）。多数业务数据在 "data"；登录类把 token 放顶层。

/** 所有接口响应的公共字段 */
export interface BaseReply {
  code: number
  message: string
  reason?: string
}

/** data 在 "data" 键下的通用响应 */
export interface DataReply<T> extends BaseReply {
  data: T
}

/** 带分页元信息的列表响应（分页字段在顶层，列表在 data） */
export interface PageReply<T> extends BaseReply {
  data: T[]
  offset: number
  limit: number
  total_count: number
}

/* ============ 用户 / 鉴权 ============ */

export interface UserInfo {
  id: number
  name: string
  account: string
  phone: string
  email: string
  /** 头像相对资源路径，渲染前用 resolveAsset 处理 */
  avatar: string
  /** 角色码 */
  role: number
}

/** 登录响应：token 在顶层，用户信息在 data */
export interface LoginReply extends BaseReply {
  token: string
  data: UserInfo
}

/* ============ 首页 dashboard ============ */

export interface DashboardData {
  /** 待学习数量 */
  study_count: number
  /** 待复习数量 */
  review_count: number
  /** 待加强数量 */
  strengthen_count: number
  /** 待抽查数量 */
  spot_count: number
  /** 今日已学习 */
  today_studied: number
  /** 今日已复习 */
  today_reviewed: number
  /** 今日已加强 */
  today_strengthened: number
  /** 总词数 */
  total_words: number
  /** 已完成词数 */
  finished_words: number
  /** 总体进度 0~1 */
  progress_rate: number
}

/* ============ 练习 practise ============ */

/** 四个练习模式标识 */
export type PractiseMode = 'study' | 'review' | 'strength' | 'spot'

/** 词条类型：1=单词，2=短语 */
export type WordType = 1 | 2

/** 单条释义项 */
export interface TranslationItem {
  id: number
  /** 词性码 */
  pos: number
  /** 词性标签，如 "n." / "vt." */
  pos_label: string
  /** 该词性下的中文释义 */
  translation: string
}

/** 练习卡片（study/review/strength/spot list 返回的元素） */
export interface WordCard {
  id: number
  word: string
  /** 1=单词，2=短语 */
  word_type: WordType
  /** 英式音标 */
  uk_phonetic: string
  /** 英式发音音频相对URL（短语只有这个，没有 us_audio） */
  uk_audio: string
  /** 美式音标 */
  us_phonetic: string
  /** 美式发音音频相对URL */
  us_audio: string
  /** 多行释义，用 \n 分隔，如 "n. xx\nvt. yy"；短语为直接中文 */
  translation: string
  /** 例句数组，串内可能含中/英用 \n 分隔；短语恒单元素 */
  example: string[]
  /** 配图相对URL数组；短语恒单元素 */
  picture: string[]
  /** 配图对应的词性ID数组 */
  picture_pos_ids: number[]
  /** 结构化释义项；短语此项可能为空 */
  translation_items: TranslationItem[]
}

/** 复习提交结果：1=完成，2=失败 */
export type ReviewOperation = 1 | 2
/** 加强提交结果：1=完成，2=失败 */
export type StrengthOperation = 1 | 2
/** 抽查提交结果：1=通过，2=失败 */
export type SpotOperation = 1 | 2

/** 练习列表请求参数 */
export interface PractiseListParams {
  /** 取词数量，默认 10 */
  count?: number
  /** 是否随机 */
  random?: boolean
  /** 词条类型过滤：0=全部，1=单词，2=短语 */
  word_type?: 0 | 1 | 2
  /** 标签ID过滤 */
  tag_ids?: number[]
}

/* ============ 词库 dictionary ============ */

/** 词库列表项（精简，仅 id+word） */
export interface SimpleWord {
  id: number
  word: string
}

/**
 * 短语列表项（精简，仅 id+word）。
 * 后端 phrase/list 复用 SimpleWord 结构返回（word 字段装的是短语文本），
 * 这里取别名以区分语义。
 */
export type SimplePhrase = SimpleWord

/** 一条例句（英文 + 中文翻译） */
export interface Example {
  /** 例句（英文） */
  example: string
  /** 中文翻译 */
  translation: string
}

/**
 * 词性枚举（后端 internal/types/enum.go WordPosXxx）。
 * 0=未知 1=名词 2=及物动词 3=不及物动词 4=副词 5=形容词
 * 6=介词 7=连词 8=感叹词 9=助词 10=代词 11=数词 12=冠词 13=辅助动词
 */
export type WordPosCode = number

/** 词性缩写表：WordPosCode -> 英文缩写（与后端 WordPosSwMap 一致） */
export const POS_SW_MAP: Record<number, string> = {
  0: 'unknown',
  1: 'n.',
  2: 'vt.',
  3: 'vi.',
  4: 'adv.',
  5: 'adj.',
  6: 'prep.',
  7: 'conj.',
  8: 'interj.',
  9: 'part.',
  10: 'pron.',
  11: 'num.',
  12: 'art.',
  13: 'aux.'
}

/** 词性中文名表：WordPosCode -> 中文（与后端 WordPosChineseMap 一致） */
export const POS_CN_MAP: Record<number, string> = {
  0: '未知',
  1: '名词',
  2: '及物动词',
  3: '不及物动词',
  4: '副词',
  5: '形容词',
  6: '介词',
  7: '连词',
  8: '感叹词',
  9: '助词',
  10: '代词',
  11: '数词',
  12: '冠词',
  13: '辅助动词'
}

/**
 * 单词词性（一个单词可有多个词性）。与后端 WordPos 字段一一对应。
 * 注意：id 为可选（自定义词性 id 从 100W 起；新增时可不传）。
 */
export interface WordPos {
  /** 词性ID（可选；自定义词性 id 从 100W 起） */
  id?: number
  /** 所属单词ID */
  word_id: number
  /** 单词文本（可选，部分接口不回填） */
  word?: string
  /** 词性码（见 WordPosCode / POS_SW_MAP / POS_CN_MAP） */
  pos?: WordPosCode
  /** 该词性下的中文翻译 */
  translation?: string
  /** 例句数组 */
  example?: Example[]
  /** 配图相对URL（渲染前用 resolveAsset） */
  picture?: string
  /**
   * 变化形式 map：key 是变化形式简写，value 是变化后的单词。
   * p=过去式 d=过去分词 i=现在分词 3=第三人称单数 r=比较级 t=最高级 s=名词复数
   */
  exchange?: Record<string, string>
}

/** 单词完整详情（word/detail 返回）。与后端 Word 字段一一对应。 */
export interface Word {
  id: number
  /** 单词文本 */
  word: string
  /** 英式音标 */
  uk_phonetic: string
  /** 英式发音音频相对URL（渲染前用 resolveAsset） */
  uk_audio: string
  /** 美式音标 */
  us_phonetic: string
  /** 美式发音音频相对URL（渲染前用 resolveAsset） */
  us_audio: string
  /** 词性数组（每个词性带各自的释义/例句/配图） */
  pos: WordPos[]
}

/** 短语完整详情（phrase/detail 返回）。与后端 WordPhrase 字段一一对应。 */
export interface WordPhrase {
  id: number
  /** 短语文本 */
  phrase: string
  /** 中文翻译 */
  translation: string
  /** 发音（音频相对URL；渲染前用 resolveAsset） */
  pronunciation: string
  /** 例句数组 */
  example: Example[]
  /** 配图相对URL（渲染前用 resolveAsset） */
  picture: string
}

/** 词条上挂的标签（tag/list 返回的元素）。与后端 WordTag 字段一一对应。 */
export interface WordTag {
  id: number
  /** 所属词条ID */
  word_id: number
  /** 1=单词，2=短语 */
  word_type: WordType
  /** 标签ID */
  tag_id: number
  /** 标签名称 */
  name: string
  /** 展示风格（chip 背景色，如 '#1989fa'） */
  style: string
}

/** 按标签筛选返回的词条上挂的精简标签（TaggedWord.tags 元素） */
export interface SimpleTagInfo {
  /** 标签ID */
  id: number
  /** 标签名称 */
  name: string
  /** 展示风格（chip 背景色） */
  style: string
}

/** 按标签筛选返回的词条（tag/words 返回的元素）。与后端 TaggedWord 一一对应。 */
export interface TaggedWord {
  /** 词条ID */
  id: number
  /** 单词/短语文本 */
  word: string
  /** 该词条的全部标签 */
  tags: SimpleTagInfo[]
}

/** 词条状态枚举：1=学习，2=复习，3=强化，4=完成 */
export type WordStatusCode = 1 | 2 | 3 | 4

/** 词条状态项 */
export interface WordStatus {
  id: number
  word_id: number
  /** 1=单词，2=短语 */
  word_type: WordType
  /** 状态枚举：1学习/2复习/3强化/4完成 */
  status: WordStatusCode
  /** 已练次数 */
  times: number
  /** 权重 */
  weight: number
}

/** 词库统计 */
export interface DictionaryCount {
  word_count: number
  phrase_count: number
  total_count: number
}

/** word/list 请求参数 */
export interface WordListParams {
  offset: number
  limit: number
  /** 前缀过滤（可选） */
  word_prefix?: string
  /** 词性过滤（可选，词性码） */
  pos?: WordPosCode
  /** 中文翻译过滤（可选） */
  translation?: string
  /** 音标过滤（可选） */
  phonetic?: string
}

/** phrase/list 请求参数 */
export interface PhraseListParams {
  offset: number
  limit: number
  /** 短语前缀过滤（可选） */
  phrase_prefix?: string
  /** 中文翻译过滤（可选） */
  translation?: string
  /** 关联单词ID过滤（数组，可选；GET 重复键序列化） */
  word_id?: number[]
}

/** status/list 请求参数 */
export interface StatusListParams {
  offset: number
  limit: number
  /** 词条ID过滤（数组，可选） */
  word_id?: number[]
  /** 词条类型：1=单词，2=短语 */
  word_type: WordType
}

/** word/add 请求参数（与后端 AddWordReq 一一对应） */
export interface AddWordParams {
  word: string
  uk_phonetic?: string
  uk_audio?: string
  us_phonetic?: string
  us_audio?: string
  /** 词性数组 */
  pos?: WordPos[]
  /** 是否为新增词条自动生成配图 */
  is_generate_picture?: boolean
}

/** word/update 请求参数（与后端 UpdateWordReq 一一对应；全量覆盖） */
export interface UpdateWordParams {
  id: number
  word: string
  uk_phonetic: string
  uk_audio: string
  us_phonetic: string
  us_audio: string
  /** 词性数组（整体覆盖） */
  pos: WordPos[]
}

/** phrase/add 请求参数（与后端 AddWordPhraseReq 一一对应） */
export interface AddPhraseParams {
  phrase: string
  translation?: string
  pronunciation?: string
  example?: Example[]
  picture?: string
  /** 是否为新增短语自动生成配图 */
  is_generate_picture?: boolean
}

/** phrase/update 请求参数（与后端 UpdateWordPhraseReq 一一对应；全量覆盖） */
export interface UpdatePhraseParams {
  id: number
  phrase: string
  translation: string
  pronunciation: string
  example: Example[]
  picture: string
}

/** 单条释义批量更新项（与后端 UpdateWordTranslationItem 一一对应） */
export interface WordTranslationItem {
  /** 目标词性ID */
  word_pos_id: number
  /** 新的中文释义 */
  translation: string
}

/** status/update 请求参数（与后端 UpdateWordStatusReq 一一对应） */
export interface UpdateStatusParams {
  word_id: number
  /** 1=单词，2=短语 */
  word_type: WordType
  /** 目标状态：1学习/2复习/3强化/4完成 */
  status: WordStatusCode
}

/* ============ 标签 tag ============ */

/** 标签（GET /api/v1/tag/list 返回的元素，字段与后端 Tag 一一对应） */
export interface Tag {
  id: number
  name: string
  /** 展示风格：选中态用作 chip 背景色，如 "#1989fa" */
  style: string
  /** 是否系统标签（系统标签对所有用户可见，UI 上锁 + 虚线边框） */
  is_system: boolean
}

/** 查询某词条已挂标签的请求参数（tag/list） */
export interface WordTagListParams {
  /** 词条ID（数组；GET 重复键序列化） */
  word_id: number[]
  /** 1=单词，2=短语 */
  word_type: WordType
}

/** 整体覆盖某词条标签的请求参数（tag/update） */
export interface UpdateWordTagParams {
  word_id: number
  /** 1=单词，2=短语 */
  word_type: WordType
  /** 目标标签ID列表（整体覆盖该词条的标签集合，传空数组=清空） */
  tags: number[]
}

/** 按标签 AND 筛选词条的请求参数（tag/words） */
export interface ListWordsByTagsParams {
  /** 标签ID列表；返回"同时拥有全部这些标签"的词条（AND；GET 重复键序列化） */
  tag_ids: number[]
  /** 1=单词，2=短语 */
  word_type: WordType
}

/* ============ 分享 share ============ */

/** 生成分享码请求（POST /api/v1/share/generate；POST JSON，数组无重复键问题） */
export interface GenerateShareParams {
  /** 分享范围：0=全部 1=按标签 */
  share_type: 0 | 1
  /** 词条类型：0=全部 1=仅单词 2=仅短语 */
  word_type: 0 | 1 | 2
  /** share_type=1 时必传：标签ID列表 */
  tag_ids?: number[]
}

/** 生成分享码响应（token/expires_at 在顶层，不在 data 下） */
export interface GenerateShareReply extends BaseReply {
  /** 分享码 */
  token: string
  /** 过期时间（unix 秒） */
  expires_at: number
}

/** 分享预览整体涉及的标签 */
export interface SharePreviewTag {
  name: string
  style: string
}

/** 分享预览里的单个词条（简版） */
export interface ShareWordItem {
  /** 分享方词库里的 id（配合 token 查详情用） */
  id: number
  /** 1=单词 2=短语 */
  word_type: WordType
  /** 单词或短语本体 */
  text: string
  /** 中文翻译（简版） */
  translation: string
  /** 该词关联的标签名 */
  tag_names: string[]
}

/** 分享预览响应（字段均在顶层） */
export interface PreviewShareReply extends BaseReply {
  /** 分享方用户名 */
  from_username: string
  word_count: number
  phrase_count: number
  /** 全部条目 */
  items: ShareWordItem[]
  /** 整体涉及的标签 */
  tags: SharePreviewTag[]
  /** 过期时间（unix 秒） */
  expires_at: number
}

/** 分享词详情响应（word / phrase 按 word_type 二选一） */
export interface ShareWordDetailReply extends BaseReply {
  word?: Word
  phrase?: WordPhrase
}

/** 导入分享时的标签处理：0=不带标签 1=仅系统标签 2=全部标签 */
export type TagImportMode = 0 | 1 | 2

/** 导入分享码响应（统计字段在顶层） */
export interface ImportShareReply extends BaseReply {
  word_imported: number
  phrase_imported: number
  word_skipped: number
  phrase_skipped: number
  tag_imported: number
}

/* ============ 文件批量导入 import ============ */

/** 导入任务状态：0=待处理 1=进行中 2=已完成 3=失败 */
export type ImportTaskStatus = 0 | 1 | 2 | 3

/** 导入任务（operation/import/tasks 返回的元素） */
export interface ImportTaskItem {
  id: number
  file_name: string
  status: ImportTaskStatus
  /** 总词数 / 当前进度 / 正在处理的词 */
  total: number
  current: number
  current_word: string
  success_count: number
  fail_count: number
  /** 失败词列表：JSON 数组字符串（如 '["a","b"]'），展示前需 JSON.parse */
  fail_words: string
  created_at: string
}

/** 导入任务列表查询参数（GET，全标量；日期范围与 days 互斥） */
export interface ImportTaskListParams {
  /** 起始日期 YYYY-MM-DD */
  start_date?: string
  /** 结束日期 YYYY-MM-DD */
  end_date?: string
  /** 最近 N 天（0/不传 = 不启用） */
  days?: number
}

/** 创建导入任务响应（task_id 在顶层） */
export interface ImportWordReply extends BaseReply {
  task_id: number
}

/* ============ stardict 中文搜索批量加词 ============ */

/** stardict 搜索结果项 */
export interface StardictItem {
  /** 单词/短语本体 */
  sw: string
  phonetic: string
  translation: string
  /** 1=单词 2=短语 */
  word_type: WordType
  /** 是否已在个人词典（已加的不可重复选） */
  is_added: boolean
}

/** 批量添加的条目（取自 StardictItem 的 sw + word_type） */
export interface BatchAddStardictItem {
  sw: string
  word_type: WordType
}

/** 批量添加响应（submitted 在顶层：后端异步入库，提交数≠完成数） */
export interface BatchAddStardictReply extends BaseReply {
  submitted: number
}

/* ============ 文章练习 article ============ */

/** 双语句子 */
export interface ArticleSentence {
  en: string
  zh: string
}

/** 一个词性下的释义（气泡卡按词性分行展示） */
export interface ArticleSense {
  /** 词性缩写，如 n./vt./vi. */
  pos_label: string
  /** 该词性下的中文释义 */
  meaning: string
}

/** 文章用到的词条：原型 + 正文字面形态(高亮) + 补齐的简要信息(气泡卡) */
export interface ArticleUsedWord {
  word_id: number
  /** 1=单词 2=短语 */
  word_type: WordType
  /** 原型 */
  word: string
  /** 正文中出现的字面形式（含变形；高亮匹配用） */
  surfaces: string[]
  /** 主词性缩写（兼容；气泡卡优先用 senses） */
  pos_label: string
  /** 合并释义（兼容） */
  meaning: string
  /** 全部词性+释义，气泡卡按词性分行 */
  senses: ArticleSense[]
  /** 音标（后端补齐） */
  phonetic: string
  /** 词条当前是否仍存在于词库 */
  found: boolean
}

/** 文章标签（并集去重，查询时实时计算） */
export interface ArticleTag {
  tag_id: number
  name: string
  style: string
}

/** 文章完整渲染体（即时生成 / 详情共用） */
export interface ArticleView {
  /** 未收录时为 0 */
  id: number
  title_en: string
  title_zh: string
  tags: ArticleTag[]
  sentences: ArticleSentence[]
  used_words: ArticleUsedWord[]
  created_at?: string
}

/** 自选/收录时按 id 引用词条 */
export interface SelfSelectWord {
  word_id: number
  /** 1=单词 2=短语 */
  word_type: WordType
}

/** 即时生成请求参数 */
export interface GenerateArticleParams {
  /** 1=随机 2=自选 */
  method: 1 | 2
  /** 随机词数 3~8（method=1 有效） */
  count?: number
  /** 词状态 0=全部 1=学习 2=复习 3=强化 4=完成 */
  status?: number
  /** 类别 1=标签 2=单词 3=词语 4=全部 */
  category?: number
  /** category=1 时生效 */
  tag_ids?: number[]
  /** method=2 自选时的词条 */
  words?: SelfSelectWord[]
}

/** 自选候选词 */
export interface ArticleCandidate {
  word_id: number
  word_type: WordType
  word: string
  pos_label: string
  meaning: string
  phonetic: string
}

/** 自选候选词查询参数（GET；tag_ids 重复键序列化） */
export interface ArticleCandidatesParams {
  /** 0=全部 1-4 */
  status?: number
  /** 1=标签 2=单词 3=词语 4=全部 */
  category?: number
  tag_ids?: number[]
}

/** 收录请求参数 */
export interface SaveArticleParams {
  title_en: string
  title_zh: string
  sentences: ArticleSentence[]
  used_words: ArticleUsedWord[]
}

/** 收录列表项 */
export interface ArticleListItem {
  id: number
  title_en: string
  title_zh: string
  tags: ArticleTag[]
  /** 含词原文（小字展示） */
  words: string[]
  created_at: string
}

/** 收录列表查询参数（GET；tag_ids 重复键序列化） */
export interface ArticleListParams {
  offset: number
  limit: number
  /** 标题(中英)+含词(英文) 共用 */
  keyword?: string
  tag_ids?: number[]
}
