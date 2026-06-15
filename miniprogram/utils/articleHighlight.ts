// utils/articleHighlight.ts —— 文章双语高亮分词（从 H5 src/utils/articleHighlight.js 忠实移植）
//
// 把一句英文按「目标词的字面形式(surfaces)」切成普通段与高亮段。设计要点：
//  - 大小写不敏感 + 词边界(防 ran ⊂ bran、cat ⊂ category)
//  - 短语 surface 内部空白允许多空格(give  up 仍匹配 give up)
//  - 最长优先 + 已占区间不重叠不重复包裹(give up 胜过 up)
//  - 不做词形还原, 完全依赖后端给的 surfaces; 保留命中原文大小写
//  - 输出 segment 数组, 由 WXML 用 <text> 渲染(文本自动转义, 无 XSS)

/** 高亮分词的目标词（与后端 used_words 元素同构，只取算法需要的字段） */
export interface HighlightMark {
  word: string
  word_type?: number
  /** 兼容旧命名 */
  type?: number
  surfaces?: string[]
}

/** 分词输出的单段：word 非空即高亮段 */
export interface Segment {
  text: string
  word: string | null
  type: number | null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch)
}

/**
 * 把一句英文按目标词切成段数组。
 * @param text 一句英文
 * @param marks 目标词（used_words）
 */
export function buildSegments(text: string, marks: HighlightMark[]): Segment[] {
  if (!text) return []
  const surfaces: { surface: string; word: string; type: number }[] = []
  for (const m of marks || []) {
    // 后端 used_words 用的是 word_type 字段; 兼容旧 type 命名
    const mtype = m && (m.word_type !== undefined ? m.word_type : m.type)
    const list =
      m && m.surfaces && m.surfaces.length ? m.surfaces : [m && m.word]
    for (const sf of list) {
      const s = (sf || '').trim()
      if (s) surfaces.push({ surface: s, word: m.word, type: mtype as number })
    }
  }

  const matches: { start: number; end: number; word: string; type: number }[] = []
  for (const { surface, word, type } of surfaces) {
    const pattern = escapeRegex(surface).replace(/\s+/g, '\\s+')
    let re: RegExp
    try {
      re = new RegExp(pattern, 'gi')
    } catch (e) {
      continue
    }
    let mm: RegExpExecArray | null
    while ((mm = re.exec(text)) !== null) {
      if (mm[0].length === 0) {
        re.lastIndex++
        continue
      }
      const start = mm.index
      const end = start + mm[0].length
      // 词边界(避免 lookbehind, 手动判断, 兼容老 webview)
      if (isWordChar(text[start - 1])) continue
      if (isWordChar(text[end])) continue
      matches.push({ start, end, word, type })
    }
  }

  if (matches.length === 0) return [{ text, word: null, type: null }]

  // 最长优先, 再按起点; 同位置时"词与命中文本完全一致"者优先; 然后贪心占位
  matches.sort((a, b) => {
    const byLen = b.end - b.start - (a.end - a.start)
    if (byLen !== 0) return byLen
    if (a.start !== b.start) return a.start - b.start
    const aExact =
      a.word && text.slice(a.start, a.end).toLowerCase() === String(a.word).toLowerCase()
    const bExact =
      b.word && text.slice(b.start, b.end).toLowerCase() === String(b.word).toLowerCase()
    if (aExact !== bExact) return aExact ? -1 : 1
    return 0
  })
  const occupied = new Array(text.length).fill(false)
  const accepted: { start: number; end: number; word: string; type: number }[] = []
  for (const m of matches) {
    let free = true
    for (let i = m.start; i < m.end; i++) {
      if (occupied[i]) {
        free = false
        break
      }
    }
    if (!free) continue
    for (let i = m.start; i < m.end; i++) occupied[i] = true
    accepted.push(m)
  }
  accepted.sort((a, b) => a.start - b.start)

  const segs: Segment[] = []
  let cur = 0
  for (const m of accepted) {
    if (m.start > cur) {
      segs.push({ text: text.slice(cur, m.start), word: null, type: null })
    }
    segs.push({ text: text.slice(m.start, m.end), word: m.word, type: m.type })
    cur = m.end
  }
  if (cur < text.length) {
    segs.push({ text: text.slice(cur), word: null, type: null })
  }
  return segs
}

/** key 用于按 (word, type) 在 used_words 里查气泡卡信息 */
export function wordKey(word: string, type: number | null): string {
  return String(word || '').trim().toLowerCase() + '|' + type
}
