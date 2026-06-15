// utils/practiceTagFilter.ts —— 练习页全局标签筛选的本地持久化（跨页生效）
//
// 移植自 H5 src/utils/practiceTagFilter.js，语义与后端 GetWordCardListReq.TagIDs 一致：
//   空数组 / 无 → "全部" 模式，不筛选；
//   [id1, id2, ...] → 只取打了任一标签的词条。
//
// 与 H5 共用同一 storage 键名 "english_study_practice_tag_filter"（值为 JSON number[]）。
// 小程序用 wx.getStorageSync/setStorageSync 替代 localStorage（同步存取）。
// storage 键集中在此定义，禁止在别处硬编码。

/** 练习标签筛选的 storage 键（沿用 H5） */
const KEY = 'english_study_practice_tag_filter'

/**
 * 读取已选标签 id 列表。
 * 解析失败 / 非数组 / 含非法值时安全降级为 []（即"全部"）。
 * 只保留 > 0 的正整数 id。
 */
export function getPracticeTagFilter(): number[] {
  try {
    const raw = wx.getStorageSync<string>(KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((x) => Number(x) || 0).filter((x) => x > 0)
  } catch (e) {
    return []
  }
}

/**
 * 写入已选标签 id 列表。
 * 传空数组 / 非数组 → 视为"全部"，删除该键（与 H5 一致）。
 */
export function setPracticeTagFilter(ids: number[]): void {
  if (!Array.isArray(ids) || ids.length === 0) {
    wx.removeStorageSync(KEY)
    return
  }
  wx.setStorageSync(KEY, JSON.stringify(ids))
}

/** 清空标签筛选（回到"全部"模式）。 */
export function clearPracticeTagFilter(): void {
  wx.removeStorageSync(KEY)
}

/**
 * 清理 stale 选中：标签可能已在词典里被删，需把已删 id 从持久化里剔除并回写。
 *
 * @param validIds 当前仍有效的标签 id 集合（一般来自 getTagList 的结果）
 * @returns 清理后的 id 列表（已回写 storage）。调用方可直接用此结果刷新 UI。
 */
export function pruneStalePracticeTagFilter(validIds: Iterable<number>): number[] {
  const valid = new Set<number>()
  for (const id of validIds) {
    valid.add(id)
  }
  const current = getPracticeTagFilter()
  const cleaned = current.filter((id) => valid.has(id))
  if (cleaned.length !== current.length) {
    setPracticeTagFilter(cleaned)
  }
  return cleaned
}
