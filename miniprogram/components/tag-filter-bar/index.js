// components/tag-filter-bar/index.js —— 练习页全局标签筛选条（折叠面板 + chip 多选）
//
// 移植自 H5 src/components/practice/TagFilterBar.vue。行为：
//   - 折叠态显示 summary：空=「全部」/ ≤2 个=标签名顿号拼接 / >2 个=「已选 N 个」。
//   - 展开态：第一行「全部 (不筛选)」与具体标签互斥；下方 chip 网格多选。
//   - 选中态 chip 用标签 style 颜色作背景；系统标签带 🔒 + 虚线边框。
//   - attached 调 getTagList 拉标签 + stale 清理（剔除已删 id 并回写）。
//   - 任一选择立即 setPracticeTagFilter 持久化，并 triggerEvent('change', { ids })。
//
// 用 .js（小程序自定义组件惯例，与 custom-tab-bar 一致）；引入的 ts util 经构建产物可直接 require。
const { getTagList } = require('../../services/tag')
const {
  getPracticeTagFilter,
  setPracticeTagFilter,
  clearPracticeTagFilter,
  pruneStalePracticeTagFilter
} = require('../../utils/practiceTagFilter')

Component({
  options: {
    // 让组件内可用全局 app.wxss 的 CSS 变量（page 上的 --primary 等）
    addGlobalClass: true
  },

  properties: {
    // 选中态 chip 的默认背景色（标签自身无 style 时回退）。默认主色。
    defaultChipColor: {
      type: String,
      value: '#3DA5F4'
    }
  },

  data: {
    expanded: false,
    loading: false,
    // 渲染用标签列表：在原始 Tag 上补 selected（是否选中）字段，避免 WXML 里跑 includes
    tags: [],
    // 当前选中的标签 id 列表（[] 表示「全部」）
    selectedIds: [],
    isAllSelected: true,
    summaryText: '全部'
  },

  lifetimes: {
    attached() {
      // 初始从持久化读已选，再拉标签并 stale 清理
      this.setData({ selectedIds: getPracticeTagFilter() })
      this._recompute()
      this._loadTags()
    }
  },

  pageLifetimes: {
    // 页面每次 show 时刷新（标签可能在词典里新增/删除）
    show() {
      this._loadTags()
    }
  },

  methods: {
    // 拉标签 + stale 清理 + 重算派生态
    _loadTags() {
      this.setData({ loading: true })
      getTagList()
        .then((list) => {
          const tags = list || []
          // stale 清理：把已删标签 id 从持久化里剔除并回写，返回清理后的有效选中
          const validIds = tags.map((t) => t.id)
          const cleaned = pruneStalePracticeTagFilter(validIds)
          this.setData({ selectedIds: cleaned })
          this._setTags(tags)
        })
        .catch(() => {
          // request 层已统一 toast；保持空列表展示空态
          this._setTags([])
        })
        .finally(() => {
          this.setData({ loading: false })
        })
    },

    // 写入标签列表（附 selected 标记）并重算 summary
    _setTags(tags) {
      this._rawTags = tags
      this.setData({ tags: this._decorate(tags, this.data.selectedIds) })
      this._recompute()
    },

    // 给每个 tag 补 selected 字段（WXML 直接用，避免在模板里调 includes）
    _decorate(tags, selectedIds) {
      const sel = new Set(selectedIds)
      return tags.map((t) => ({
        id: t.id,
        name: t.name,
        style: t.style || '',
        is_system: !!t.is_system,
        selected: sel.has(t.id)
      }))
    },

    // 重算 isAllSelected / summaryText / tags.selected（基于当前 selectedIds）
    _recompute() {
      const ids = this.data.selectedIds
      const isAll = ids.length === 0
      let summary = '全部'
      if (!isAll) {
        const raw = this._rawTags || []
        if (ids.length <= 2) {
          const names = raw.filter((t) => ids.indexOf(t.id) >= 0).map((t) => t.name)
          summary = names.length === 0 ? '已选 ' + ids.length + ' 个' : names.join('、')
        } else {
          summary = '已选 ' + ids.length + ' 个'
        }
      }
      this.setData({
        isAllSelected: isAll,
        summaryText: summary,
        tags: this._decorate(this._rawTags || [], ids)
      })
    },

    // 折叠 / 展开
    onToggleExpand() {
      this.setData({ expanded: !this.data.expanded })
    },

    // 选「全部」：清空选中（回到不筛选）
    onSelectAll() {
      if (this.data.selectedIds.length === 0) {
        return
      }
      clearPracticeTagFilter()
      this.setData({ selectedIds: [] })
      this._recompute()
      this._emitChange()
    },

    // 切换某个具体标签：勾任意具体标签 → 自动取消「全部」（互斥）
    onToggleTag(e) {
      const id = Number(e.currentTarget.dataset.id)
      if (!id) {
        return
      }
      const cur = this.data.selectedIds
      const idx = cur.indexOf(id)
      const next = idx >= 0 ? cur.filter((x) => x !== id) : cur.concat([id])
      setPracticeTagFilter(next)
      this.setData({ selectedIds: next })
      this._recompute()
      this._emitChange()
    },

    // 抛出当前选中 ids 给页面（hub 据此带入 getList 的 tag_ids）
    _emitChange() {
      this.triggerEvent('change', { ids: this.data.selectedIds.slice() })
    }
  }
})
