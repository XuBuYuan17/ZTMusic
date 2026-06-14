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
</p>

---

## 快速开始

```bash
pnpm install
pnpm dev              # 浏览器开发
pnpm tauri:dev        # 桌面端开发
pnpm build            # 前端构建
pnpm tauri:build      # 构建安装包
```

默认 API 地址 `https://music.xubuyuan.top`，浏览器开发时由 Vite 代理转发。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | [Svelte 5](https://svelte.dev/) + [Vite 8](https://vite.dev/) |
| 桌面端 | [Tauri 2](https://v2.tauri.app/) + Rust |
| 音频 | HTML5 Audio（双缓冲预加载） |
| API | [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) |

---

## 功能

- 二维码 / 手机号 / 邮箱登录
- 发现页、排行榜、推荐歌单与新歌
- 歌单、歌手详情
- 资料库、最近播放、历史日推
- 全屏歌词页（滚动高亮、逐字动画）
- 播放队列、多模式切换
- 音质选择 & 多级 fallback
- 歌曲 URL 持久缓存（IndexedDB）
- 下一首音频预加载（零延迟切歌）
- 深色 / 浅色主题
- 多语言（中 / 英）

---

## 项目结构

```
zheting/
├── src/
│   ├── App.svelte
│   ├── app.css
│   ├── main.js
│   └── lib/
│       ├── api/              # API 封装、缓存
│       ├── components/       # 通用组件
│       ├── pages/            # 页面
│       ├── player/           # 音频引擎
│       ├── services/         # 数据加载
│       ├── stores/           # 状态管理
│       └── utils/            # 工具函数
├── src-tauri/
│   └── src/lib.rs            # Rust 请求代理
└── package.json
```

---

## 发版

GitHub Actions 自动构建。运行 `Prepare Release` workflow 输入版本号即可打 tag、构建并发布。

Android 构建需在 Secrets 中配置签名密钥。

---

## 许可证

[MIT](LICENSE)
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
