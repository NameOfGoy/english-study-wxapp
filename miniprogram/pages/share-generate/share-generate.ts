// pages/share-generate/share-generate.ts —— 生成分享码（navigateTo 进入的普通页）
// 复刻 H5 src/components/dictionary/ShareGenerateModal.vue：
//   - 分享范围：0=全部 / 1=按标签（默认 0）；类型：0=全部 / 1=单词 / 2=短语（默认 0）。
//   - 选「按标签」时展示标签多选 chip（getTagList 拉全量；H5 是 checkbox+彩色 pill）。
//   - 校验同 H5：按标签但一个没选 → toast「请至少选择一个标签」，不提交。
//   - 生成成功 → 展示分享码（等宽大号）+ 有效期提示（H5 文案「5 分钟内有效」+
//     expires_at 格式化为 yyyy-MM-dd HH:mm）+ 复制按钮（wx.setClipboardData → toast「已复制」）。
//   - 已生成时主按钮变「再生成一个」：同 H5 reset()，清掉旧码与已选标签，
//     分享范围/类型保留，可调整后再次生成（覆盖旧码展示）。
import { generateShare } from '../../services/share'
import { getTagList } from '../../services/tag'
import type { Tag } from '../../services/types'

/** 标签多选 chip 的渲染单元（WXML 不能调方法，选中态/内联色串全部预计算） */
interface TagOption {
  id: number
  name: string
  /** 选中态内联样式串：背景+边框注入标签色（未选时 WXML 不挂该串） */
  style: string
  selected: boolean
}

interface PageData {
  /** 标签列表拉取中 */
  tagsLoading: boolean
  /** 分享范围：0=全部 1=按标签 */
  shareType: number
  /** 词条类型：0=全部 1=仅单词 2=仅短语 */
  wordType: number
  tagOptions: TagOption[]
  /** 已选标签数（驱动「已选 N 个」角标，WXML 不能 filter） */
  selectedTagCount: number
  /** 生成请求进行中（提交锁 + 按钮 loading） */
  generating: boolean
  /** 已生成的分享码；'' = 尚未生成（控制按钮/结果卡切换） */
  token: string
  /** expires_at 格式化后的「yyyy-MM-dd HH:mm」 */
  expiresText: string
}

/** 两位补零 */
function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

/** unix 秒 → 「yyyy-MM-dd HH:mm」 */
function formatExpire(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  )
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    tagsLoading: true,
    shareType: 0,
    wordType: 0,
    tagOptions: [],
    selectedTagCount: 0,
    generating: false,
    token: '',
    expiresText: ''
  },

  onLoad() {
    // 同 H5 onMounted/watch(show)：进页即拉标签（按标签分支随时可切）
    this.loadTags()
  },

  /** 拉全量标签 → 预计算 chip 渲染单元。失败静默保持空列表（H5 同款，request 层已统一 toast）。 */
  async loadTags() {
    this.setData({ tagsLoading: true })
    try {
      const list = await getTagList()
      const options: TagOption[] = (list || []).map((t: Tag): TagOption => {
        // 兜底色同 H5：t.style || '#1989fa'
        const color = t.style || '#1989fa'
        return {
          id: t.id,
          name: t.name,
          style: 'background:' + color + ';border-color:' + color,
          selected: false
        }
      })
      this.setData({ tagOptions: options, selectedTagCount: 0 })
    } catch (e) {
      this.setData({ tagOptions: [], selectedTagCount: 0 })
    } finally {
      this.setData({ tagsLoading: false })
    }
  },

  /** 切分享范围（全部 / 按标签）。H5 切换不清已选标签，这里保持一致。 */
  onPickShareType(e: WechatMiniprogram.TouchEvent) {
    const v = Number(e.currentTarget.dataset.value)
    if (v === this.data.shareType) {
      return
    }
    this.setData({ shareType: v })
  },

  /** 切词条类型（全部 / 单词 / 短语） */
  onPickWordType(e: WechatMiniprogram.TouchEvent) {
    const v = Number(e.currentTarget.dataset.value)
    if (v === this.data.wordType) {
      return
    }
    this.setData({ wordType: v })
  },

  /** 标签 chip 多选切换 */
  onToggleTag(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const options = this.data.tagOptions.map((t: TagOption): TagOption =>
      t.id === id
        ? { id: t.id, name: t.name, style: t.style, selected: !t.selected }
        : t
    )
    const count = options.filter((t: TagOption) => t.selected).length
    this.setData({ tagOptions: options, selectedTagCount: count })
  },

  /** 生成分享码。校验/参数装配同 H5：按标签必须至少选一个；share_type=0 时 tag_ids 传空数组。 */
  async onGenerate() {
    if (this.data.generating) {
      return
    }
    const byTag = this.data.shareType === 1
    const tagIds = this.data.tagOptions
      .filter((t: TagOption) => t.selected)
      .map((t: TagOption) => t.id)
    if (byTag && tagIds.length === 0) {
      wx.showToast({ title: '请至少选择一个标签', icon: 'none' })
      return
    }
    this.setData({ generating: true })
    try {
      const resp = await generateShare({
        share_type: byTag ? 1 : 0,
        word_type: this.data.wordType as 0 | 1 | 2,
        tag_ids: byTag ? tagIds : []
      })
      // token / expires_at 在顶层（services/share.ts 契约）
      this.setData({
        token: resp.token,
        expiresText: formatExpire(resp.expires_at)
      })
    } catch (e) {
      // request 层已统一 toast；这里仅恢复按钮态
    } finally {
      this.setData({ generating: false })
    }
  },

  /** 复制分享码 → 成功 toast「已复制」（同 H5 copyToken） */
  onCopy() {
    if (!this.data.token) {
      return
    }
    wx.setClipboardData({
      data: this.data.token,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  /** 再生成一个：同 H5 reset()，清旧码 + 清已选标签；分享范围/类型保留，可调整后重新生成 */
  onRegenerate() {
    const options = this.data.tagOptions.map((t: TagOption): TagOption => ({
      id: t.id,
      name: t.name,
      style: t.style,
      selected: false
    }))
    this.setData({
      token: '',
      expiresText: '',
      tagOptions: options,
      selectedTagCount: 0
    })
  }
})
