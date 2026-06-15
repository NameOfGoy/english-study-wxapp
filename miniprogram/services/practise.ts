// services/practise.ts —— 四模式练习 list + finish 核心闭环
import request from '../utils/request'
import type {
  DataReply,
  BaseReply,
  WordCard,
  WordType,
  PractiseMode,
  PractiseListParams,
  ReviewOperation,
  StrengthOperation,
  SpotOperation
} from './types'

/**
 * 拉取某模式的练习卡片列表。需要 token。
 * mode ∈ "study" | "review" | "strength" | "spot"。
 * params 可选：count(默认10) / random / word_type(0全/1单词/2短语) / tag_ids。
 */
export function getList(
  mode: PractiseMode,
  params?: PractiseListParams
): Promise<WordCard[]> {
  // 手动拼 query：go-zero 的 form:"tag_ids" []uint 只认重复参数形式
  // tag_ids=1&tag_ids=2，不能用 wx.request 默认的数组序列化(会变 tag_ids[]=1，后端解析不到)。
  const qs: string[] = []
  if (params) {
    if (params.count !== undefined) qs.push('count=' + params.count)
    if (params.random !== undefined) qs.push('random=' + params.random)
    if (params.word_type !== undefined) qs.push('word_type=' + params.word_type)
    if (params.tag_ids && params.tag_ids.length) {
      for (const id of params.tag_ids) qs.push('tag_ids=' + id)
    }
  }
  const url =
    '/api/v1/practise/' + mode + '/list' + (qs.length ? '?' + qs.join('&') : '')
  return request<DataReply<WordCard[]>>({
    url,
    method: 'GET'
  }).then((res) => res.data)
}

/** 学习完成。word_id=卡片id，word_type=卡片word_type。需要 token。 */
export function finishStudy(
  word_id: number,
  word_type: WordType
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/practise/study/finish',
    method: 'POST',
    data: { word_id, word_type }
  }).then(() => undefined)
}

/** 复习提交。operation 1=完成/2=失败，quality 默认 4。需要 token。 */
export function finishReview(
  word_id: number,
  word_type: WordType,
  operation: ReviewOperation,
  quality: number = 4
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/practise/review/finish',
    method: 'POST',
    data: { word_id, word_type, operation, quality }
  }).then(() => undefined)
}

/** 加强提交。operation 1=完成/2=失败。需要 token。 */
export function finishStrength(
  word_id: number,
  word_type: WordType,
  operation: StrengthOperation
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/practise/strength/finish',
    method: 'POST',
    data: { word_id, word_type, operation }
  }).then(() => undefined)
}

/** 抽查提交。operation 1=通过/2=失败。需要 token。 */
export function finishSpot(
  word_id: number,
  word_type: WordType,
  operation: SpotOperation
): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/practise/spot/finish',
    method: 'POST',
    data: { word_id, word_type, operation }
  }).then(() => undefined)
}
