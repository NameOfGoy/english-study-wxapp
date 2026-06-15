// services/tag.ts —— 标签接口（读 + 写 CRUD）
// 读：getTagList（练习页全局标签筛选条 / 词库标签管理 / 我的标签页都从这里拉全量）。
// 写：addTag / updateTag / deleteTag（我的标签页管理用；普通用户改自己的，系统标签仅超管可改）。
import request from '../utils/request'
import type { DataReply, BaseReply, Tag } from './types'

/**
 * 拉取当前用户可见的全部标签（含系统标签）。需要 token。
 *
 * 后端 GET /api/v1/tag/list 走 PageReq（offset/limit），默认 limit=10。
 * 这里固定传一个足够大的 limit（200）一次性拉全量，避免分页：
 * 标签量级很小，且筛选条/管理页都需要完整列表。
 *
 * 返回 data 数组（Tag[]）；列表为空时返回 []（后端可能给 null，已兜底）。
 */
export function getTagList(): Promise<Tag[]> {
  return request<DataReply<Tag[]>>({
    url: '/api/v1/tag/list',
    method: 'GET',
    data: { offset: 0, limit: 200 }
  }).then((res) => res.data || [])
}

/** 新增标签入参（与后端 AddTagReq 一一对应） */
export interface AddTagParams {
  /** 标签名称（不超过 20 字） */
  name: string
  /** 展示风格（chip 背景色，如 '#1989fa'） */
  style: string
  /** 是否系统标签：true=对所有用户可见，仅超管可设；普通用户传 false / 不传 */
  is_system?: boolean
}

/**
 * 新增标签。需要 token。POST /api/v1/tag/add，body { name, style, is_system? }。
 * is_system=true 仅超管有效（服务端二次校验，普通用户传了也会被拒/降级）。
 * 成功 resolve(void)；失败已由 request 统一 toast + reject。
 *
 * 用法：await addTag({ name, style, is_system: isAdmin() && wantSystem })
 */
export function addTag(params: AddTagParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/tag/add',
    method: 'POST',
    data: {
      name: params.name,
      style: params.style,
      is_system: !!params.is_system
    }
  }).then(() => undefined)
}

/** 更新标签入参（与后端 UpdateTagReq 一一对应；归属 is_system 不可改，故不传） */
export interface UpdateTagParams {
  /** 标签 id */
  id: number
  /** 标签名称 */
  name: string
  /** 展示风格 */
  style: string
}

/**
 * 更新标签（名称 / 颜色）。需要 token。POST /api/v1/tag/update，body { id, name, style }。
 * 不能跨归属修改（系统↔私有），服务端会拦。成功 resolve(void)。
 *
 * 用法：await updateTag({ id: tag.id, name, style })
 */
export function updateTag(params: UpdateTagParams): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/tag/update',
    method: 'POST',
    data: {
      id: params.id,
      name: params.name,
      style: params.style
    }
  }).then(() => undefined)
}

/**
 * 删除标签。需要 token。POST /api/v1/tag/delete，body { id }。
 * 删除后关联到该标签的词条会失去这个标签。成功 resolve(void)。
 *
 * 用法：await deleteTag(tag.id)
 */
export function deleteTag(id: number): Promise<void> {
  return request<BaseReply>({
    url: '/api/v1/tag/delete',
    method: 'POST',
    data: { id }
  }).then(() => undefined)
}
