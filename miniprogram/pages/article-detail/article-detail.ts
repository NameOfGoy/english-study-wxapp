// pages/article-detail/article-detail.ts —— 收录文章详情（navigateTo 普通页，query: id）
// 复刻 H5 src/views/ArticleLibraryDetail.vue：getArticleDetail(id) → article-renderer 渲染(无收录栏)。
import { getArticleDetail } from '../../services/article'
import type { ArticleView } from '../../services/types'

interface PageData {
  loading: boolean
  loadError: boolean
  article: ArticleView | null
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    loading: true,
    loadError: false,
    article: null
  },

  onLoad(query: Record<string, string | undefined>) {
    this._id = Number(query.id || 0)
    if (!this._id) {
      this.setData({ loading: false, loadError: true })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true, loadError: false })
    try {
      const article = await getArticleDetail(this._id)
      this.setData({ article, loading: false })
    } catch (e) {
      this.setData({ loading: false, loadError: true })
    }
  },

  /** 右上角「···」→ 转发给朋友 */
  onShareAppMessage() {
    return {
      title: '单词记忆助手 · 读短文记单词',
      path: '/pages/home/home'
    }
  }
})
