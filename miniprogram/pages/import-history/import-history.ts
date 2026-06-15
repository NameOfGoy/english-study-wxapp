// pages/import-history/import-history.ts —— 导入任务历史（navigateTo 普通页）
// 合并 H5 两处实现：
//   - views/ImportTaskHistory.vue：快捷时间筛选(今天/近3/7/30天) + 自定义起止日期 + 任务卡片。
//   - components/profile/ImportTaskList.vue：有进行中任务(status 0/1)时每 3s 轮询刷新进度。
// 任务卡：文件名 / 状态徽标 / 进行中进度条+正在处理词 / 成功失败统计 / 失败词可展开 / 创建时间。
//
// ⚠️ WXML 不能调方法：状态文案/类名、进度百分比、各显隐 flag、失败词解析 全部在 ts 预算。
import { getImportTaskList } from '../../services/dictionary'
import type { ImportTaskItem } from '../../services/types'

/** 任务卡渲染单元（全部展示字段预算成扁平值/flag） */
interface TaskVM {
  id: number
  fileName: string
  statusText: string
  /** 状态修饰类：pending/running/done/failed */
  statusClass: string
  /** status===1 → 显示进度条 */
  isRunning: boolean
  current: number
  total: number
  currentWord: string
  /** 进度百分比（0-100，整数） */
  percent: number
  showSuccess: boolean
  successCount: number
  showFail: boolean
  failCount: number
  /** fail_count>0 且有 fail_words → 显示失败词折叠区 */
  showFailSection: boolean
  failExpanded: boolean
  failWords: string[]
  createdAt: string
}

/** 快捷时间范围 */
interface QuickRange {
  label: string
  days: number
}
const QUICK_RANGES: QuickRange[] = [
  { label: '今天', days: 1 },
  { label: '近 3 天', days: 3 },
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 }
]

const STATUS_TEXT: Record<number, string> = {
  0: '待处理',
  1: '进行中',
  2: '已完成',
  3: '失败'
}
const STATUS_CLASS: Record<number, string> = {
  0: 'pending',
  1: 'running',
  2: 'done',
  3: 'failed'
}

/** 默认轮询间隔（ms），同 H5 */
const POLL_INTERVAL = 3000

/** 失败词 JSON 数组串 → string[]（解析失败兜底空数组） */
function parseFailWords(json: string): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map((w: unknown) => String(w)) : []
  } catch (e) {
    return []
  }
}

interface PageData {
  loading: boolean
  tasks: TaskVM[]
  empty: boolean
  quickRanges: QuickRange[]
  /** 当前选中的快捷天数（自定义模式下置 0，不高亮任何快捷项） */
  activeDays: number
  customMode: boolean
  startDate: string
  endDate: string
  /** 自定义模式下 picker 上限（今天，YYYY-MM-DD） */
  maxDate: string
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    loading: false,
    tasks: [],
    empty: false,
    quickRanges: QUICK_RANGES,
    activeDays: 3,
    customMode: false,
    startDate: '',
    endDate: '',
    maxDate: ''
  },

  // 轮询定时器句柄（实例私有，onLoad 初始化）
  _pollTimer: 0 as number,
  // 当前生效的筛选参数（轮询 / 下拉刷新复用）
  _params: {} as { days?: number; start_date?: string; end_date?: string },

  onLoad() {
    this._pollTimer = 0
    this._params = { days: 3 }
    // picker 上限 = 今天
    this.setData({ maxDate: this._today() })
    this.loadTasks(this._params, true)
  },

  onShow() {
    // 回到本页：若有进行中任务则恢复轮询（onHide 已停）
    this._syncPolling()
  },

  onHide() {
    this._stopPolling()
  },

  onUnload() {
    this._stopPolling()
  },

  /** 今天 YYYY-MM-DD */
  _today(): string {
    const d = new Date()
    const m = d.getMonth() + 1
    const day = d.getDate()
    return (
      d.getFullYear() +
      '-' +
      (m < 10 ? '0' + m : '' + m) +
      '-' +
      (day < 10 ? '0' + day : '' + day)
    )
  },

  /**
   * 拉取任务列表并装配视图。
   * @param params 筛选参数
   * @param withLoading 是否显示加载态（首次/切筛选 true；轮询刷新 false 避免闪烁）
   */
  async loadTasks(
    params: { days?: number; start_date?: string; end_date?: string },
    withLoading: boolean
  ) {
    this._params = params
    if (withLoading) {
      this.setData({ loading: true })
    }
    try {
      const list = await getImportTaskList(params)
      const tasks: TaskVM[] = (list || []).map((t: ImportTaskItem): TaskVM => {
        const total = t.total || 0
        const current = t.current || 0
        const failWords = parseFailWords(t.fail_words)
        return {
          id: t.id,
          fileName: t.file_name || '未命名文件',
          statusText: STATUS_TEXT[t.status] || '未知',
          statusClass: STATUS_CLASS[t.status] || '',
          isRunning: t.status === 1,
          current,
          total,
          currentWord: t.current_word || '',
          percent: Math.round((current / (total || 1)) * 100),
          showSuccess: (t.success_count || 0) > 0,
          successCount: t.success_count || 0,
          showFail: (t.fail_count || 0) > 0,
          failCount: t.fail_count || 0,
          showFailSection: (t.fail_count || 0) > 0 && failWords.length > 0,
          // 轮询刷新时尽量保留上一次的展开态
          failExpanded: this._wasExpanded(t.id),
          failWords,
          createdAt: t.created_at || ''
        }
      })
      this.setData({ tasks, empty: tasks.length === 0 })
    } catch (e) {
      // request 层已统一 toast；保留已有列表
    } finally {
      if (withLoading) {
        this.setData({ loading: false })
      }
      this._syncPolling()
    }
  },

  /** 取上一轮某任务的失败词展开态（轮询刷新不丢用户已展开的） */
  _wasExpanded(id: number): boolean {
    const prev = this.data.tasks.find((t: TaskVM) => t.id === id)
    return prev ? prev.failExpanded : false
  },

  /** 是否存在进行中任务（status 0 待处理 / 1 进行中） */
  _hasRunning(): boolean {
    return this.data.tasks.some((t: TaskVM) => t.statusClass === 'pending' || t.isRunning)
  },

  /** 根据是否有进行中任务，启停轮询 */
  _syncPolling() {
    if (this._hasRunning()) {
      this._startPolling()
    } else {
      this._stopPolling()
    }
  },

  _startPolling() {
    if (this._pollTimer) {
      return
    }
    this._pollTimer = setInterval(() => {
      // 轮询期间若已无进行中任务则自停
      if (!this._hasRunning()) {
        this._stopPolling()
        return
      }
      this.loadTasks(this._params, false)
    }, POLL_INTERVAL) as unknown as number
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = 0
    }
  },

  /** 点快捷时间范围 */
  onQuickRange(e: WechatMiniprogram.TouchEvent) {
    const days = Number(e.currentTarget.dataset.days)
    this.setData({ customMode: false, activeDays: days })
    this.loadTasks({ days }, true)
  },

  /** 进入自定义模式 */
  onCustomMode() {
    this.setData({ customMode: true, activeDays: 0 })
  },

  /** 起始日期选择 */
  onStartDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ startDate: String(e.detail.value) })
  },

  /** 结束日期选择 */
  onEndDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ endDate: String(e.detail.value) })
  },

  /** 应用自定义日期范围 */
  applyCustom() {
    const { startDate, endDate } = this.data
    if (!startDate && !endDate) {
      wx.showToast({ title: '请至少选择起止日期之一', icon: 'none' })
      return
    }
    if (startDate && endDate && startDate > endDate) {
      wx.showToast({ title: '起始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.loadTasks({ start_date: startDate, end_date: endDate }, true)
  },

  /** 展开/收起某任务的失败词 */
  onToggleFail(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const tasks = this.data.tasks.map((t: TaskVM) =>
      t.id === id ? { ...t, failExpanded: !t.failExpanded } : t
    )
    this.setData({ tasks })
  },

  /** 下拉刷新：重拉当前筛选 */
  onPullDownRefresh() {
    this.loadTasks(this._params, false).then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
