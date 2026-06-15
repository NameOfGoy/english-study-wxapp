// components/completion-overlay/index.js —— 练习完成 / 空态全屏蒙层卡片
//
// 移植自 H5 src/components/practice/CompletionOverlay.vue（简化版）。
//   - 完成态（count > 0）：奖杯 + 「本次共 X 个」+ 「返回主页」「再来一组」+ 简化撒花。
//   - 空态（count === 0）：信息图标 + 「没有可练词」+ 「返回主页」。
//   - 撒花用少量 view + CSS animation 简化，不强求与 H5 1:1。
//
// properties:
//   visible(Boolean)   控制显隐。
//   mode(String)       模式标识 study/review/strength/spot，用于映射「学习/复习…」文案。
//   count(Number)      本次完成数量；0 → 空态。
//   emptyText(String?) 自定义空态副标题文案（不传走默认）。
// events:
//   restart  点「再来一组」（仅完成态有按钮）。
//   home     点「返回主页」。

// 模式 → 中文标签映射（文案用）
const MODE_LABELS = {
  study: '学习',
  review: '复习',
  strength: '加强',
  spot: '抽查'
}

// 简化撒花：固定 12 片，左偏移/延时/配色错落
const CONFETTI = (function () {
  const colors = ['#3DA5F4', '#5BC8EA', '#FF6B35', '#22C55E', '#FFB020', '#9B6DFF']
  const arr = []
  for (let i = 0; i < 12; i++) {
    arr.push({
      left: (i * 8 + 4) % 100,
      delay: (i % 6) * 0.18,
      color: colors[i % colors.length]
    })
  }
  return arr
})()

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    mode: {
      type: String,
      value: ''
    },
    count: {
      type: Number,
      value: 0
    },
    emptyText: {
      type: String,
      value: ''
    }
  },

  data: {
    confetti: CONFETTI
  },

  // 派生文案：modeLabel（学习/复习/…）、isCompleted（完成 or 空态）
  observers: {
    'mode, count': function (mode, count) {
      this.setData({
        modeLabel: MODE_LABELS[mode] || '练习',
        isCompleted: (count || 0) > 0
      })
    }
  },

  methods: {
    onHome() {
      this.triggerEvent('home')
    },
    onRestart() {
      this.triggerEvent('restart')
    },
    // 吞掉蒙层点击，避免穿透到底层页面（卡片内点击由按钮各自处理）
    noop() {}
  }
})
