# 单词记忆助手 · 微信小程序端（english-study-wxapp）

一款英语单词学习小程序，由原 H5 应用（English-Study-UI）逐步迁移而来。原生微信小程序 + TypeScript 实现，不依赖任何第三方框架。

- **AppID**：`wx599de02c3d04b82f`
- **小程序根目录**：`miniprogram/`
- **后端**：go-zero 服务（仓库 `english-study`），契约见本仓 `api/*.api`

## 技术栈

- 原生微信小程序（`style: v2`）+ TypeScript（开发者工具内置 TS 编译插件）
- 自定义 tabBar（`custom-tab-bar/`），4 个主 tab：首页 / 练习 / 词库 / 我的
- 统一请求层 `utils/request.ts`（注入 JWT、裸 401 跳登录）；文件上传 `services/file.ts` 单独走 `wx.uploadFile`
- 资源地址解析 `utils/asset.ts`；登录态 `utils/auth.ts`

## 后端配置

集中在 **`miniprogram/config/index.ts`**：

| 配置 | 当前值（调试期·IP 直连） | 上线时 |
| --- | --- | --- |
| `apiBaseUrl` | `http://193.112.111.2:13896` | 改成 https 后端域名 |
| `resourceBaseUrl` | `http://193.112.111.2`（80 端口 nginx 静态资源） | 改成 https 资源域名 |

> 微信正式版要求 request/上传/下载域名为已备案的 https，并在小程序后台配置服务器域名白名单。调试期用 IP 直连需在开发者工具勾选「不校验合法域名」。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| **认证** | 微信一键登录（自动登录 / 无账号时可关联已有账号或注册新账号）+ 账号密码兜底 |
| **学习闭环** | 练习 hub + 学习 / 复习 / 强化 / 抽查 四模式；全局标签筛选条（多选 AND，持久化）；完成动效与空态 |
| **词库** | 单词 / 短语列表（A-Z 索引 + 首字母分组）；详情（音标 / 释义 / 例句 / 🔊发音 / 配图）；增删改、状态编辑、标签编辑、释义编辑；多标签 AND 筛选 |
| **文章练习** | AI 生成分步向导（随机 / 自选词）+ 双语高亮正文 + 底部释义卡 + 文章库（搜索 / 分页） |
| **分享 / 导入** | 分享码生成与导入（预览 → 导入）；stardict 中文搜索批量添加；聊天文件导入（`chooseMessageFile`）；导入历史（日期筛选 + 进行中任务轮询） |
| **我的** | 资料编辑、头像上传、标签管理（系统 / 个人，调色板）、角色 / 管理员 |

> 说明：H5 端的「AI 辅助远程控制（AdminChat）」按计划**不迁移**。图片编辑在小程序端为 MVP（仅 AI 生成 + 本地上传，不含裁剪 / 搜图）。

## 目录结构

```
.
├── miniprogram/
│   ├── app.json / app.ts / app.wxss   # 全局配置 / 入口 / 设计系统样式
│   ├── pages/                         # 19 个页面（见 app.json）
│   ├── components/                    # article-renderer / completion-overlay / tag-filter-bar
│   ├── services/                      # 接口层：user/practise/dictionary/tag/share/article/file/dashboard
│   ├── utils/                         # request/auth/asset/articleHighlight/parseExamples/practiceTagFilter
│   ├── config/index.ts               # 后端地址等运行配置
│   ├── custom-tab-bar/               # 自定义底部 tabBar
│   ├── images/  mock/  sitemap.json
├── api/                              # 后端 .api 契约参考（englishstudy.api / user.api）
├── typings/                          # 微信 API 类型
├── project.config.json               # 项目配置（含 appid）
├── tsconfig.json
└── package.json
```

## 本地开发

1. 用 **微信开发者工具** 导入本仓库根目录（`project.config.json` 已含 `miniprogramRoot: miniprogram/`、appid）。
2. 安装 typings 依赖（仅 `miniprogram-api-typings`）：
   ```bash
   npm install
   ```
3. TypeScript 由开发者工具内置插件编译，无需手动构建。
4. 调试期如连 IP 后端：开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名…」。

## 状态

H5 → 小程序全功能迁移已完成（各页 `tsc` 通过）。多数页面尚待真机系统性实测，重点关注：微信登录关联/注册流程、分享导入详情图片、导入历史轮询、文章高亮渲染、AI 生成耗时与计费。
