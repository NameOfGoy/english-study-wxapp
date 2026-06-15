// pages/search-add/search-add.ts —— 中文搜索批量添加（普通页，从词库进入）
// 复刻 H5 src/components/dictionary/SearchAddModal.vue：
//   - 搜索框 300ms 防抖触发 searchStardict(keyword, 30)；发起新一轮搜索时立即清空已选。
//   - 结果列表：sw + 短语/已添加标识 + 音标 + 释义（两行截断）；is_added 置灰不可选。
//   - 「全选可添加」+ 底部「批量添加 (N)」；batchAddStardict 是异步入库（返回 submitted 提交数），
//     成功 toast「已后台添加 N 个词，稍后可在词典中查看」，把已提交项就地标记为已添加并清空选择。
//   - 状态分支顺序对照 H5：未输入提示 → 搜索中 → 无结果 → 列表。
// 无 vant：复选框/类型标签/底部固定栏均自绘；蓝色活力风复用 app.wxss 全局类。
import { searchStardict, batchAddStardict } from '../../services/dictionary'
import type { StardictItem, BatchAddStardictItem, WordType } from '../../services/types'

// H5 搜索传 limit:30（service 默认 20，这里显式对齐）
const SEARCH_LIMIT = 30
// H5 输入防抖 300ms
const DEBOUNCE_MS = 300

// 渲染用结果项：StardictItem + 预计算的选中标志（WXML 不能调方法，选中态必须落在 data 上）
interface DisplayItem {
  /** 单词/短语本体 */
  sw: string
  phonetic: string
  translation: string
  /** 1=单词 2=短语 */
  word_type: WordType
  /** 已在个人词典：置灰、不可勾选 */
  is_added: boolean
  /** 勾选态（仅 is_added=false 的项有意义） */
  selected: boolean
}

interface PageData {
  keyword: string
  // 请求在途（防抖等待期不算，对照 H5 loading 语义）
  searching: boolean
  results: DisplayItem[]
  // 可勾选项数（is_added=false 的项数），决定全选入口与底栏显隐
  selectableCount: number
  // 已勾选数
  selectedCount: number
  // 全选态 = selectableCount>0 且已选 == 可选（对照 H5 allSelected）
  allSelected: boolean
  submitting: boolean
  // 底部按钮文案（预计算：提交中... / 批量添加 (N) / 请勾选词汇）
  submitLabel: string
}

// 底部按钮文案，对照 H5：loading-text="提交中..."；有选中显计数，无选中提示勾选
function makeSubmitLabel(selectedCount: number, submitting: boolean): string {
  if (submitting) {
    return '提交中...'
  }
  return selectedCount > 0 ? `批量添加 (${selectedCount})` : '请勾选词汇'
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    keyword: '',
    searching: false,
    results: [],
    selectableCount: 0,
    selectedCount: 0,
    allSelected: false,
    submitting: false,
    submitLabel: makeSubmitLabel(0, false)
  },

  onLoad() {
    // data 之外的实例状态必须在 onLoad 显式初始化
    // 输入防抖定时器句柄
    this._debounceTimer = 0
    // 搜索序号：响应回来时与当前序号不一致则视为过期，直接丢弃
    this._searchSeq = 0
  },

  onUnload() {
    clearTimeout(this._debounceTimer)
  },

  // ---------------- 搜索 ----------------

  // 输入：300ms 防抖后搜索（对照 H5 onInput；小程序没有 composition 事件，无法区分拼音组词中）
  onKeywordInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ keyword })
    clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => {
      this.doSearch(this.data.keyword)
    }, DEBOUNCE_MS)
  },

  // 键盘「搜索」确认：取消防抖立即搜（替代 H5 compositionend 的即时触发）
  onSearchConfirm(e: WechatMiniprogram.Input) {
    clearTimeout(this._debounceTimer)
    this.doSearch(e.detail.value)
  },

  // 清空按钮：复位关键字/结果/选择，并使在途搜索失效（对照 H5 onClear + van-search clear）
  onClear() {
    clearTimeout(this._debounceTimer)
    this._searchSeq += 1
    this.setData({ keyword: '', searching: false })
    this.applyResults([])
  },

  async doSearch(raw: string) {
    const keyword = raw.trim()
    if (!keyword) {
      // 对照 H5：空关键字直接清结果，不发请求
      this.applyResults([])
      return
    }
    const seq = (this._searchSeq += 1)
    // 对照 H5：发起搜索时立即清空已选
    const cleared = this.data.results.map((r: DisplayItem): DisplayItem =>
      r.selected ? { ...r, selected: false } : r
    )
    this.applyResults(cleared)
    this.setData({ searching: true })
    try {
      const list = await searchStardict(keyword, SEARCH_LIMIT)
      if (seq !== this._searchSeq) {
        // 期间又发起了新搜索/清空，丢弃过期响应
        return
      }
      const results = (list || []).map((it: StardictItem): DisplayItem => ({
        sw: it.sw,
        phonetic: it.phonetic,
        translation: it.translation,
        word_type: it.word_type,
        is_added: it.is_added,
        selected: false
      }))
      this.applyResults(results)
    } catch (err) {
      // request 层已统一 toast；对照 H5 失败时清空结果
      if (seq === this._searchSeq) {
        this.applyResults([])
      }
    } finally {
      if (seq === this._searchSeq) {
        this.setData({ searching: false })
      }
    }
  },

  // ---------------- 选择 ----------------

  // 点击结果行切换勾选（已添加项不可选）
  onToggleItem(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.results[index]
    if (!item || item.is_added) {
      return
    }
    const results = this.data.results.slice()
    results[index] = { ...item, selected: !item.selected }
    this.applyResults(results)
  },

  // 全选可添加 / 取消全选（对照 H5 toggleAll：只作用于 is_added=false 的项）
  onToggleAll() {
    if (this.data.selectableCount === 0) {
      return
    }
    const target = !this.data.allSelected
    const results = this.data.results.map((r: DisplayItem): DisplayItem =>
      r.is_added ? r : { ...r, selected: target }
    )
    this.applyResults(results)
  },

  // 结果集变化统一入口：预计算可选数/已选数/全选态/按钮文案（WXML 不能调方法）
  applyResults(results: DisplayItem[]) {
    let selectableCount = 0
    let selectedCount = 0
    results.forEach((r: DisplayItem) => {
      if (!r.is_added) {
        selectableCount += 1
        if (r.selected) {
          selectedCount += 1
        }
      }
    })
    const allSelected = selectableCount > 0 && selectedCount === selectableCount
    this.setData({
      results,
      selectableCount,
      selectedCount,
      allSelected,
      submitLabel: makeSubmitLabel(selectedCount, this.data.submitting)
    })
  },

  // ---------------- 提交 ----------------

  async onSubmit() {
    if (this.data.submitting) {
      return
    }
    const picked = this.data.results.filter(
      (r: DisplayItem) => r.selected && !r.is_added
    )
    if (picked.length === 0) {
      return
    }
    const items: BatchAddStardictItem[] = picked.map(
      (r: DisplayItem): BatchAddStardictItem => ({
        sw: r.sw,
        word_type: r.word_type
      })
    )
    this.setData({
      submitting: true,
      submitLabel: makeSubmitLabel(this.data.selectedCount, true)
    })
    let next: DisplayItem[] | null = null
    try {
      const submitted = await batchAddStardict(items)
      const n = submitted || items.length
      // 后端异步入库：是「已提交」不是「已添加完成」，文案对照 H5
      wx.showToast({
        title: `已后台添加 ${n} 个词，稍后可在词典中查看`,
        icon: 'none',
        duration: 3000
      })
      // 对照 H5：已提交项就地标记为已添加，并清空选择
      next = this.data.results.map((r: DisplayItem): DisplayItem =>
        r.selected && !r.is_added ? { ...r, is_added: true, selected: false } : r
      )
      // 词库已（异步）新增 → 置脏标记，回词库 onShow 强制重载
      wx.setStorageSync('wordbook_dirty', true)
    } catch (err) {
      // request 层已统一 toast；仅恢复按钮态
    } finally {
      // 先复位 submitting 再重算（applyResults 依赖它生成按钮文案）
      this.setData({ submitting: false })
      this.applyResults(next || this.data.results)
    }
  }
})
