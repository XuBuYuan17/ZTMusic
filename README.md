<p align="center">
  <img src="./src-tauri/icons/icon.png" alt="ZTmusic Logo" width="112" />
</p>

<h1 align="center">ZTmusic (哲听)</h1>

<p align="center">
  <em>一个简洁、安静的网易云音乐第三方桌面客户端。</em>
</p>

<p align="center">
  <a href="https://github.com/xubuyuan18/ZTmusic/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://svelte.dev/"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte" alt="Svelte" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri" alt="Tauri" /></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-latest-F69220?logo=pnpm" alt="pnpm" /></a>
</p>

---

## 当前进度

哲听目前已经具备日常听歌所需的主要界面与播放流程：登录、首页推荐、发现页、搜索、歌单详情、歌手详情、资料库、最近播放、历史日推、歌词页、播放队列、设置和关于页。

已完成或正在整理的重点：

- 二维码、手机号、邮箱登录
- 歌曲搜索、热门搜索、歌手和歌单结果
- 首页推荐、发现页、排行榜、推荐歌单和新歌
- 歌单详情、歌手详情、收藏歌单、最近播放、历史日推
- 底部播放器、播放队列、同步歌词、音量和进度控制
- 深色/浅色主题、自定义 API 地址、接口缓存清理
- Tauri 桌面端与浏览器开发模式

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | [Svelte 5](https://svelte.dev/) + [Vite 8](https://vite.dev/) |
| 桌面端 | [Tauri 2](https://v2.tauri.app/) + Rust |
| 音频 | HTML5 Audio |
| API | [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) |
| 包管理 | [pnpm](https://pnpm.io/) |

默认 API 地址为 `https://music.xubuyuan.top`，浏览器开发时通过 Vite 代理访问 `/ncm-api`。

---

## 快速开始

```bash
cd zheting
pnpm install
pnpm dev
```

启动桌面应用：

```bash
pnpm tauri:dev
```

构建前端或桌面安装包：

```bash
pnpm build
pnpm tauri:build
```

Windows 版本建议在 Windows 环境或 GitHub Actions `windows-latest` 中构建，产物包含 MSI/NSIS 安装包。运行时需要 Microsoft Edge WebView2 Runtime，Win10/Win11 通常已内置。

如需使用本地 API 服务，可在设置页修改后端地址，或在控制台写入：

```js
localStorage.setItem('api_base', 'http://localhost:3000')
```

---

## 项目结构

```text
zheting/
├── src/
│   ├── App.svelte
│   ├── app.css
│   └── lib/
│       ├── api/              # 网易云 API 客户端与缓存
│       ├── components/       # 播放器、歌词、登录、队列等组件
│       ├── pages/            # 首页、发现、搜索、歌单、歌手、设置、关于等页面
│       ├── player/           # HTML5 Audio 播放内核
│       ├── services/         # 首页、发现、详情、历史日推数据加载
│       ├── stores/           # 播放器和登录状态
│       └── utils/            # 归一化、缓存、存储、歌词等工具
├── src-tauri/                # Tauri 桌面端配置与 Rust 入口
├── package.json
└── vite.config.js
```

---

## 相关仓库

| 仓库 | 说明 |
|---|---|
| [xubuyuan18/ZTmusic](https://github.com/xubuyuan18/ZTmusic) | 哲听客户端 |
| [NeteaseCloudMusicApiEnhanced/api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) | 特别感谢，提供网易云接口能力 |

---

## 说明

哲听是第三方客户端项目，接口能力来自社区项目。请遵守对应服务条款和版权规则，仅用于学习与个人使用。

## License

[MIT](./LICENSE)
