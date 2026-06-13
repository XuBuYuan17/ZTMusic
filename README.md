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

哲听目前已经具备日常听歌所需的主要界面与播放流程：登录、首页、发现页、全局搜索、歌单详情、歌手详情、资料库、最近播放、历史日推、歌词页、播放队列、设置和关于页。

已完成或正在整理的重点：

- 二维码、手机号、邮箱登录
- 歌曲搜索、热门搜索、歌手和歌单结果
- 首页、发现页、排行榜、推荐歌单和新歌
- 歌单详情、歌手详情、收藏歌单、最近播放、历史日推
- 底部播放器、播放队列、同步歌词、音量和进度控制
- 深色/浅色主题、自定义 API 地址、接口缓存清理
- 手机端布局、悬浮 mini player、悬浮底部 tabs
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

Android APK 由 GitHub Actions 的 `android` job 构建。release/tag 构建要求配置签名 secrets，否则 workflow 会失败，避免发布未签名 APK。

如需使用本地 API 服务，可在控制台写入：

```js
localStorage.setItem('api_base', 'http://localhost:3000')
```

---

## Android APK 签名

APK 发布前必须签名。项目不会提交 keystore，GitHub Actions 通过 Secrets 临时注入签名文件。

生成 keystore：

```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

导出为 GitHub Secret 可用的 base64：

```bash
base64 -w 0 upload-keystore.jks
```

在仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 说明 |
|---|---|
| `ANDROID_KEY_BASE64` | `upload-keystore.jks` 的 base64 内容 |
| `ANDROID_KEY_ALIAS` | key alias，例如 `upload` |
| `ANDROID_KEY_PASSWORD` | key 密码 |
| `ANDROID_STORE_PASSWORD` | keystore 密码 |

CI 会在 `src-tauri/gen/android/keystore.properties` 写入临时配置，并动态 patch 生成的 Gradle 工程。不要提交 `*.jks`、`*.keystore` 或 `keystore.properties`。

验证 APK 是否已签名：

```bash
apksigner verify --verbose app-release.apk
```

---

## 自动发版流程

项目使用两个 GitHub Actions workflow 完成版本更新、构建和发布：

| Workflow | 作用 |
|---|---|
| `Prepare Release` | 手动输入版本号，自动更新版本文件、提交 commit、创建并推送 tag |
| `Build & Release` | tag 触发后构建 `.deb`、`.rpm`、`.msi`、`.apk`，最后统一发布 GitHub Release |

发版步骤：

1. 打开 GitHub Actions。
2. 运行 `Prepare Release`。
3. 输入新版本号，例如 `0.1.1`。
4. workflow 会自动更新：
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
5. workflow 会提交 `chore: release v0.1.1` 并推送 tag `v0.1.1`。
6. workflow 会以该 tag 显式触发 `Build & Release`。
7. 所有平台构建完成后，最终 `release` job 会统一创建 GitHub Release 并上传产物。

注意：Android tag/release 构建必须提前配置签名 secrets，否则 APK 构建会失败，避免发布未签名安装包。

---

## 项目结构

```text
zheting/
├── index.html                # Vite 入口；包含 referrer=no-referrer，避免网易音频 CDN 403
├── vite.config.js            # Vite/Svelte 配置；开发环境代理 /ncm-api 到默认后端
├── package.json              # pnpm scripts 与依赖
├── pnpm-lock.yaml
├── src/
│   ├── main.js               # 设置 viewport-fit=cover，识别 mobile-runtime，挂载 Svelte App
│   ├── App.svelte            # 应用路由、全局弹层、页面装配、播放队列入口
│   ├── app.css               # 全局主题、桌面布局、手机布局、播放器和页面样式
│   └── lib/
│       ├── api/
│       │   └── client.js     # ncm API 封装、cookie 保存、缓存、浏览器/Tauri 请求分流
│       ├── components/
│       │   ├── PlayerBar.svelte
│       │   ├── MobileMiniPlayer.svelte
│       │   ├── MobileShell.svelte
│       │   ├── MobileTabs.svelte
│       │   ├── QueuePanel.svelte
│       │   ├── MobileQueuePanel.svelte
│       │   ├── LyricsPage.svelte
│       │   ├── LoginOverlay.svelte
│       │   ├── SearchOverlay.svelte
│       │   └── ...           # 登录、弹窗、列表动作、通用 UI
│       ├── pages/
│       │   ├── HomePage.svelte
│       │   ├── MobileHomePage.svelte
│       │   ├── ExplorePage.svelte
│       │   ├── PlaylistPage.svelte
│       │   ├── ArtistPage.svelte
│       │   ├── LibraryPage.svelte
│       │   ├── RecentPage.svelte
│       │   ├── DailyHistoryPage.svelte
│       │   ├── SearchPage.svelte
│       │   ├── SettingsPage.svelte
│       │   └── ...
│       ├── player/
│       │   ├── engine.js     # HTMLAudioElement 播放内核
│       │   └── colors.js     # 封面取色
│       ├── services/
│       │   ├── home.js       # 首页、资料库、最近播放、榜单数据
│       │   ├── details.js    # 歌单、专辑、歌手详情加载
│       │   ├── explore.js    # 发现页数据
│       │   └── dailyHistory.js
│       ├── stores/
│       │   ├── auth.svelte.js    # 登录态、二维码登录、cookie 写入
│       │   └── player.svelte.js  # 播放状态、队列、音质 fallback、历史记录
│       ├── utils/
│       │   ├── cache.js
│       │   ├── storage.js
│       │   ├── lyrics.js
│       │   ├── normalize.js
│       │   └── image.js
│       ├── i18n/
│       └── icons/
├── src-tauri/
│   ├── tauri.conf.json       # 桌面窗口、构建、bundle、Android 配置
│   ├── src/
│   │   ├── lib.rs            # Tauri command: ncm_request，Rust reqwest 请求代理
│   │   └── main.rs
│   └── icons/
└── public/
```

---

## 关键运行链路

### API 请求链路

所有网易云接口统一从 `src/lib/api/client.js` 的 `ncm` 对象发出。

浏览器开发环境：

```text
Svelte 页面/Store
  -> ncm.*()
  -> /ncm-api/*
  -> Vite dev server proxy
  -> https://music.xubuyuan.top/*
```

Tauri 桌面环境：

```text
Svelte 页面/Store
  -> ncm.*()
  -> invoke('ncm_request')
  -> src-tauri/src/lib.rs
  -> reqwest
  -> NeteaseCloudMusicApi Enhanced
```

重要细节：

- 默认 API 地址：`https://music.xubuyuan.top`。
- 浏览器开发时默认走 `/ncm-api`，避免跨域问题。
- 每次请求默认带 `randomCNIP=true`，降低 IP/地区限制问题。
- 登录接口返回的 cookie 会保存到本地 `api_cookie`。
- GET 请求会把 cookie 放入 query；Tauri 请求还会加 `Cookie` header。
- GET 接口按端点配置本地缓存，见 `CACHE_TTL`。

### 登录链路

登录状态在 `src/lib/stores/auth.svelte.js`。

支持：

- 手机号登录
- 邮箱登录
- 二维码登录

登录成功后：

```text
login / qrLogin
  -> ncm.setCookie(cookie)
  -> localStorage api_cookie
  -> auth_user / auth_mode
```

二维码登录会轮询 `/login/qr/check`，`803` 表示授权成功并返回 cookie。

### 播放链路

播放主逻辑在 `src/lib/stores/player.svelte.js`，音频内核在 `src/lib/player/engine.js`。

```text
用户点击歌曲
  -> player.playTrack(track) 或 player.playQueue(tracks, index)
  -> getPlayableUrls(songId)
  -> ncm.songUrl(id, level, unblock)
  -> /song/url/v1
  -> 取 response.data[0].url
  -> normalizePlayUrl(url)
  -> engine.load(url)
  -> HTMLAudioElement.play()
```

当前音质顺序：

```text
lossless -> exhigh -> higher -> standard
```

当前 fallback 策略：

1. 快速并发请求用户偏好音质、`standard`、`higher`。
2. 如果没有可用 URL，再对这些音质尝试 `unblock=true`。
3. 如果仍没有，加入网易外链兜底：`https://music.163.com/song/media/outer/url?id=xxx.mp3`。
4. 后台继续尝试剩余音质和 unblock。
5. 音频 `error` 时自动切换 `_playUrls` 的下一个 URL。

过滤规则：

- 没有 `url` 不播放。
- `code === 404` 不播放。
- `freeTrialInfo` 不播放，避免把试听片段当完整版。

开发环境会输出播放 URL 诊断日志：

```text
[play-url:result]
[play-url:error]
```

### VIP 歌曲与 403

VIP 歌曲能否播放取决于登录 cookie 对应账号是否有权限。权限正常时 `/song/url/v1` 通常会返回：

```text
code: 200
payed: 1
freeTrialInfo: null
url: http(s)://m*.music.126.net/...
```

有些歌曲即使返回了完整 URL，CDN 也可能因为 `Referer` 返回 `403 Forbidden`。项目入口 `index.html` 必须保留：

```html
<meta name="referrer" content="no-referrer" />
```

这个配置对网易音频 CDN 很关键，不要删除。

移动端/WebView 还可能拦截明文 `http://m*.music.126.net/...` 音频。播放器会把网易 CDN URL 规范成 HTTPS：

```text
http://m801.music.126.net/... -> https://m801.music.126.net/...
```

相关函数：`normalizePlayUrl()`。

---

## 页面与布局约定

### 桌面端

桌面端由 `App.svelte` 组合：

```text
Sidebar
MainArea
  -> MobileShell wrapper
  -> 页面内容
PlayerBar / QueuePanel / LyricsPage / SearchOverlay
```

PC 端仍保留左侧 Sidebar 和悬浮 PlayerBar。不要把移动端规则写到全局基础选择器里，避免影响桌面布局。

### 手机端

手机端通过 `src/main.js` 给 `html` 加 `mobile-runtime`：

```text
max-width: 760px 或 pointer: coarse 或移动 UA
  -> html.mobile-runtime
```

手机端结构：

```text
MobileTopBar
content-scroll
MobileMiniPlayer
MobileTabs
```

手机端约定：

- Sidebar 在手机端隐藏。
- 搜索不作为底栏 tab，使用顶部按钮打开 `SearchOverlay`。
- 底栏 `MobileTabs` 是悬浮胶囊样式。
- `MobileMiniPlayer` 悬浮在底栏上方。
- 内容底部 padding 必须同时预留 mini player、tabs 和 safe area。
- 移动端关键尺寸通过 CSS 变量统一管理：

```css
--mobile-topbar-h
--mobile-tabs-h
--mobile-mini-player-h
--mobile-bottom-gap
--mobile-tabs-bottom-gap
```

### 首页约定

首页分为桌面 `HomePage.svelte` 和手机 `MobileHomePage.svelte`。

当前首页不展示“为你推荐”区块，重点保留：

- 问候/hero
- 快捷入口
- 继续播放
- 资料库预览

如果将来恢复推荐区块，需要同步清理/恢复对应 CSS，避免 Svelte unused selector 警告。

---

## 常用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务 |
| `pnpm build` | 构建前端产物到 `dist/` |
| `pnpm preview` | 预览前端构建产物 |
| `pnpm tauri:dev` | 启动 Tauri 桌面开发模式 |
| `pnpm tauri:build` | 构建桌面安装包 |
| `pnpm tauri android build --apk --target aarch64` | 构建 Android arm64 APK |

当前没有单独的 lint/test 脚本，提交前至少运行：

```bash
pnpm build
```

---

## 调试提示

播放失败时优先看浏览器控制台：

```text
[play-url:result]
[play-url:error]
```

重点字段：

- `level`
- `unblock`
- `code`
- `hasUrl`
- `freeTrial`
- `message`

如果 `/song/url/v1` 返回 URL 但音频仍然失败：

1. 检查 `index.html` 是否保留 `referrer=no-referrer`。
2. 检查音频 URL 是否为 `m*.music.126.net`，应由 `normalizePlayUrl()` 转成 HTTPS。
3. 检查 Network 面板音频请求是否是 `403`、`404` 或媒体解码错误。
4. 检查 cookie 是否存在且属于有权限的账号。
5. 试听片段会被过滤，不会自动播放。

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
