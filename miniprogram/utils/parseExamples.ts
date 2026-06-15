// utils/parseExamples.ts —— 异构例句格式归一解析（纯函数，无副作用）
//
// 移植自 H5 src/composables/useParsedExamples.js，去掉 Vue computed 外壳，
// 改成纯函数：输入 WordCard.example（string[]），输出归一的 { en, zh }[]。
//
// 替换各练习页原先 naive 的 `raw.split('\n')`：后端例句历史数据格式高度异构，
// 单条串内可能是：
//   - 纯文本（只有英文，或英文\n中文两行）
//   - 一段 JSON 串（对象 {example/sentence/text, translation/trans/cn/zh}）
//   - 一段 JSON 串（数组，元素再是对象或字符串，可嵌套）
// 本解析覆盖 H5 处理过的全部分支，并兼容多种字段名。
//
// 命名差异说明：H5 内部用 { example, translation }，本小程序各页 VM 统一用
// { en, zh }（见 study.ts 的 ExampleVM）。这里直接产出 { en, zh } 省去页面再映射。

/** 归一后的单条例句：英文 + 中文 */
export interface ParsedExample {
  /** 英文例句（可能为空） */
  en: string
  /** 中文翻译（可能为空） */
  zh: string
}

/** 任意对象里按多组兼容字段名取英文 / 中文 */
function pickFromObject(obj: Record<string, unknown>): ParsedExample {
  const en = (obj.example || obj.sentence || obj.text || '') as string
  const zh = (obj.translation || obj.trans || obj.cn || obj.zh || '') as string
  return { en: String(en || ''), zh: String(zh || '') }
}

/**
 * 从一组 items 收集例句。items 元素可能是：
 *   - string：先尝试 JSON.parse；
 *       · parse 出数组 → 递归收集（支持嵌套）
 *       · parse 出对象 → 当对象取字段
 *       · parse 失败（普通文本）→ 整串作为英文
 *   - object：直接当对象取字段
 */
function collectFromItems(items: unknown[]): ParsedExample[] {
  const out: ParsedExample[] = []
  for (const item of items) {
    let obj: Record<string, unknown> | null = null

    if (typeof item === 'string') {
      try {
        const parsed = JSON.parse(item)
        if (Array.isArray(parsed)) {
          // 嵌套数组：递归展开
          for (const sub of collectFromItems(parsed)) {
            out.push(sub)
          }
          continue
        } else if (parsed && typeof parsed === 'object') {
          obj = parsed as Record<string, unknown>
        }
      } catch (e) {
        // 非 JSON 串：作为纯文本英文处理（下方走 else 分支）
      }
    } else if (typeof item === 'object' && item !== null) {
      obj = item as Record<string, unknown>
    }

    let en = ''
    let zh = ''
    if (obj) {
      const picked = pickFromObject(obj)
      en = picked.en
      zh = picked.zh
    } else if (typeof item === 'string') {
      // 普通文本串：可能是 "英文\n中文" 两行，也可能纯英文一行。
      // H5 此分支只把整串塞进 example；这里增强一处——若含换行，按首行英文/
      // 余下中文拆分，贴合后端「英文\n中文」的常见落库格式（不影响纯英文场景）。
      const parts = item
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (parts.length >= 2) {
        en = parts[0]
        zh = parts.slice(1).join(' ')
      } else {
        en = item
      }
    }

    if (en || zh) {
      out.push({ en, zh })
    }
  }
  return out
}

/**
 * 解析一张卡片的例句字段，输出归一的 { en, zh }[]。
 *
 * @param example WordCard.example —— 正常是 string[]；为兼容历史数据，
 *   也接受单个 string / object / null（内部会规整为待解析的 items）。
 * @returns 归一例句数组；无有效例句时返回 []。
 */
export function parseExamples(
  example: string[] | string | Record<string, unknown> | null | undefined
): ParsedExample[] {
  if (example == null) {
    return []
  }

  let items: unknown[] = []
  if (Array.isArray(example)) {
    items = example
  } else if (typeof example === 'string') {
    try {
      const parsed = JSON.parse(example)
      if (Array.isArray(parsed)) {
        items = parsed
      } else if (parsed && typeof parsed === 'object') {
        items = [parsed]
      } else {
        items = [example]
      }
    } catch (e) {
      items = [example]
    }
  } else if (typeof example === 'object') {
    items = [example]
  }

  return collectFromItems(items)
}

export default parseExamples
