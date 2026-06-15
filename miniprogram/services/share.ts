// services/share.ts —— 词库分享 service 层（生成分享码 / 预览 / 词详情 / 导入）
//
// 后端契约（api/share.api，全部 POST JSON，需要 token）：
//   POST /api/v1/share/generate    → { token, expires_at }（顶层）
//   POST /api/v1/share/preview     → { from_username, word_count, phrase_count, items, tags, expires_at }（顶层）
//   POST /api/v1/share/word-detail → { word? | phrase? }（按 word_type 二选一）
//   POST /api/v1/share/import      → { word_imported, phrase_imported, word_skipped, phrase_skipped, tag_imported }（顶层）
import request from '../utils/request'
import type {
  GenerateShareParams,
  GenerateShareReply,
  PreviewShareReply,
  ShareWordDetailReply,
  ImportShareReply,
  TagImportMode,
  WordType
} from './types'

/**
 * 生成分享码。share_type=1（按标签）时 tag_ids 必传非空。
 * 返回整个 body（token / expires_at 在顶层）。
 */
export function generateShare(
  params: GenerateShareParams
): Promise<GenerateShareReply> {
  return request<GenerateShareReply>({
    url: '/api/v1/share/generate',
    method: 'POST',
    data: {
      share_type: params.share_type,
      word_type: params.word_type,
      tag_ids: params.tag_ids || []
    }
  })
}

/**
 * 预览分享码内容（导入前第二步）。
 * 分享码无效/过期时后端返回 code!==0，request 已统一 toast + reject。
 */
export function previewShare(token: string): Promise<PreviewShareReply> {
  return request<PreviewShareReply>({
    url: '/api/v1/share/preview',
    method: 'POST',
    data: { token }
  })
}

/**
 * 查看分享内容里某个词的完整详情（预览列表点击进入）。
 * wordId 是「分享方」词库里的 id，必须配合 token 使用。
 */
export function getShareWordDetail(
  token: string,
  wordId: number,
  wordType: WordType
): Promise<ShareWordDetailReply> {
  return request<ShareWordDetailReply>({
    url: '/api/v1/share/word-detail',
    method: 'POST',
    data: { token, word_id: wordId, word_type: wordType }
  })
}

/**
 * 按分享码导入到自己词库（导入前第三步）。
 * tagImportMode：0=不带标签 1=仅系统标签 2=全部标签（默认 0）。
 * 返回导入/跳过/新建标签的统计（顶层字段）。
 */
export function importShare(
  token: string,
  tagImportMode: TagImportMode = 0
): Promise<ImportShareReply> {
  return request<ImportShareReply>({
    url: '/api/v1/share/import',
    method: 'POST',
    data: { token, tag_import_mode: tagImportMode }
  })
}
