# ZTmusic 开发项目文档

> 本文档对齐当前代码库状态（v1.4.1）。如有出入以代码为准。

## 项目定位

ZTmusic（哲听）是一个基于 Svelte 5 + Tauri 2 的第三方音乐客户端，目标是做一个安静、轻量、跨平台的听歌应用，而不是单纯“换皮网页”。代码分为前端 UI、音乐服务 Provider、播放器、本地/远程曲库、Tauri 原生桥和构建发布几层。

核心原则：

- 页面层只调用稳定服务入口，不直接绑定某个音乐 API 的响应形状。
- 播放器是独立域，负责队列、URL fallback、预取、进度、媒体会话和本地/远程曲目播放。
- 本地能力通过 Tauri 命令或 IndexedDB 边界封装，页面不直接接触文件系统、HTTP 代理细节或 Blob 持久化。
- UI 使用统一令牌、统一圆角、统一字体和按功能域拆分的 CSS。

## 项目结构速览

| 路径 | 职责 |
|---|---|
| `src/App.svelte` | 应用总装配：PC / Mobile 运行时布局、页面切换、播放器、浮层 |
| `src/lib/pages/` | 页面组件；`pc/` 与 `mobile/` 分端页面，根目录放跨端通用页面 |
| `src/lib/components/` | 播放器、侧栏、搜索浮层、队列、对话框和通用 UI 组件 |
| `src/lib/stores/` | Svelte 5 rune 状态：登录、路由、播放器、本地音乐、壁纸 |
| `src/lib/music/` | Provider 抽象和音乐服务门面 |
| `src/lib/api/` | 网易云端点客户端、缓存策略、会话 Cookie |
| `src/lib/player/` | 播放引擎、fallback、预取、队列、媒体会话、播放历史 |
| `src/lib/local-music/` | 本地音乐元数据、IndexedDB 存储、WebDAV 远程源 |
| `src/lib/db/` | SQLocal / IndexedDB 缓存、历史和设置 |
| `src/styles/` | 按功能域拆分的全局样式 |
| `src-tauri/src/` | Rust IPC、HTTP 代理、WebDAV、Windows SMTC、Linux MPRIS |
| `src-tauri/capabilities/` | Tauri 权限配置 |
| `scripts/` | 自检、CSS 清理、字体/圆角/版本约束脚本 |

## 常用开发命令

```bash
pnpm dev                  # 浏览器端开发，API 走 Vite proxy
pnpm tauri:dev            # 桌面端开发
pnpm test                 # 全部自包含 node 测试
pnpm build                # 前端生产构建
pnpm tauri:build          # Windows NSIS 安装包，内置 --target x86_64-pc-windows-gnu
pnpm verify               # 版本检查 + 测试 + 前端构建
```

Windows 本地打包建议用 PowerShell 显式补 PATH：

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;C:\msys64\mingw64\bin;$env:PATH"
pnpm tauri:build
```

`C:\msys64\mingw64\bin` 提供 `windres`。没有它时，Tauri Windows 资源编译会失败。

## 两个运行时环境

ZTmusic 跑在两种环境下，请求链路不同：

| 环境 | 入口 | 请求路径 |
|---|---|---|
| 浏览器开发 | `pnpm dev` | `/ncm-api` → Vite proxy → `https://music.xubuyuan.top` |
| Tauri 桌面 / 移动 | `pnpm tauri:dev` | `musicService` → Provider → `invoke('api_request')` → reqwest |

网易云端点由 `src/lib/api/client.js` 的 `ncm` 对象封装；页面级通用音乐能力从 `src/lib/music/service.js` 的 `musicService` 发出。`isBrowserDevRuntime()` 和 `isTauriRuntime()` 判断底层请求走浏览器还是 Tauri。

浏览器开发时，`vite.config.js` 把 `/ncm-api` 代理到后端，规避跨域。Tauri 端走 IPC，由 Rust 用 reqwest 转发，**SSRF 白名单校验在 Rust 端做**（只允许 `music.xubuyuan.top` 等精确匹配的 host，且禁用自动重定向）。

默认请求带 `randomCNIP=true`，cookie 保存在 `api_cookie`。

---

## 音乐服务 Provider

通用业务不要直接依赖某家服务的 URL、响应外壳或字段名。当前调用方向是：

```text
页面 / 组件
  → musicService（稳定能力入口）
  → 当前 MusicProvider（服务适配器）
  → 端点客户端 / Tauri api_request
  → 外部 API
```

核心文件：

| 文件 | 职责 |
|---|---|
| `src/lib/music/provider.js` | Provider 定义、注册、切换和能力检查 |
| `src/lib/music/service.js` | 页面使用的稳定门面；默认注册网易云 Provider |
| `src/lib/music/providers/netease.js` | 调用 `ncm` 并把网易云字段映射为统一模型 |
| `src/lib/api/client.js` | 网易云端点客户端、缓存、Cookie 和运行时传输 |
| `src-tauri/src/api.rs` | 通用 IPC HTTP 代理及每个 Provider 的安全策略 |

Provider 是**能力型契约**，不要求每个服务一次实现全部功能。当前稳定能力为：

- `search(query, options)` → `{ songs, artists, playlists }`
- `getHotSearch()` → `[{ keyword, score }]`
- `getTopSongs(limit)` → 统一歌曲数组
- `getLyrics(id)` → `[{ time, text, translation }]`
- `getStream(id, options)` → 主播放源候选
- `getMatchedStream(id)` / `getLegacyStream(id, bitrate)` → 可选 fallback 候选
- `getTracks(ids)` → 统一歌曲详情数组
- `getPlaylist(id)` / `getAlbum(id)` / `getArtist(id)` → 统一详情模型

统一歌曲保留播放器当前需要的兼容字段 `ar/al/dt/picUrl`，同时提供中立字段 `providerId/sourceId/artists/album/durationMs/coverUrl`。新增业务应优先读取中立字段；兼容字段在播放器完成迁移前不能删除。

新增 API 服务时：

1. 在 `src/lib/music/providers/` 实现上述最小契约，并通过 `registerMusicProvider()` 注册。
2. 只声明该服务实际支持的可选能力；调用不支持的能力会给出明确错误。
3. 桌面端若需要 Rust 转发，在 `src-tauri/src/api.rs` 增加该 Provider 的精确 host、Referer 等策略。**禁止改成任意 host 代理。**
4. 浏览器开发若存在跨域，再在 `vite.config.js` 增加对应代理；不要复用 `/ncm-api` 冒充其他服务。
5. 为响应映射写一个不访问网络的适配器测试。

当前搜索、热搜、榜单歌曲、歌词、歌曲/歌单/专辑/歌手详情和播放源解析已走 Provider。音质 fallback 的顺序、缓存和超时仍属于播放器域，Provider 只返回候选播放源。

登录、收藏、歌单写操作、关注、评论和消息仍直接使用 `ncm`：这些是带账号状态或明显具有平台特色的能力，不能为了“统一接口”强迫所有 Provider 实现。迁移时应先定义可选 capability，再移动调用点。

`src/lib/music/provider-boundary.test.js` 会检查已迁移模块，防止它们重新引用 `ncm` 或 `api/client.js`。

---

## API 缓存

`src/lib/api/cache-policy.js` 管理 GET 响应缓存：

- `CACHE_TTL` 表定义各端点的 TTL（歌词 7 天、歌单详情 30 分钟、歌曲 URL 不缓存）
- 缓存 key 由 `base + endpoint + params + body + 完整 cookie` 生成（cookie 参与 hash，避免跨账号串数据）
- 存储走 `src/lib/db/cache.js`，优先 SQLite（SQLocal），不可用时降级到 IndexedDB（`utils/dbcache.js`）

---

## 登录链路

`src/lib/stores/auth.svelte.js`，Svelte 5 rune（`$state` / `$effect`）。

**登录方式**：手机号 / 邮箱 / 二维码。成功后 `ncm.setCookie(cookie)`，cookie 持久化到 `api_cookie`。

**cookie 过期检测**：播放拿不到 URL 或只有试听片段时，触发 `auth.checkLoginStatus()`。无效则置 `_cookieOk = false`，**延迟 100ms 后清除登录态**（让 UI 先捕捉到状态变化）。清除前用会话快照二次校验，避免清掉这 100ms 内的新登录。

**二维码轮询**：`startQrPolling` 带幂等保护（新一轮开始前 cancel 旧的）、网络错误指数退避（最多 3 次）、90s 硬超时。

**启动初始化**：`init()` 先 `checkLoginStatus()` 校验 cookie，通过后才 `refreshVipInfo()`，避免失效 cookie 下写入过期 VIP 信息。

---

## 播放链路

### 核心文件

- `src/lib/stores/player.svelte.js` — 播放状态 store
- `src/lib/player/engine.js` — 双 Audio 元素引擎
- `src/lib/player/fallback.js` — URL 遍历状态机
- `src/lib/player/url-resolver.js` — 音质 fallback 链
- `src/lib/player/prefetch.js` — 下一首预取
- `src/lib/player/queue.js` — 播放队列

### 音频引擎（engine.js）

`AudioEngine` 类用**两个 HTMLAudio 元素**：

- `audio` — 当前播放
- `preloadAudio` — 隐藏预加载器

```js
engine.preload(url)        // 后台加载，不播放
engine.swapToPreloaded()   // 零延迟切换（会检查预加载元素健康状态）
engine.load(url)           // 加载新 URL（入口去重：同 URL 直接返回）
```

`load()` 入口加了同 URL 去重，避免 store 重复下发同一 track 时打断播放。`swapToPreloaded()` 在 swap 前检查 `preloadAudio.error` 和 `readyState`，预加载失败时降级到普通 load。

### 音质 fallback 链（url-resolver.js）

```
Phase 1（3.5s 超时）: [standard, higher, 用户偏好] → 首条可用 URL 即播放
Phase 2（5s 超时）:
  1. 用户偏好音质（仅严格更好时升级）
  2. 上述 + unblock
  3. music.163.com 外链
  4. /song/url 老版 API
  5. /song/url/match (UnblockNeteaseMusic)
```

`withTimeout` 用 `Promise.race` + `AbortController`，`.finally(cleanup)` 释放 timer 和 abort listener。所有 `fetchSongUrl` 调用都传 signal，切歌时能中断飞行中的请求。

### 预加载（prefetch.js）

`createPrefetchManager()` 返回 `prefetchNextTrackUrl(options)`：

- 用 `prefetchId` 去重，`songUrl` 返回后复检 `prefetchId === activePrefetchId && !isStale()` 才调 `preload()`
- 避免 await 期间用户切歌，把过期的下一首预加载到 engine

### fallback 控制器（fallback.js）

纯同步状态机，caller 通过 `next()` 返回值决定下一步：

```js
const ctl = createFallbackController(urls)
const r = ctl.next()
if (r.status === 'playing') engine.load(r.url)
// 播放失败时再调 ctl.next()
```

`updateUrls()` 复位到第一个（切歌或 fill 完成），`removeUrl()` 移除失败 URL 并自动调整索引。

### 切歌进度恢复

`player._restoreSeeking` 标志：fallback 切 URL 前若 `currentTime > 0` 则置 `true`，engine `canplay` 时 seek 回原位置。

---

## 状态管理

Svelte 5 rune 模式（`$state` / `$effect` / `$derived`），集中在 `src/lib/stores/`：

| Store | 职责 |
|---|---|
| `auth.svelte.js` | 登录态、cookie、VIP 信息 |
| `player.svelte.js` | 播放状态、队列、fallback |
| `router.svelte.js` | 视图切换（非客户端路由，基于 `activeView` 状态） |
| `wallpaper.svelte.js` | 自定义壁纸元数据、Blob URL 和动态壁纸播放偏好 |
| `local-music.svelte.js` | 本地曲库、导入进度和文件管理 |

**注意**：`$effect` 的依赖是自动追踪的。写 rune 时注意：
- 纯写 `$state` 不会让 effect 依赖它，只有读才会
- `player.restore()` 用 `untrack` 包裹，避免读到内部 rune 形成循环依赖
- 订阅（如 `responsive.subscribe`）必须在 effect cleanup 里取消

---

## 存储层

三层存储，按优先级降级：

| 层 | 文件 | 用途 |
|---|---|---|
| SQLite（SQLocal） | `db/cache.js` | API 缓存、歌曲 URL 缓存、设置 |
| IndexedDB | `utils/dbcache.js` | SQLite 不可用时的 fallback |
| 独立 IndexedDB | `services/wallpaper-storage.js` | 自定义图片/视频壁纸 Blob |
| 独立 IndexedDB | `local-music/storage.js` | 本地音乐元数据与音频 Blob（两个 object store） |
| localStorage | `utils/storage.js` | 简单键值（主题、登录态等） |

**IndexedDB 事务注意**：
- `trimUrlCache` 全程用回调链在同一事务内排队，**不能 await**（否则事务提前 auto-commit，删除来不及执行）
- 过期项由 `dbCleanExpired()` 统一清理，读路径不再嵌套开 readwrite 事务
- 壁纸使用独立的 `zheting-wallpaper` 数据库，不进入 API 缓存，也不写入 localStorage；替换壁纸时覆盖唯一的 `active` 记录
- Tauri WebView 不依赖 OPFS。壁纸存储完成后才更新界面，并在更换时撤销旧的 Blob URL，避免内存泄漏
- 本地音乐使用 `zheting-local-music` 数据库：`tracks` 只保存轻量元数据，`files` 保存音频 Blob。队列只持久化 `source/localId`，不能把音频内容或 Blob URL 写进 localStorage

### 本地音乐链路

```text
文件/文件夹选择
  → metadata.js 校验格式并解析 ID3v2 标题/歌手/专辑
  → local-music.svelte.js 读取时长和导入进度
  → storage.js 写入 IndexedDB tracks + files
  → LocalMusicPage 生成 source: local 队列
  → player.svelte.js 读取 Blob URL → engine.js 播放
```

- 支持 MP3、FLAC、WAV、OGG、Opus、M4A、AAC；最终能否解码由 WebView2/系统媒体能力决定。
- 单文件上限 1 GB。导入会复制文件到应用 WebView 数据目录，移除曲库副本不会删除用户原始文件。
- 本地 ID 是文件名、大小和修改时间的稳定指纹。`compactTrack()` 必须保留 `source/localId`，恢复播放时字符串 ID 不能经过 `parseInt`。
- 本地曲目不进入网易云 Provider、URL fallback、远程预取或在线播放历史。删除曲目时同步清理播放队列，避免悬空引用。
- 当前只读取 ID3v2 文本字段；无标签文件按“歌手 - 歌名.ext”回退，否则显示未知歌手。封面解析和原路径监听属于后续扩展。

---

## 调试

```js
localStorage.setItem('debug_playback', 'true')
```

Console 输出 `[play-url:result]` / `[playback:xxx]` 日志。

**播放失败排查**：
1. 确认 `index.html` 保留 `<meta name="referrer" content="no-referrer">`
2. 检查音频 URL 是否为 HTTPS（`normalizePlayUrl()` 自动转换）
3. Network 面板确认无 403/404
4. 检查 `api_cookie` 是否有权限

**Rust 端调试**：`src-tauri/src/api.rs` 的 `api_request` 命令处理 Provider IPC 请求，SSRF 白名单、Referer 和重定向策略都在这里。

---

## 构建与发版

```bash
pnpm build                # 前端构建
pnpm tauri:build          # 桌面端安装包（Windows: NSIS）
```

**Windows 打包必须带 `--target`**：用户级 `~/.cargo/config.toml` 设置了 `[build] target = "x86_64-pc-windows-gnu"`，cargo 把 exe 输出到 `target/x86_64-pc-windows-gnu/release/`，而 tauri CLI 默认去 `target/release/` 找 → `os error 2`。`package.json` 的 `tauri:build` 已内置 `--target x86_64-pc-windows-gnu`，不要裸跑 `tauri build`。`bundle.targets` 为 `["nsis"]`（跳过 MSI/WiX）。

**Windows + gnu 工具链的前提**：`tauri-winres` 编译 Windows 资源（图标、版本信息）时要调 `windres`，rustup 自带的 self-contained mingw 里**没有**它。MSYS2 有，但 Git Bash 的 PATH 不含 MSYS2 的 mingw64 目录，所以裸跑 `cargo check` 会在 build script 阶段 panic（`Couldn't to execute windres`）。加进 PATH 即可，不用装东西：

```bash
export PATH="$HOME/.cargo/bin:/c/msys64/mingw64/bin:$PATH"
cargo check                        # 在 src-tauri/ 下跑
```

注意 Windows 主机只编译 `cfg(target_os = "windows")` 分支，`linux_mpris` 那条路径要靠 CI 的 linux job 验证。

**CI**（`.github/workflows/`）：
- `build.yml`：push 到 `main`、PR、tag `v*` 或手动触发都会先跑 `pnpm verify`，再按触发条件构建 Windows NSIS `.exe` 与 Linux `.deb/.rpm`。tag 构建完成后自动发布 GitHub Release，release notes 从 CHANGELOG 抽。
- `release-prepare.yml`：手动触发，跑 `pnpm verify` → 自动算版本号 → 更新 package.json / Cargo.toml / Cargo.lock / tauri.conf.json / CHANGELOG → 原子 push `HEAD:main` 与 tag。tag push 会自然触发 `build.yml`，不再额外手动 dispatch，避免重复构建。

---

## UI 开发规范

ZTmusic 的 UI 目标是“安静、专注、轻量的桌面音乐播放器”：以封面、歌曲信息和播放状态为视觉主角，用中性表面和留白控制噪声，以红色作为品牌强调。

### 设计原则

1. **音乐优先**：封面、歌曲名、歌手和播放状态高于装饰元素。
2. **低噪声**：优先用背景差异、轻边框和留白组织层级，不给每个列表项叠加卡片和重阴影。
3. **操作明确**：一个区域只保留一个主操作，其余降为图标、文字按钮或上下文菜单。
4. **状态可见**：Loading、Empty、Error、Disabled、选中和当前播放状态都必须有可见反馈。
5. **跨端同语义**：PC 和移动端共享内容、状态和交互语义，但根据输入方式分别排版。
6. **动效有目的**：只用于说明进入、切换、展开和播放状态，不作持续装饰。

### 全局 UI 结构

```text
App
├─ PC：Sidebar + MainArea
├─ Mobile：MobileApp + Drawer + Bottom Tabs
├─ 常驻播放层：PlayerBar
├─ 沉浸播放层：LyricsPageV2 / AppleMusicPlayer
├─ 功能浮层：SearchOverlay / QueuePanel / LoginOverlay
├─ 本地曲库：LocalMusicPage / local-music store
├─ 对话层：ConfirmDialog / FollowDialog / 页面内 Dialog
└─ 反馈层：Toast
```

| 运行时 | 结构 | 约束 |
|---|---|---|
| PC | `Sidebar + MainArea + PlayerBar` | 侧栏标准 `260px`，折叠 `68px`；主内容独立滚动；播放器悬浮在底部 |
| Mobile | `MobileApp + Drawer + Bottom Tabs + PlayerBar` | 使用 `100dvh`和 `safe-area`；首页/发现/歌单/搜索四个主入口；详情页隐藏底栏 |

`src/App.svelte` 负责总装配，`src/lib/components/MobileApp.svelte` 负责移动端内容和导航。页面切换由 `router.activeView` 驱动，不使用客户端路由库。

### 视觉令牌

公共组件优先使用 `src/app.css` 的 `:root` / `[data-theme="dark"]` 令牌，不直接写主题相关颜色。

| 类别 | 令牌 | 用途 |
|---|---|---|
| 背景 | `--bg` / `--bg-surface` / `--bg-layer` / `--bg-elevated` | 窗口、面板、局部分组和悬浮表面 |
| 交互背景 | `--bg-hover` / `--bg-active` | Hover 和按下状态 |
| 文字 | `--text` / `--text-secondary` / `--text-tertiary` / `--text-disabled` | 主文字、辅助信息、弱元数据和禁用状态 |
| 强调 | `--accent` / `--accent-bg` / `--accent-gradient` | 当前项、主操作、播放键和进度 |
| 危险 | `--danger` / `--danger-hover` | 删除、清理、取消收藏 |
| 边框 | `--border` / `--border-strong` | 层级分隔 |
| 圆角 | `--radius-xs/sm/md/lg/xl` | 微型控件、小控件、列表、卡片和主容器 |
| 阴影 | `--shadow-sm/md/lg/xl` | 从普通卡片到对话框的逐级海拔 |

层级表达顺序：**背景差异 → 轻边框 → 阴影**。圆角固定为 `6/8/12/16/20px` 五档语义令牌；嵌套表面从外向内递减。`999px` 只用于真实胶囊和细长轨道，`50%` 只用于等宽高圆形，其他布局禁止使用任意像素圆角。规则由 `src/lib/utils/border-radius.test.js` 自动检查。

### 内容与组件模式

**页面头部**：通常由 kicker、唯一主标题、简短说明和一个主操作组成。详情页改用“返回 + 封面 + 元数据 + 播放全部”。

**歌曲行**：稳定信息顺序为 `[封面/序号] [歌曲名 + 歌手/专辑] [时长/操作]`。当前播放项用强调色或弱强调背景；窄屏优先隐藏时长；长文本必须设置 `min-width: 0` 和截断策略。

**卡片**：用于封面驱动内容，音乐封面默认 `1:1`。同一区块只保留“主标题 + 一行元数据”，移动端优先横向轨道或双列网格。

**按钮**：

- 主按钮：强调色/渐变 + 白字，只用于主操作。
- 次按钮：表面色或弱边框。
- 图标按钮：必须有 `aria-label`，移动端点击区尽量不小于 `40×40px`。
- 危险按钮：使用 `--danger`，必要时二次确认。

**搜索**：`SearchPage` 和 `SearchOverlay` 都应包含输入/清空、结果分类、分组预览以及 Loading/Empty/Error。搜索头和分类栏设置 `flex-shrink: 0`，只让结果区滚动。

**播放器**：`PlayerBar` 负责常驻快速控制，`LyricsPageV2` / `AppleMusicPlayer` 负责沉浸播放和次级功能。移动底栏固定采用“封面与歌曲信息 + 播放/暂停 + 下一首”，队列、收藏、分享、音质、歌手、专辑和外观等次级能力统一收进歌词页右上角菜单。播放/暂停始终是视觉中心；进度和音量控件必须支持鼠标、触摸、键盘和 slider ARIA。

**跨层返回**：打开沉浸播放层时，调用方必须把实际触发元素交给 `openSheet(originEl)`。全屏壳记录来源元素的完整矩形，以 `clip-path` 完成共享来源转场；关闭、系统返回和 Escape 都沿同一路径收回，不能只做通用淡出或固定向下滑动。`prefers-reduced-motion` 下取消空间动画但保留层级切换。

**收藏页**：资料库按“高频入口 → 收藏歌单 → 创建歌单”排列。PC 使用紧凑页头、快捷入口与封面网格；移动端使用一张主收藏入口和原生分组行，歌单仍采用双列封面网格。不要用多个同权重渐变大卡片表达导航。

**自定义壁纸**：`WallpaperLayer.svelte` 只负责渲染，`wallpaper.svelte.js` 负责状态，`wallpaper-storage.js` 负责 IndexedDB 边界。图片上限 30 MB，视频上限 300 MB；视频必须静音循环，窗口进入后台时暂停，恢复可见后按用户偏好继续。格式支持以 WebView2/浏览器实际解码能力为准，优先推荐 MP4（H.264）和 WebM。设置页不得展示本机绝对路径，也不要将 Blob 转成 base64 放入 localStorage。

**系统媒体控制**：Linux 通过 Rust MPRIS，Windows 通过绑定 Tauri 主窗口 HWND 的 Rust SMTC；Web/macOS 使用 `navigator.mediaSession`。Windows WebView2 必须保持 `HardwareMediaKeyHandling` 禁用，否则会和原生 SMTC 同时注册两条媒体会话。SMTC 在首次媒体消息时延迟创建，进程 AUMID 固定为 `com.zheting.music`；不要重新引入独立 `MediaPlayer::new()`，否则 Windows 快捷设置会出现“未知应用”的空白会话。

### 交互、反馈与无障碍

- 异步内容区必须覆盖 Loading、Empty、Error 和 Disabled。列表骨架用于可预期的内容结构，Spinner 用于短等待或局部操作。
- 短时跨页反馈用 Toast，需要用户决策时用 Dialog，不用日志代替用户反馈。
- 对话框使用 `role="dialog"` + `aria-modal="true"`，管理初始焦点、Escape/返回关闭和背景 `inert`。
- 当前导航用 `aria-current="page"`，开关用 `aria-pressed`，连续值控件用 `role="slider"` 和 `aria-value*`。
- 保留全局 `:focus-visible` 焦点环；选中、播放和错误状态不能只靠颜色表达。
- 动效优先使用 `transform/opacity`，并为持续或大幅动画提供 `prefers-reduced-motion` 降级。

z-index 统一使用现有层级：`--z-sidebar: 50` → `--z-player: 100` → `--z-overlay: 200` → `--z-dialog: 400` → `--z-toast: 600`，不随意新增更大的硬编码值。

### 样式归属

1. 全局令牌、重置和原生壳基础规则放 `app.css`。
2. 仅 PC 或移动运行时使用的结构放 `app-pc.css` / `app-mobile.css`。
3. 跨组件的功能域样式放 `src/styles/` 对应文件，不回填到 `app.css`。
4. 单组件私有样式放组件 `<style>`，页面独有样式放页面组件。
5. 不新建平行设计系统，不动态拼接 class 名（CSS 清理脚本依赖静态字面量）。
6. flex 滚动布局中，固定头部/标签/操作栏设 `flex-shrink: 0`，滚动区设 `min-height: 0`。

### UI 变更检查清单

- [ ] 信息层级只有一个视觉主角，PC/移动/详情页返回路径明确。
- [ ] 使用现有颜色、圆角、阴影和动效令牌，深浅主题对比度正常。
- [ ] 长歌名/歌手/专辑名有截断策略，底栏、PlayerBar 和 safe-area 不遮挡内容。
- [ ] Hover、Active、Focus、Disabled、Loading、Empty 和 Error 状态完整。
- [ ] 图标按钮有 `aria-label`，键盘可操作，reduced-motion 下功能完整。
- [ ] 至少人工检查 PC 浅色/PC 深色/窄屏移动端/长文本/无封面/空结果/失败状态。

### CSS 加载机制

`src/main.js` 顶部按依赖顺序**静态导入**全部样式。`scripts/css-files.mjs` 是 CSS 自检和清理工具共享的文件清单，新增全局样式文件时必须同步更新它和 `main.js`。

| 文件 | 职责 |
|---|---|
| `app.css` | 字体、设计令牌、reset、共享动画和原生壳基础 |
| `styles/shell.css` | 应用外壳、侧栏、主内容容器 |
| `styles/wallpaper.css` | 图片/视频壁纸层、主题遮罩与移动端半透明壳 |
| `styles/search-overlay.css` | 全局搜索浮层 |
| `styles/player-bar.css` | 底部常驻播放器 |
| `styles/home.css` | PC 首页与个人首页 |
| `styles/library.css` | 资料库、歌单网格与创建对话框 |
| `styles/content.css` | 共享内容模式、详情页、最近页及历史移动覆盖 |
| `styles/explore.css` | 发现页的横幅、分类与推荐内容 |
| `styles/lyrics.css` | 沉浸歌词页的全屏壳与主题过渡 |
| `styles/lyrics/*.css` | 歌词播放器、上下文面板、控制区与移动适配 |
| `app-pc.css` | `html:not(.mobile-runtime)` 下的 PC 播放器布局 |
| `app-mobile.css` | `html.mobile-runtime` 下的移动壳、导航、抽屉与底部播放器 |
| `styles/mobile/*.css` | 移动歌词、通用组件、资料库、设置与响应式适配 |
| `styles/product-polish.css` | 跨页面的最终层级、克制动效与表面收敛规则（最后加载） |

桌面/移动规则分别用 `html:not(.mobile-runtime)` / `html.mobile-runtime` 前缀门控，`layoutMode` store 切换 `mobile-runtime` class 决定哪套生效。

> ⚠️ 不要改回动态 `import()`：Vite 生产构建无法静态分析变量路径，动态导入的 CSS 不会被打包（`cssCodeSplit: false` 下全部合并进 `dist/assets/style-*.css`）。曾因此导致生产版 `app-pc.css` 丢失、歌词页空白（见 CHANGELOG Unreleased）。

### 字体与字重

界面主字体是**随包分发**的 HarmonyOS Sans SC，只打包 3 个字面：

| 文件（`public/fonts/`） | `font-weight` |
|---|---|
| `HarmonyOS_Sans_SC_Regular.ttf` | 400 |
| `HarmonyOS_Sans_SC_Medium.ttf` | 500 |
| `HarmonyOS_Sans_SC_Bold.ttf` | 700 |

**CSS 里的 `font-weight` 只能写这三个值。** 其余字重浏览器要么舍入、要么合成"假粗体"（笔画糊、字距乱）。批量收敛用：

```bash
node scripts/converge-font-weight.mjs --dry   # 预览
node scripts/converge-font-weight.mjs         # 写入（覆盖全局 CSS + 组件 <style>）
```

`src/lib/utils/font-weight.test.js` 会守住这条，以及 `@font-face` 声明、字体栈首位、`index.html` 与 `app.css` 字体栈一致（防开屏字体跳变）。

> ⚠️ 三条许可证约束（HarmonyOS Sans Fonts License Agreement）：
> 1. **必须在软件内显著声明**使用了 HarmonyOS Sans —— 已放在「关于」页，勿删
> 2. **禁止修改字体文件** —— 因此不做 subset、不转 woff2。用 `scripts/verify-font-integrity.ps1` 校验随包 ttf 与原始 zip 逐字节一致
> 3. 不得单独分发字体本身（打进应用没问题）
>
> 代价：`dist/` 因此从 2.3 MB 涨到 26 MB（ttf 23.5 MB，NSIS/LZMA 压缩后约 16 MB）。若要减小体积，只能减少字面档数，不能裁字。

大字号标题另有光学字距要求，见 `src/lib/utils/type-scale.test.js`：`font-size >= 22px` 必须有负 `letter-spacing`，`clamp()` 流体字号要用 `em` 单位（收紧量随字号缩放）。歌词正文 `.ly-line-text` 用正字距是有意为之（长句可读性），在白名单里。

### 清理无引用的 CSS

全局 CSS 容易堆积废弃规则，有两个脚本配套：

```bash
node scripts/find-dead-css.mjs          # 列出源码中零引用的 class（按前缀归组）
node scripts/prune-dead-css.mjs --dry   # 预览将删除什么
node scripts/prune-dead-css.mjs         # 实际删除
```

脚本按 `scripts/css-files.mjs` 扫描所有全局 CSS。判定为"活"的条件：出现在 `.svelte`/`.js`/`index.html`（组件 `<style>` 块会被剔除后再匹配），或出现在 `:is()`/`:where()` 列表（预留样式 API，如 `.selectable`）。

删除策略保守：整条规则的所有选择器都判死才整块删；`.alive, .dead {}` 只摘掉死的那个；不含 class 的选择器不动。

> ⚠️ 前提：项目里所有 `classList` 操作都是**字面量字符串**。一旦出现 `class={`x-${v}`}` 这种动态拼接，静态扫描就会漏判，必须先改扫描器。
> `scripts/prune-dead-css.test.mjs` 守着核心不变量：**空死名单时输出与输入逐字节一致**（曾靠它抓到"重建时丢失闭合 `}`"和"误删原本就空的 `@media`"两个 bug）。

---

## 代码风格约定

项目遵循 **"ponytail" 懒 Senior 模式**（见 `.github/copilot-instructions.md`）：

- 动手前先问：真的需要建吗？标准库 / 平台特性 / 已有依赖能解决吗？
- 没有明确请求就不加抽象、不加依赖、不加 boilerplate
- **删减优于添加，无聊优于巧妙，文件越少越好**
- 有意简化必须用 `ponytail:` 注释标注，并说明该简化的已知上限与升级路径
- 非平凡逻辑要留**一个**可运行的检查（assert 自检或一个最小测试文件，不用框架/夹具）
- 不能偷懒的地方：信任边界输入校验、防数据丢失的错误处理、安全、无障碍
