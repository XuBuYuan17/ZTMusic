<p align="center">
  <img src="./src-tauri/icons/icon.png" alt="ZTmusic Logo" width="120" />
</p>

<h1 align="center">ZTmusic (哲听)</h1>

<p align="center">
  <em>网易云音乐第三方桌面客户端 — 简洁、优雅、跨平台</em><br />
  <em>A third-party Netease Cloud Music desktop client — clean, elegant, cross-platform</em>
</p>

<p align="center">
  <a href="https://github.com/xubuyuan18/ZTmusic/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  </a>
  <a href="https://svelte.dev/">
    <img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte" alt="Svelte" />
  </a>
  <a href="https://vite.dev/">
    <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" />
  </a>
  <a href="https://v2.tauri.app/">
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri" alt="Tauri" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js" alt="Node" />
  </a>
  <a href="https://pnpm.io/">
    <img src="https://img.shields.io/badge/pnpm-latest-F69220?logo=pnpm" alt="pnpm" />
  </a>
</p>

---

## 截图 / Screenshots

| 探索页 Explore | 歌单页 Playlist |
|---|---|
| _待添加_ | _待添加_ |

| 播放器 Player | 歌词 Lyrics |
|---|---|
| _待添加_ | _待添加_ |

---

## 功能特性 / Features

### 登录 / Login
| 功能 | 说明 |
|---|---|
| 二维码登录 | 网易云音乐 App 扫码，无需输入密码 |
| 手机号登录 | 手机号 + 密码 |
| 邮箱登录 | 邮箱 + 密码 |

### 浏览发现 / Discovery
| 功能 | 说明 |
|---|---|
| 个性化推荐 | 基于你的听歌口味推荐歌单和歌曲 |
| Banner 轮播 | 首页热门活动与推荐 |
| 排行榜 | 所有官方榜单一览 |
| 热门歌单 | 按分类浏览热门歌单 |
| 新歌推荐 | 每日最新歌曲推荐 |

### 播放 / Playback
| 功能 | 说明 |
|---|---|
| 播放队列 | 支持顺序 / 随机 / 单曲循环三种模式 |
| 歌词同步 | 迷你栏滚动歌词 + 全屏歌词页（逐行动画） |
| 进度控制 | 点击进度条跳转、播放/暂停、上一首/下一首 |
| 音量控制 | 滑块调节 |
| 封面取色 | 根据专辑封面自动提取主题色作为背景 |
| 播放记录 | 本地缓存最近 200 首，支持离线查看 |

### 歌单 / Playlists
| 功能 | 说明 |
|---|---|
| 歌单详情 | 封面、标题、描述、曲目列表 |
| 收藏歌单 | 浏览你收藏的歌单 |
| 红心歌曲 | 喜欢/取消喜欢 |
| 全部播放 | 一键播放整个歌单 |

### 云盘 / Cloud Drive
| 功能 | 说明 |
|---|---|
| 云盘列表 | 浏览用户在网易云上传的音乐 |
| 云盘播放 | 直接播放云盘歌曲 |

### 界面 / UI
| 功能 | 说明 |
|---|---|
| 深色/浅色主题 | 一键切换 |
| 侧边栏导航 | 快速切换页面 |
| 响应式布局 | 自适应窗口大小 |

---

## 技术栈 / Tech Stack

```
┌─────────────────────────────────────┐
│            ZTmusic                   │
│  ┌────────────┐  ┌──────────────┐   │
│  │   Svelte 5  │  │  Tauri v2    │   │
│  │   (UI)      │  │  (Desktop)   │   │
│  ├────────────┤  ├──────────────┤   │
│  │   Vite 8    │  │    Rust      │   │
│  │   (Build)   │  │  (Native)    │   │
│  └────────────┘  └──────┬───────┘   │
│                          │           │
│              HTTP REST API           │
│                          │           │
│  ┌────────────┐          │           │
│  │  Netease   │◄─────────┘           │
│  │  Cloud API │                      │
│  │  (Enhanced)│                      │
│  └────────────┘                      │
└─────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| 前端框架 | [Svelte 5](https://svelte.dev/) (runes: `$state`, `$effect`, `$derived`) |
| 构建工具 | [Vite 8](https://vite.dev/) |
| 桌面壳 | [Tauri v2](https://v2.tauri.app/) (Rust) |
| 后端 API | [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) |
| 音频引擎 | HTML5 Audio API |
| 包管理 | [pnpm](https://pnpm.io/) |

---

## 快速开始 / Quick Start

### 环境要求 / Prerequisites

```bash
# Node.js >= 18
node -v

# pnpm
npm install -g pnpm

# Rust (仅桌面构建需要)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 1. 启动后端 API

项目依赖网易云音乐 API 服务。使用仓库附带的 `api-enhanced/`：

```bash
cd api-enhanced

# 安装依赖
pnpm install

# 启动服务（默认端口 3000）
pnpm dev
```

验证是否启动成功：

```bash
curl http://localhost:3000/banner
```

> 后端也可使用其他网易云 API 服务，只需在前端配置中修改 `API_BASE`。

### 2. 启动前端开发

```bash
cd zheting

# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:5173）
pnpm dev
```

### 3. 启动桌面应用（Tauri）

```bash
pnpm tauri:dev
```

---

## 构建安装包 / Build Distribution

### 构建当前平台

```bash
pnpm tauri:build
```

产物路径：

| Platform | Target | Bundle |
|---|---|---|
| Windows | `x86_64-pc-windows-msvc` | `.msi` |
| macOS (Intel) | `x86_64-apple-darwin` | `.dmg` |
| macOS (Apple Silicon) | `aarch64-apple-darwin` | `.dmg` |
| Linux | `x86_64-unknown-linux-gnu` | `.deb` |

```bash
# 产物位置
src-tauri/target/release/bundle/
```

### 跨平台构建 / Cross-platform Build via CI

项目配置了 GitHub Actions，推送 `main` 分支自动构建三平台安装包：

1. 推送代码到 GitHub
2. 进入 **Actions** 标签页
3. 选择 **Build & Release** 工作流
4. 下载构建产物（Artifacts）

手动触发：

```bash
# 推送后自动触发
git push origin main

# 或在 GitHub Actions 页面点击 "Run workflow"
```

---

## 配置说明 / Configuration

### 后端地址

默认连接 `http://localhost:3000`，可通过浏览器开发者工具修改：

```js
// 在浏览器控制台或 localStorage 中设置
localStorage.setItem('api_base', 'http://your-api-server:3000')
```

也可在 Settings 页面中修改。

### 主题

主题偏好保存在 `localStorage` 的 `zheting-theme` 字段中：

| 值 | 主题 |
|---|---|
| `dark` | 深色模式（默认） |
| `light` | 浅色模式 |

### Cookie 持久化

用户登录凭证自动保存在 `localStorage` 的 `api_cookie` 字段，无需重复登录。

---

## 项目结构 / Project Structure

```
zheting/
├── src/
│   ├── App.svelte                      # 应用主入口
│   ├── main.js                         # Svelte 挂载点
│   ├── app.css                         # 全局样式
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.js               # 网易云 API 客户端封装
│   │   │
│   │   ├── components/
│   │   │   ├── Sidebar.svelte          # 侧边栏导航
│   │   │   ├── PlayerBar.svelte        # 底部播放控制栏
│   │   │   ├── LyricsPage.svelte       # 全屏歌词页
│   │   │   ├── LoginOverlay.svelte     # 登录弹窗
│   │   │   ├── RankingCard.svelte      # 排行榜卡片
│   │   │   ├── TopNav.svelte           # 顶部导航
│   │   │   ├── UnifiedNav.svelte       # 统一导航栏
│   │   │   └── Spinner.svelte          # 加载指示器
│   │   │
│   │   ├── pages/
│   │   │   ├── HomePage.svelte         # 首页（个人主页）
│   │   │   ├── ExplorePage.svelte      # 发现页
│   │   │   ├── PlaylistPage.svelte     # 歌单详情页
│   │   │   ├── LibraryPage.svelte      # 收藏歌单页
│   │   │   ├── CloudPage.svelte        # 云盘页
│   │   │   ├── RecentPage.svelte       # 最近播放页
│   │   │   └── SettingsPage.svelte     # 设置页
│   │   │
│   │   ├── player/
│   │   │   ├── engine.js               # HTML5 音频引擎
│   │   │   └── colors.js               # 封面取色工具
│   │   │
│   │   ├── stores/
│   │   │   ├── player.svelte.js        # 播放器状态管理
│   │   │   └── auth.svelte.js          # 登录态管理
│   │   │
│   │   ├── utils/
│   │   │   └── lyrics.js               # 歌词解析工具
│   │   │
│   │   └── format.js                   # 格式化工具函数
│   │
│   └── assets/                         # 静态资源
│
├── src-tauri/                           # Tauri 桌面配置
│   ├── tauri.conf.json                 # Tauri 配置
│   ├── Cargo.toml                      # Rust 依赖
│   ├── src/
│   │   ├── main.rs                     # Rust 入口
│   │   └── lib.rs                      # Tauri 应用初始化
│   ├── icons/                          # 应用图标
│   └── build.rs                        # 构建脚本
│
├── .github/workflows/
│   └── build.yml                       # CI 自动构建工作流
│
├── package.json                        # 前端依赖
├── vite.config.js                      # Vite 配置
└── svelte.config.js                    # Svelte 配置
```

---

## 常见问题 / FAQ

### Q: 播放歌曲时提示 "No song URL"

A: 部分歌曲受版权保护，无法获取播放地址。可尝试登录后播放。

### Q: 二维码登录提示过期

A: 二维码有效期约 5 分钟，过期后会自动刷新，重新扫码即可。

### Q: 构建时提示缺少系统依赖

A: Linux 系统需要安装 WebKit2GTK：

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev patchelf
```

### Q: 如何修改默认端口？

A: 后端在 `api-enhanced/.env` 中配置端口；前端在浏览器控制台运行：

```js
localStorage.setItem('api_base', 'http://localhost:新端口')
```

---

## 开发计划 / Roadmap

- [ ] 搜索功能页面
- [ ] 艺术家详情页
- [ ] 专辑详情页
- [ ]  MV 播放
- [ ]  歌单导入/导出
- [ ]  桌面通知
- [ ]  全局快捷键
- [ ]  歌词翻译显示
- [ ]  自定义 API 地址（Settings 页面 UI）

---

## 鸣谢 / Credits

- [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) — 网易云音乐 API 服务
- [Binaryify/NeteaseCloudMusicApi](https://github.com/binaryify/NeteaseCloudMusicApi) — 原始 API 项目
- 所有贡献者和开源社区

---

## License

[MIT](./LICENSE)

---

<p align="center">
  Made with ❤️
</p>
