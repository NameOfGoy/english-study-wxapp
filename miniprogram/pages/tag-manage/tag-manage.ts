// pages/tag-manage/tag-manage.ts —— 标签管理（从「我的」进入的普通页）
// 复刻 H5 src/views/TagManage.vue：
//   - getTagList 拉全量 → 按 is_system 拆「系统标签」/「我的标签」两段。
//   - 底部抽屉弹层新建/编辑：名称 + 调色板多色选一 + （仅超管新建）系统标签开关 + 预览。
//   - 删除走 wx.showModal 二次确认，确认后 deleteTag → 重新拉列表。
//   - 系统标签的新建(设为系统)/编辑/删除仅 isAdmin() 为真时可操作；UI 显隐 + JS 二次拦截。
//     真鉴权仍在服务端（is_system 仅超管有效，跨归属修改会被拒）。
import { getTagList, addTag, updateTag, deleteTag } from '../../services/tag'
import { isAdmin } from '../../utils/auth'
import type { Tag } from '../../services/types'

// 调色板：直接照搬 H5 colorPalette，默认取第一个色 #ff6b6b
const PALETTE: string[] = [
  '#ff6b6b', '#ff9800', '#feca57', '#4ecdc4',
  '#45b7d1', '#1989fa', '#5f27cd', '#ab47bc',
  '#ff9ff3', '#54a0ff', '#07c160', '#969799'
]
const DEFAULT_STYLE = PALETTE[0]

interface PageData {
  loading: boolean
  // 当前用户是否超管（控制系统标签的新建/编辑/删除入口显隐）
  admin: boolean
  palette: string[]
  // 两段标签
  systemTags: Tag[]
  userTags: Tag[]
  // ---- 表单（新建 / 编辑共用）----
  formVisible: boolean
  // 编辑中的标签 id；0/undefined 表示新建
  editingId: number
  formName: string
  // 名称去空后非空（控制提交按钮可用）
  formNameTrimmed: boolean
  formStyle: string
  // 仅超管新建时有效：是否创建为系统标签
  formIsSystem: boolean
  submitting: boolean
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    loading: true,
    admin: false,
    palette: PALETTE,
    systemTags: [],
    userTags: [],
    formVisible: false,
    editingId: 0,
    formName: '',
    formNameTrimmed: false,
    formStyle: DEFAULT_STYLE,
    formIsSystem: false,
    submitting: false
  },

  onLoad() {
    // 超管标记一次性写入；UI 显隐用，真鉴权在服务端
    this.setData({ admin: isAdmin() })
    this.loadTags()
  },

  // 拉全量标签并按 is_system 分两段
  async loadTags() {
    this.setData({ loading: true })
    try {
      const list = await getTagList()
      const tags = list || []
      this.setData({
        systemTags: tags.filter((t) => t.is_system),
        userTags: tags.filter((t) => !t.is_system)
      })
    } catch (e) {
      // request 层已统一 toast；保持空列表
      this.setData({ systemTags: [], userTags: [] })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 按 id 在两段里找标签
  findTag(id: number): Tag | undefined {
    return (
      this.data.systemTags.find((t) => t.id === id) ||
      this.data.userTags.find((t) => t.id === id)
    )
  },

  // ---------------- 弹层：新建 ----------------
  onCreate() {
    this.setData({
      formVisible: true,
      editingId: 0,
      formName: '',
      formNameTrimmed: false,
      formStyle: DEFAULT_STYLE,
      formIsSystem: false,
      submitting: false
    })
  },

  // ---------------- 弹层：编辑 ----------------
  onEdit(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const tag = this.findTag(id)
    if (!tag) {
      return
    }
    // 非超管不得编辑系统标签（入口本已隐藏，这里再拦一道）
    if (tag.is_system && !this.data.admin) {
      wx.showToast({ title: '系统标签不可编辑', icon: 'none' })
      return
    }
    this.setData({
      formVisible: true,
      editingId: tag.id,
      formName: tag.name,
      formNameTrimmed: !!tag.name.trim(),
      formStyle: tag.style || DEFAULT_STYLE,
      // 编辑时归属锁定（仅展示意义；提交不回传 is_system，服务端也不让跨归属改）
      formIsSystem: !!tag.is_system,
      submitting: false
    })
  },

  onCloseForm() {
    this.setData({ formVisible: false })
  },

  // 名称输入：同步去空判断，驱动提交按钮可用态
  onNameInput(e: WechatMiniprogram.Input) {
    const name = e.detail.value
    this.setData({ formName: name, formNameTrimmed: !!name.trim() })
  },

  // 调色板选色
  onPickColor(e: WechatMiniprogram.TouchEvent) {
    const color = e.currentTarget.dataset.color as string
    if (color) {
      this.setData({ formStyle: color })
    }
  },

  // 系统标签开关（仅超管新建时可见）
  onSystemToggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ formIsSystem: !!e.detail.value })
  },

  // 提交：新建 → addTag；编辑 → updateTag。成功后关弹层并刷新。
  async onSubmit() {
    const name = this.data.formName.trim()
    if (!name || this.data.submitting) {
      return
    }
    this.setData({ submitting: true })
    try {
      if (this.data.editingId) {
        await updateTag({
          id: this.data.editingId,
          name,
          style: this.data.formStyle
        })
      } else {
        await addTag({
          name,
          style: this.data.formStyle,
          // is_system 仅在超管 + 勾选时为 true；普通用户恒 false（服务端也会二次校验）
          is_system: this.data.admin && this.data.formIsSystem
        })
      }
      wx.showToast({
        title: this.data.editingId ? '已更新' : '已创建',
        icon: 'success'
      })
      this.setData({ formVisible: false })
      await this.loadTags()
    } catch (e) {
      // request 层已统一 toast；这里仅恢复按钮态
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 删除：wx.showModal 二次确认 → deleteTag → 刷新
  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const tag = this.findTag(id)
    if (!tag) {
      return
    }
    // 非超管不得删除系统标签（入口本已隐藏，这里再拦一道）
    if (tag.is_system && !this.data.admin) {
      wx.showToast({ title: '系统标签不可删除', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除标签「${tag.name}」吗？关联到该标签的词条会失去这个标签。`,
      confirmText: '删除',
      confirmColor: '#FF5A5F',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          await deleteTag(tag.id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadTags()
        } catch (err) {
          // request 层已统一 toast
        }
      }
    })
  },

  // 弹层内部点击占位（阻止 catchtap 冒泡到遮罩关闭）
  noop() {}
})
