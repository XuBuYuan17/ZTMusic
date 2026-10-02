# ZTmusic（哲听）

<img width="2096" height="1366" alt="image" src="https://github.com/user-attachments/assets/6e9a1a3d-4cb5-43e0-9f5d-cb9d85aa3450" />
<img width="2108" height="1368" alt="image" src="https://github.com/user-attachments/assets/aa340f81-c9c0-4b12-ace4-f8dc356bfc10" />

一个简洁、安静的网易云音乐第三方客户端，专注于听歌体验。基于 Svelte 5 + Tauri 2，可运行在 Windows、Linux 和 Web 上。

> ⚠️ 本项目仅供个人学习与技术交流。音乐数据来自第三方 API，版权归网易云音乐及各版权方。请勿用于商业用途。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri)

---

## 这是啥

哲听是一个干净、轻量的跨平台音乐客户端。没有广告，也没有喧宾夺主的社交功能，只想让听歌回归简单。

最初是想给自己做一个安静的听歌工具，后来顺手支持了 Linux。API 基于 [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced)，默认后端是自建的网易云 API 服务。

## 能干什么

**登录**：二维码 / 手机号 / 邮箱，登录态持久化。

**浏览**：发现页、歌单、歌手主页、资料库、最近播放、历史日推。

**播放**：全屏歌词、播放队列、多音质切换（VIP/试听自动回退）、下一首预加载、IndexedDB 缓存、歌曲收藏。桌面端还接了系统媒体控制（Windows SMTC / Linux MPRIS）。

**外观**：深色 / 浅色，中文 / 英文，桌面端窗口状态记忆、单实例运行。

## 支持的平台

| 平台 | 包格式 | 状态 |
|---|---|---|
| Windows | `.exe`（NSIS） | ✅ |
| Linux | `.deb` / `.rpm` | ✅ |
| Web | 浏览器直开 | ✅ |

> 当前 CI 提供 Windows / Linux 安装包，macOS 没有预构建包。

## 快速开始

本地 UI 开发需要 Node.js 22+ 和 pnpm；安装包由 GitHub 构建，本机无需 Rust 工具链。

```bash
pnpm install              # 装依赖
pnpm dev                  # 浏览器开发（Vite，默认走 /ncm-api 代理）
pnpm check                # Svelte / TypeScript 检查
pnpm test                 # 在隔离的 Node.js 进程中运行全部自检脚本
```

浏览器开发时，`/ncm-api` 会被 Vite 代理到后端，不用操心跨域。桌面端走 Tauri IPC 直接发请求。

跑单个测试：`node --experimental-strip-types src/lib/player/fallback.test.ts`，退出码 0 = 过，1 = 挂。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Svelte 5 + Vite |
| 桌面 | Tauri 2 + Rust |
| 音频 | HTML5 Audio（双缓冲预加载） |
| 本地存储 | IndexedDB / SQLocal |
| API | NeteaseCloudMusicApi Enhanced |

前端依赖很少：`@tauri-apps/api`、`qrcode`（二维码登录）、`sqlocal`（本地 SQLite）。

## 项目结构

```
ZTmusic/
├── src/                  # 前端源码（Svelte 5）
│   ├── App.svelte         # 根组件：路由、布局、overlay
│   └── lib/
│       ├── api/           # API 客户端 + 缓存策略
│       ├── components/    # UI 组件（播放器、overlay、侧栏……）
│       ├── pages/         # 页面（PC / 移动分开）
│       ├── player/        # 音频引擎 + fallback 链
│       ├── stores/        # 状态管理（auth / player / router）
│       ├── services/      # 数据加载
│       └── utils/         # 工具函数
├── src-tauri/            # Tauri / Rust
│   ├── src/               # Rust 端：api_request IPC、SMTC、MPRIS
│   ├── capabilities/      # Tauri 权限配置
│   └── icons/
├── public/               # 静态资源（SVG 图标）
├── scripts/              # CI、版本与测试入口
│   └── maintenance/       # 可复用的 CSS / 字体维护工具
├── tests/                # 浏览器手动集成检查
├── docs/                 # 当前开发文档
│   └── archive/           # 带日期的历史审计记录
├── .github/workflows/    # 开发包、正式构建、版本 PR 与标签发布
├── CONTRIBUTING.md       # 分支、文件归类与提交前检查
├── index.html
├── vite.config.js        # Vite + /ncm-api 代理
├── svelte.config.js
├── tsconfig.json
├── package.json          # 包名 zheting，版本以此文件为准
└── pnpm-lock.yaml
```

> 包名 `zheting` 和仓库名 `ZTmusic` 不一致——`ZT` 是"哲听"的缩写，`zheting` 是拼音。历史遗留，暂时没改。

## 构建与发版

日常在 `dev` 分支写 UI，用 `pnpm dev` 在浏览器预览；功能 PR 合入 `dev`，验证后再提交 `dev → main` PR。`main` 是稳定分支，要求 PR 和 **Source checks** 通过。

开发包在 [GitHub Actions](https://github.com/XuBuYuan17/ZTMusic/actions/workflows/build.yml) 下载：

- 推送 `dev` 或提交到 `dev/main` 的 PR：检查源码，构建 Windows 开发安装包。进入对应运行的 **Artifacts** 下载，保留 14 天；名称包含运行编号和提交 SHA。
- 开发版“哲听 Dev”可与稳定版同时安装，登录、设置和缓存独立。按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具，可查看源码、Console 和 Network；Console 的 `[build]` 标识对应提交。
- 合入 `main`：验证 Windows/Linux 正式构建，不自动发布。手动运行 **Build Installers** 时选择 `dev/main` 和平台；Linux 默认不选。

正式发版也走 PR：

1. 在 `main` 手动运行 **Prepare Release**，选择 auto / patch / minor / major，自动生成版本与 CHANGELOG 更新 PR。
2. 如果 GitHub 要求批准机器人 PR 的检查，先批准对应运行；源码检查通过后合入 PR。
3. **Tag Prepared Release** 为合入提交创建正式标签并显式触发安装包构建；正式标签必须属于 `main` 且与版本号一致。
4. Windows/Linux 安装包构建完成后发布 GitHub Release。仓库需允许 GitHub Actions 创建 PR；发版后将 `main` 的版本更新通过 PR 同步回 `dev`。

详细的架构说明、API 链路、调试技巧见 [`docs/development.md`](docs/development.md)。

提交约定与目录说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。`pnpm test` 包含仓库内容检查，会拦截被跟踪的本机配置、临时产物和常见密钥格式；只显示文件与行号，不回显疑似密钥。

这个项目耗费了我很多时间和精力，奈何本人能力不足，总是会有各种奇奇怪怪的 BUG。
如果遇到了，希望您不要介意。

## 许可证

[MIT](./LICENSE)
