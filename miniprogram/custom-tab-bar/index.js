Component({
  data: {
    selected: 0,
    // 弹层/底部操作条打开时由页面置 true，临时隐藏 tabBar（避免盖住弹层底部）
    hidden: false,
    color: '#9AA3AF',
    selectedColor: '#3DA5F4',
    list: [
      { pagePath: '/pages/home/home', text: '首页', emoji: '🏠' },
      { pagePath: '/pages/practice/practice', text: '练习', emoji: '🎮' },
      { pagePath: '/pages/wordbook/wordbook', text: '词库', emoji: '📚' },
      { pagePath: '/pages/profile/profile', text: '我的', emoji: '👤' }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index;
      const path = this.data.list[idx].pagePath;
      wx.switchTab({ url: path });
      this.setData({ selected: idx });
    }
  }
});
