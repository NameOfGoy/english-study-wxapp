// services/dictionary.ts —— 词库 service 层（读 + 写 CRUD + 状态 + 标签）
//
// ⚠️ GET 的数组参数（tag_ids / word_id）必须用「重复键」序列化：tag_ids=1&tag_ids=2，
//    go-zero 的 form:"xxx" []uint 才解析得到；用 wx.request 默认数组会变成 xxx[]=1 解析不到。
//    因此所有带数组 query 的 GET 都手动拼 query（见 buildQuery / 各函数），不走 request 的 data。
import request from '../utils/request'
import type {
  PageReply,
  DataReply,
  BaseReply,
  SimpleWord,
  SimplePhrase,
  Word,
  WordPhrase,
  WordStatus,
  WordTag,
  TaggedWord,
  DictionaryCount,
  WordListParams,
  PhraseListParams,
  StatusListParams,
  AddWordParams,
  UpdateWordParams,
  AddPhraseParams,
  UpdatePhraseParams,
  WordTranslationItem,
  UpdateStatusParams,
  WordTagListParams,
  UpdateWordTagParams,
  ListWordsByTagsParams,
  ImportWordReply,
  ImportTaskListParams,
  ImportTaskItem,
  StardictItem,
  BatchAddStardictItem,
  BatchAddStardictReply
} from './types'

/**
 * 把「标量键值对 + 数组键」拼成 query string（不含前导 ?）。
 * - 标量：值为 undefined / '' 跳过；其余 encodeURIComponent 后 k=v。
 * - 数组（arrays 里声明的键）：用重复键 k=v1&k=v2（go-zero form 要求）。
 * 返回空串表示无参数。
 */
function buildQuery(
  scalars: Record<string, string | number | boolean | undefined>,
  arrays?: Record<string, number[] | undefined>
): string {
  const qs: string[] = []
  for (const k in scalars) {
    const v = scalars[k]
    if (v === undefined || v === '') continue
    qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
  }
  if (arrays) {
    for (const k in arrays) {
      const list = arrays[k]
      if (!list || !list.length) continue
      // 重复键序列化：k=1&k=2（不能用 wx.request 默认数组）。
      for (const id of list) qs.push(encodeURIComponent(k) + '=' + id)
    }
  }
  return qs.join('&')
}

/** 把 query string 接到 url 上（空串则原样返回） */
function withQuery(url: string, qs: string): string {
  return qs ? url + '?' + qs : url
}

/**
 * 词条分页列表。需要 token。
 * 返回整个 PageReply：data 是 SimpleWord[]，顶层带 offset/limit/total_count。
 * 因分页元信息在顶层，这里整体返回（不只返回 data），方便页面做分页。
 */
export function getWordList(
  params: WordListParams
): Promise<PageReply<SimpleWord>> {
  const qs = buildQuery({
    offset: params.offset,
    limit: params.limit,
    word_prefix: params.word_prefix,
    pos: params.pos,
    translation: params.translation,
    phonetic: params.phonetic
  })
  return request<PageReply<SimpleWord>>({
    url: withQuery('/api/v1/dictionary/word/list', qs),
    method: 'GET'
  })
}

/**
 * 单词详情。需要 token。GET word/detail?id=xxx。
 * 返回 Word（含 pos: WordPos[]，每个词性带各自释义/例句/配图）。
 * 音频/图片是相对URL，渲染前用 resolveAsset。
 */
export function getWordDetail(id: number): Promise<Word> {
  return request<DataReply<Word>>({
    url: withQuery('/api/v1/dictionary/word/detail', buildQuery({ id })),
    method: 'GET'
  }).then((res) => res.data)
}

/**
 * 词条状态列表。需要 token。
 * 用于给词库列表关联出 status 角标（1学习/2复习/3强化/4完成）。
 */
export function getStatusList(
  params: StatusListParams
): Promise<WordStatus[]> {
  // word_id 是数组 → 必须重复键序列化（k=1&k=2），故手动拼 query。
  const qs = buildQuery(
    {
      offset: params.offset,
      limit: params.limit,
      word_type: params.word_type
    },
    { word_id: params.word_id }
  )
  return request<DataReply<WordStatus[]>>({
    url: withQuery('/api/v1/dictionary/status/list', qs),
    method: 'GET'
  }).then((res) => res.data || [])
}

/** 词库统计（单词数 / 短语数 / 总数）。需要 token。 */
export function getCount(): Promise<DictionaryCount> {
  return request<DataReply<DictionaryCount> & DictionaryCount>({
    url: '/api/v1/dictionary/count',
    method: 'GET'
  }).then((res) => {
    // count 接口的字段直接在顶层（与包装同级），而非 data 下。
    return {
      word_count: res.word_count,
      phrase_count: res.phrase_count,
      total_count: res.total_count
    }
  })
}

/* ============ 配图（AI 生成 / 应用，单词按 word_pos_id，短语按 id） ============ */

/**
 * AI 生成单词配图。需要 token。POST word/picture { word_pos_id }。
 * 后端同步调智谱生成并存 OSS，返回图片相对 path（link）；尚未落库，需 updateWordPicture 应用。
 */
export function generateWordPicture(wordPosId: number): Promise<string> {
  return request<BaseReply & { link: string }>({
    url: '/api/v1/dictionary/word/picture',
    method: 'POST',
    data: { word_pos_id: wordPosId }
  }).then((res) => res.link || '')
}

/**
 * 应用单词配图（落库）。需要 token。POST word/picture/update { word_pos_id, picture }。
 * picture 传 generate 返回的 link 或 upload 返回的 path（原样透传）。
 */
export function updateWordPicture(
  wordPosId: number,
  picture: string
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/word/picture/update',
    method: 'POST',
    data: { word_pos_id: wordPosId, picture }
  }).then(() => undefined)
}

/**
 * AI 生成短语配图。需要 token。POST phrase/picture { id }。返回图片相对 path（link）。
 */
export function generatePhrasePicture(id: number): Promise<string> {
  return request<BaseReply & { link: string }>({
    url: '/api/v1/dictionary/phrase/picture',
    method: 'POST',
    data: { id }
  }).then((res) => res.link || '')
}

/**
 * 应用短语配图（落库）。需要 token。POST phrase/picture/update { id, link }。
 * 注意短语应用接口字段名是 link（与单词的 picture 不同）。
 */
export function updatePhrasePicture(id: number, link: string): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/phrase/picture/update',
    method: 'POST',
    data: { id, link }
  }).then(() => undefined)
}

/* ============ 单词写操作（增 / 改 / 删 / 批量改释义） ============ */

/**
 * 新增单词。需要 token。POST word/add，body = AddWordParams。
 * is_generate_picture=true 时后端会为词性异步生成配图。成功 resolve(void)。
 */
export function addWord(req: AddWordParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/word/add',
    method: 'POST',
    data: {
      word: req.word,
      uk_phonetic: req.uk_phonetic,
      uk_audio: req.uk_audio,
      us_phonetic: req.us_phonetic,
      us_audio: req.us_audio,
      pos: req.pos,
      is_generate_picture: !!req.is_generate_picture
    }
  }).then(() => undefined)
}

/**
 * 更新单词（全量覆盖，含 pos 数组）。需要 token。POST word/update，body = UpdateWordParams。
 * pos 是整体覆盖：未包含的旧词性会被删除。成功 resolve(void)。
 */
export function updateWord(req: UpdateWordParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/word/update',
    method: 'POST',
    data: {
      id: req.id,
      word: req.word,
      uk_phonetic: req.uk_phonetic,
      uk_audio: req.uk_audio,
      us_phonetic: req.us_phonetic,
      us_audio: req.us_audio,
      pos: req.pos
    }
  }).then(() => undefined)
}

/** 删除单词。需要 token。POST word/delete，body { id }。成功 resolve(void)。 */
export function deleteWord(id: number): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/word/delete',
    method: 'POST',
    data: { id }
  }).then(() => undefined)
}

/** batch-delete 响应：deleted（实际删除条数）在顶层（与 article batch-delete 同形） */
interface BatchDeleteReply extends BaseReply {
  deleted: number
}

/** 批量删除单词。需要 token。POST word/batch-delete，body { ids }。返回实际删除条数。 */
export function batchDeleteWord(ids: number[]): Promise<number> {
  return request<BatchDeleteReply>({
    url: '/api/v1/dictionary/word/batch-delete',
    method: 'POST',
    data: { ids }
  }).then((res) => res.deleted)
}

/**
 * 批量更新单词释义（按 word_pos_id）。需要 token。POST word/translation/update。
 * body { items: [{ word_pos_id, translation }] }。成功 resolve(void)。
 */
export function updateWordTranslation(req: {
  items: WordTranslationItem[]
}): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/word/translation/update',
    method: 'POST',
    data: { items: req.items }
  }).then(() => undefined)
}

/* ============ 短语（列表 / 详情 / 增 / 改 / 删） ============ */

/**
 * 短语分页列表。需要 token。GET phrase/list。
 * 整体返回 PageReply（分页元信息在顶层，data 是 SimplePhrase[]），便于页面分页。
 * word_id 是数组 → 重复键序列化（k=1&k=2）。
 */
export function getPhraseList(
  params: PhraseListParams
): Promise<PageReply<SimplePhrase>> {
  const qs = buildQuery(
    {
      offset: params.offset,
      limit: params.limit,
      phrase_prefix: params.phrase_prefix,
      translation: params.translation
    },
    { word_id: params.word_id }
  )
  return request<PageReply<SimplePhrase>>({
    url: withQuery('/api/v1/dictionary/phrase/list', qs),
    method: 'GET'
  })
}

/**
 * 短语详情。需要 token。GET phrase/detail?id=xxx。返回 WordPhrase。
 * pronunciation/picture 是相对URL，渲染前用 resolveAsset。
 */
export function getPhraseDetail(id: number): Promise<WordPhrase> {
  return request<DataReply<WordPhrase>>({
    url: withQuery('/api/v1/dictionary/phrase/detail', buildQuery({ id })),
    method: 'GET'
  }).then((res) => res.data)
}

/**
 * 新增短语。需要 token。POST phrase/add，body = AddPhraseParams。
 * is_generate_picture=true 时后端会异步生成配图。成功 resolve(void)。
 */
export function addPhrase(req: AddPhraseParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/phrase/add',
    method: 'POST',
    data: {
      phrase: req.phrase,
      translation: req.translation,
      pronunciation: req.pronunciation,
      example: req.example,
      picture: req.picture,
      is_generate_picture: !!req.is_generate_picture
    }
  }).then(() => undefined)
}

/**
 * 更新短语（全量覆盖）。需要 token。POST phrase/update，body = UpdatePhraseParams。
 * 成功 resolve(void)。
 */
export function updatePhrase(req: UpdatePhraseParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/phrase/update',
    method: 'POST',
    data: {
      id: req.id,
      phrase: req.phrase,
      translation: req.translation,
      pronunciation: req.pronunciation,
      example: req.example,
      picture: req.picture
    }
  }).then(() => undefined)
}

/**
 * 删除短语。需要 token。⚠️ HTTP DELETE（与单词 delete 走 POST 不同），body { id }。
 * 成功 resolve(void)。
 */
export function deletePhrase(id: number): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/phrase/delete',
    method: 'DELETE',
    data: { id }
  }).then(() => undefined)
}

/** 批量删除短语。需要 token。POST phrase/batch-delete，body { ids }。返回实际删除条数。 */
export function batchDeletePhrase(ids: number[]): Promise<number> {
  return request<BatchDeleteReply>({
    url: '/api/v1/dictionary/phrase/batch-delete',
    method: 'POST',
    data: { ids }
  }).then((res) => res.deleted)
}

/* ============ 状态（学习/复习/强化/完成） ============ */

/**
 * 修改某词条状态。需要 token。POST status/update。
 * body { word_id, word_type, status }；status 1学习/2复习/3强化/4完成。
 * 成功 resolve(void)。
 */
export function updateStatus(req: UpdateStatusParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/status/update',
    method: 'POST',
    data: {
      word_id: req.word_id,
      word_type: req.word_type,
      status: req.status
    }
  }).then(() => undefined)
}

/* ============ 词条标签（查 / 覆盖 / 按标签 AND 筛选） ============ */

/**
 * 查询若干词条已挂的标签。需要 token。GET tag/list。
 * word_id 是数组 → 重复键序列化（k=1&k=2）。返回 WordTag[]（含每条所属 word_id/tag_id）。
 */
export function getWordTags(params: WordTagListParams): Promise<WordTag[]> {
  const qs = buildQuery(
    { word_type: params.word_type, offset: 0, limit: 200 },
    { word_id: params.word_id }
  )
  return request<DataReply<WordTag[]>>({
    url: withQuery('/api/v1/dictionary/tag/list', qs),
    method: 'GET'
  }).then((res) => res.data || [])
}

/**
 * 整体覆盖某词条的标签集合。需要 token。POST tag/update。
 * body { word_id, word_type, tags: number[] }；tags 是「全量目标集合」，
 * 传空数组 = 清空该词条的全部标签。成功 resolve(void)。
 */
export function updateWordTag(req: UpdateWordTagParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/dictionary/tag/update',
    method: 'POST',
    data: {
      word_id: req.word_id,
      word_type: req.word_type,
      tags: req.tags
    }
  }).then(() => undefined)
}

/**
 * 按标签 AND 筛选词条（同时拥有全部所选标签）。需要 token。GET tag/words。
 * tag_ids 是数组 → 重复键序列化（k=1&k=2）。服务端实时查询，数据始终最新。
 * 返回 TaggedWord[]，每个元素 { id, word, tags: [{ id, name, style }] }。
 */
export function listWordsByTags(
  params: ListWordsByTagsParams
): Promise<TaggedWord[]> {
  const qs = buildQuery(
    { word_type: params.word_type },
    { tag_ids: params.tag_ids }
  )
  return request<DataReply<TaggedWord[]>>({
    url: withQuery('/api/v1/dictionary/tag/words', qs),
    method: 'GET'
  }).then((res) => res.data || [])
}

/* ============ 文件批量导入（operation/import） ============ */

/**
 * 创建批量导入任务。需要 token。POST operation/import。
 * filePath 是文件先经 file-service 上传后返回的相对 path（对照 H5：
 * 上传到 englishstudy 桶的 import/{ts}_{name}，再把返回 path 传进来）。
 * 后端异步跑任务，返回 task_id；进度去 getImportTaskList 轮询。
 */
export function importWord(
  filePath: string,
  fileName: string
): Promise<ImportWordReply> {
  return request<ImportWordReply>({
    url: '/api/v1/dictionary/operation/import',
    method: 'POST',
    data: { file_path: filePath, file_name: fileName }
  })
}

/**
 * 导入任务列表。需要 token。GET operation/import/tasks（全标量参数）。
 * 进行中的任务靠轮询本接口刷新进度（H5 是 3s 间隔）。
 */
export function getImportTaskList(
  params: ImportTaskListParams = {}
): Promise<ImportTaskItem[]> {
  const qs = buildQuery({
    start_date: params.start_date,
    end_date: params.end_date,
    days: params.days
  })
  return request<BaseReply & { tasks: ImportTaskItem[] }>({
    url: withQuery('/api/v1/dictionary/operation/import/tasks', qs),
    method: 'GET'
  }).then((res) => res.tasks || [])
}

/* ============ stardict 中文搜索批量加词（search/） ============ */

/**
 * 中文搜索 stardict 词库。需要 token。GET search/stardict?keyword=&limit=。
 * 返回候选词条（is_added=true 表示已在个人词典，UI 上置灰不可选）。
 */
export function searchStardict(
  keyword: string,
  limit = 20
): Promise<StardictItem[]> {
  const qs = buildQuery({ keyword, limit })
  return request<DataReply<StardictItem[]>>({
    url: withQuery('/api/v1/dictionary/search/stardict', qs),
    method: 'GET'
  }).then((res) => res.data || [])
}

/**
 * 批量添加 stardict 词条到个人词典。需要 token。POST search/batch-add。
 * 后端异步入库（补全释义/发音等），返回 submitted = 提交数（≠已完成数）。
 */
export function batchAddStardict(
  items: BatchAddStardictItem[]
): Promise<number> {
  return request<BatchAddStardictReply>({
    url: '/api/v1/dictionary/search/batch-add',
    method: 'POST',
    data: { items }
  }).then((res) => res.submitted)
}
