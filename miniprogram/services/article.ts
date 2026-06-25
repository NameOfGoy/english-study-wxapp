// services/article.ts —— 文章练习 service 层（即时生成 / 候选词 / 收录 / 列表 / 详情）
//
// 后端契约（api/article.api，前缀 api/v1/practise/article，全部需 token）：
//   POST /generate   {method,count,status,category,tag_ids,words} → {data: ArticleView}（生成同步, 后端 60s 超时）
//   GET  /candidates ?status&category&tag_ids[] → {data: ArticleCandidate[]}
//   POST /save       {title_en,title_zh,sentences,used_words} → {id}（顶层）
//   GET  /list       ?offset&limit&keyword&tag_ids[] → {data: ArticleListItem[], total_count}
//   GET  /detail     ?id → {data: ArticleView}
//
// ⚠️ GET 的数组参数 tag_ids 必须用「重复键」序列化（tag_ids=1&tag_ids=2），同 dictionary.ts。
import request from '../utils/request'
import type {
  DataReply,
  PageReply,
  BaseReply,
  ArticleView,
  ArticleCandidate,
  ArticleListItem,
  GenerateArticleParams,
  ArticleCandidatesParams,
  SaveArticleParams,
  ArticleListParams
} from './types'

/** 标量 + 数组键 拼 query string（数组用重复键；同 dictionary.ts 的 buildQuery） */
function buildQuery(
  scalars: Record<string, string | number | undefined>,
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
      for (const id of list) qs.push(encodeURIComponent(k) + '=' + id)
    }
  }
  return qs.join('&')
}

function withQuery(url: string, qs: string): string {
  return qs ? url + '?' + qs : url
}

/**
 * 即时生成文章（同步）。需要 token。后端 AI 生成较慢，超时给足 90s（后端 60s + 网络抖动余量）。
 * 返回 ArticleView（id=0，未持久化）。
 */
export function generateArticle(
  params: GenerateArticleParams
): Promise<ArticleView> {
  return request<DataReply<ArticleView>>({
    url: '/api/v1/practise/article/generate',
    method: 'POST',
    data: {
      method: params.method,
      count: params.count,
      status: params.status,
      category: params.category,
      tag_ids: params.tag_ids || [],
      words: params.words || []
    },
    timeout: 90000
  }).then((res) => res.data)
}

/**
 * 自选候选词列表。需要 token。GET candidates（tag_ids 重复键）。
 * category=1（按标签）时 tag_ids 生效。
 */
export function getArticleCandidates(
  params: ArticleCandidatesParams
): Promise<ArticleCandidate[]> {
  const qs = buildQuery(
    { status: params.status, category: params.category },
    { tag_ids: params.tag_ids }
  )
  return request<DataReply<ArticleCandidate[]>>({
    url: withQuery('/api/v1/practise/article/candidates', qs),
    method: 'GET'
  }).then((res) => res.data || [])
}

/**
 * 收录文章。需要 token。POST save，返回新文章 id（顶层）。
 */
export function saveArticle(params: SaveArticleParams): Promise<number> {
  return request<BaseReplyWithId>({
    url: '/api/v1/practise/article/save',
    method: 'POST',
    data: {
      title_en: params.title_en,
      title_zh: params.title_zh,
      sentences: params.sentences,
      used_words: params.used_words
    }
  }).then((res) => res.id)
}

/** save 响应：id 在顶层 */
interface BaseReplyWithId {
  code: number
  message: string
  id: number
}

/**
 * 收录列表（分页+搜索）。需要 token。GET list（tag_ids 重复键）。
 * 返回整个 PageReply（data + total_count），方便页面做无限滚动。
 */
export function getArticleList(
  params: ArticleListParams
): Promise<PageReply<ArticleListItem>> {
  const qs = buildQuery(
    { offset: params.offset, limit: params.limit, keyword: params.keyword },
    { tag_ids: params.tag_ids }
  )
  return request<PageReply<ArticleListItem>>({
    url: withQuery('/api/v1/practise/article/list', qs),
    method: 'GET'
  })
}

/**
 * 文章详情。需要 token。GET detail?id=xxx。返回 ArticleView（id>0）。
 */
export function getArticleDetail(id: number): Promise<ArticleView> {
  return request<DataReply<ArticleView>>({
    url: withQuery('/api/v1/practise/article/detail', buildQuery({ id })),
    method: 'GET'
  }).then((res) => res.data)
}

/** 删除收录文章（连同 article_words）。需要 token。POST delete，body {id}。成功 resolve(void)。 */
export function deleteArticle(id: number): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/practise/article/delete',
    method: 'POST',
    data: { id }
  }).then(() => undefined)
}

/** batch-delete 响应：deleted（实际删除篇数）在顶层 */
interface BatchDeleteReply extends BaseReply {
  deleted: number
}

/** 批量删除收录文章。需要 token。POST batch-delete，body {ids}。返回实际删除篇数。 */
export function batchDeleteArticle(ids: number[]): Promise<number> {
  return request<BatchDeleteReply>({
    url: '/api/v1/practise/article/batch-delete',
    method: 'POST',
    data: { ids }
  }).then((res) => res.deleted)
}
