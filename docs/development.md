# ZTmusic 开发指南

本文描述当前仓库的实现。入口以 [`package.json`](../package.json)、[`src/main.js`](../src/main.js)、[`src/App.svelte`](../src/App.svelte) 和 [`.github/workflows/build.yml`](../.github/workflows/build.yml) 为准。项目是 Svelte 5 + Tauri 2 的桌面与 Web 客户端；同一套前端也有手机浏览器布局。

## 快速开始

项目使用 Node.js 22、pnpm 10.28.1。依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。

分支、目录归类和提交内容检查见 [贡献指南](../CONTRIBUTING.md)。本地代理设置与签名材料留在被忽略的目录，不提交到仓库。

```bash
pnpm install               # 首次拉取项目时安装依赖
pnpm dev                   # Vite 浏览器开发
pnpm check                 # Svelte/TypeScript 检查
pnpm test                  # 自包含 Node.js 测试
pnpm build                 # Vite 生产构建，输出 dist/
pnpm verify                # 版本检查 + check + test + build
```

运行单个测试可用 `node src/lib/player/fallback.test.ts`；测试入口 [`scripts/run-tests.mjs`](../scripts/run-tests.mjs) 会收集并运行整套测试。浏览器开发服务器通过 [`vite.config.js`](../vite.config.js) 将 `/ncm-api` 转发至默认后端。

日常开发使用 `dev` 分支和 `pnpm dev`，本地不编译 Rust 或构建安装包，也不需要安装 Rust 工具链。浏览器适合验证 UI；系统媒体控制、窗口与安装行为使用 GitHub 构建的包验证。保留 Tauri 源码与锁文件供 CI 使用，仓库不提供 Android 构建。

## 分支与安装包

- `main` 是稳定分支，要求 PR 和 **Source checks** 通过，禁止强推和删除，不要求他人审批，不设置管理员绕过。
- `dev` 是日常开发分支，允许直接推送，接收新功能与外部 PR；验证后通过 `dev → main` PR 更新稳定版。GitHub 默认分支仍是 `main`，创建功能 PR 时需明确选择 `dev` 为目标。
- `dev` 推送与指向 `dev/main` 的 PR 自动生成 Windows 开发安装包；PR 验证 GitHub 提供的合并结果。`main` 推送验证 Windows/Linux 正式构建，只有正式标签构建发布 Release。
- 手动运行 **Build Installers** 可选择 `dev/main` 和平台；Windows 默认开启、Linux 默认关闭。正式标签始终构建两平台。

在 [Build Installers](https://github.com/XuBuYuan17/ZTMusic/actions/workflows/build.yml) 的对应运行中下载 **Artifacts**，保留 14 天；名称包含渠道、运行编号和提交 SHA，开发包不发布到 Releases。

开发版使用 `com.zheting.music.dev`、`zheting-dev.exe` 和“哲听 Dev”名称，独立安装、单实例、WebView 存储和原生缓存，不迁移稳定版的数据。开发配置是 `src-tauri/tauri.dev.conf.json`，CI 同时启用 Cargo 的 `dev-channel` 和 `VITE_APP_CHANNEL=dev`，采用优化构建而非完整 Debug 构建。

开发包按 `F12` 或 `Ctrl+Shift+I` 打开 DevTools；源码映射和播放调试日志默认开启，Console 的 `[build]` 会显示渠道和提交 SHA。原生日志由 Tauri 日志插件写入该应用的独立日志目录。稳定包关闭 DevTools，不包含前端源码映射。

## 代码地图

| 位置 | 职责 |
|---|---|
| `src/main.js`、`src/App.svelte` | 启动、全局样式、布局选择、页面与浮层装配 |
| `src/lib/pages/pc/`、`src/lib/pages/mobile/`、`src/lib/pages/` | PC 页面、手机浏览器页面、共享详情页面 |
| `src/lib/components/` | 导航、播放器、对话框和通用组件 |
| `src/lib/stores/` | Svelte 5 rune 状态：登录、路由、播放、本地曲库等 |
| `src/lib/music/` | Provider 契约、业务模型映射及 `musicService` |
| `src/lib/api/` | 后端端点、传输、会话 Cookie 和 API 缓存策略 |
| `src/lib/player/` | HTMLAudio 引擎、队列、URL 解析、预取与媒体控制 |
| `src/lib/db/`、`src/lib/local-music/` | SQLite/IndexedDB 持久化与本地音频 |
| `src/styles/`、`src/app*.css` | 全局设计令牌、功能样式、PC/手机布局 |
| `src-tauri/src/` | Rust IPC、HTTP 转发、WebDAV、Windows SMTC、Linux MPRIS |
| `.github/workflows/` | CI 构建和发版准备 |
| `scripts/`、`scripts/maintenance/` | CI 与测试入口、可复用 CSS / 字体维护工具 |
| `tests/`、`docs/archive/` | 浏览器手动集成检查、带日期的历史审计记录 |

[`src/lib/stores/router.svelte.ts`](../src/lib/stores/router.svelte.ts) 通过 `activeView` 切换页面，没有使用客户端路由库。`src/lib/utils/layout-mode.ts` 根据设置、`?mobile` 调试参数、触摸设备和窗口大小决定布局；[`src/main.js`](../src/main.js) 将结果同步到 `html.mobile-runtime`。手机浏览器布局属于此仓库的 Web 前端。

## 请求与业务数据

### 运行时传输

默认 API 地址在 [`src/lib/api/session.ts`](../src/lib/api/session.ts) 中，为 `https://music.xubuyuan.top`。用户设置的 `api_base` 会覆盖默认值。[`src/lib/api/client.ts`](../src/lib/api/client.ts) 统一发起请求：

- 本地浏览器开发且使用默认地址时，请求 `/ncm-api`，由 Vite 代理转发。
- Tauri 桌面端调用 `api_request`，由 [`src-tauri/src/api.rs`](../src-tauri/src/api.rs) 用 reqwest 转发；Rust 端限制目标 host 与重定向。
- 其他浏览器环境直接请求配置的 API 地址。公开部署时需自行确认后端跨域策略与代理配置；`pnpm build` 只生成静态文件。

请求默认带 `randomCNIP=true`，部分登录接口明确关闭。HTTP 响应格式及端点以 [`client.ts`](../src/lib/api/client.ts) 的实际调用为准。

### Provider 与页面边界

通用读取链路为：

```text
页面 / 组件 → musicService → 当前 MusicProvider → ncm 端点客户端 → 后端
```

[`src/lib/music/service.ts`](../src/lib/music/service.ts) 暴露搜索、热搜、榜单歌曲、歌词、播放源、歌曲详情、歌单、专辑和歌手等能力。默认 Provider 是 [`src/lib/music/providers/netease.ts`](../src/lib/music/providers/netease.ts)，将网易云响应映射为 [`src/lib/types/music.ts`](../src/lib/types/music.ts) 的业务模型。播放器迁移期间，歌曲模型仍保留 `ar/al/dt/picUrl` 等兼容字段。

账号相关操作（登录、收藏、歌单写入、关注、评论和消息）仍直接使用 `ncm`，不要假定它们已经抽象为跨 Provider 能力。新增通用音乐数据优先经过 Provider；新增带账号状态的能力先判断是否需要可选契约。[`src/lib/music/provider-boundary.test.js`](../src/lib/music/provider-boundary.test.js) 检查已迁移模块的边界。

歌单详情由 [`src/lib/services/details.ts`](../src/lib/services/details.ts) 处理 `trackIds`、分批补齐歌曲与顺序重建。改动歌单加载时，先看这里与共享的 [`PlaylistPage.svelte`](../src/lib/pages/PlaylistPage.svelte)。

### 会话与缓存

Cookie 在 `api_cookie` 中持久化，由 [`session.ts`](../src/lib/api/session.ts) 管理；有效请求 Cookie 必须含 `MUSIC_U`，缺少 `os` 时补 `os=pc`。响应中的 Cookie 按键合并，避免覆盖已有登录字段。不要把个人 Cookie 写进源码。

[`src/lib/stores/auth.svelte.ts`](../src/lib/stores/auth.svelte.ts) 支持手机号、邮箱和二维码登录。二维码轮询会取消上一轮、在网络错误时退避，并在 90 秒后超时。启动恢复登录态时先调用 `/login/status`，通过后刷新 VIP 信息；失效时检查会话快照，再延迟清理登录态。

GET 缓存的端点 TTL 定义在 [`src/lib/api/cache-ttl.ts`](../src/lib/api/cache-ttl.ts)：歌词 7 天、歌单详情 30 分钟、播放 URL 不走 API 响应缓存。[`cache-policy.ts`](../src/lib/api/cache-policy.ts) 生成包含完整 Cookie 的缓存键，并管理内存与持久缓存；业务响应 `code` 不是 200 时不缓存。持久化经 [`src/lib/db/cache.ts`](../src/lib/db/cache.ts) 优先使用 SQLocal/OPFS，失败时降级到 IndexedDB 等存储。非 Tauri 浏览器没有跨源隔离时，[数据库初始化](../src/lib/db/init.ts) 会跳过 SQLite。

## 播放与本地曲库

播放状态由 [`src/lib/stores/player.svelte.ts`](../src/lib/stores/player.svelte.ts) 管理；[`src/lib/player/queue.ts`](../src/lib/player/queue.ts) 负责队列和播放模式。[`engine.ts`](../src/lib/player/engine.ts) 使用两个 `HTMLAudioElement`：当前播放与下一首预加载。`prefetch.ts` 预取下一首 URL 和音频；切歌后只使用仍然对应当前队列的预取结果。

[`url-resolver.ts`](../src/lib/player/url-resolver.ts) 先查预取/持久缓存，再依次尝试标准、较高及偏好音质；若不可用，尝试 unblock、match、旧版 `/song/url`、试听片段，最后使用官方外链模板。后台 `fillFallbackUrls` 补充更多候选；[`fallback.ts`](../src/lib/player/fallback.ts) 负责 URL 遍历和失败切换。超时封装与调用方取消信号会让当前等待尽快结束；当前 `musicService.getStream()` 没有传入网络取消信号，不能据此认定底层请求已被取消。

[`native-media.ts`](../src/lib/player/native-media.ts) 在 Windows/Linux Tauri 桌面端对接 Rust 系统媒体控制；Web 使用 Media Session。WebDAV 扫描与音频缓存走 Tauri IPC，[`src/lib/local-music/webdav.ts`](../src/lib/local-music/webdav.ts) 在非 Tauri 环境会明确报错。

本地文件导入在 [`src/lib/stores/local-music.svelte.ts`](../src/lib/stores/local-music.svelte.ts)；单文件上限 1 GiB。`metadata.ts` 解析 ID3v2 文本元数据并提供文件名回退，`storage.ts` 将曲目元数据与音频 Blob 分别写入 IndexedDB。队列持久化只保存本地曲目定位信息，不保存 Blob URL。

## UI 与样式

`src/App.svelte` 负责 PC 壳、共享浮层和播放器；[`MobileApp.svelte`](../src/lib/components/MobileApp.svelte) 负责手机布局的底部导航、抽屉和详情内容。全局颜色、圆角、阴影、层级令牌在 [`src/app.css`](../src/app.css)；PC/手机外壳分别在 `src/app-pc.css` 与 `src/app-mobile.css`。

[`src/main.js`](../src/main.js) 按顺序静态导入全局 CSS；新增全局文件时同步更新 [`scripts/maintenance/css-files.mjs`](../scripts/maintenance/css-files.mjs)。组件私有样式写在组件 `<style>`；跨组件规则放 `src/styles/` 对应功能文件。样式自检会检查共享圆角尺度、字体权重和大字号字距。

界面字体是随包分发的 HarmonyOS Sans SC，CSS 使用 400/500/700 三档字重；授权声明见“关于”页与 `public/fonts/`。UI 细节、视觉令牌和组件规范另见 [`docs/ui-design.md`](ui-design.md)。涉及手机端返回或转场时，以当前组件实现为准。

## 调试与验证

播放调试可在开发者工具中执行：

```js
localStorage.setItem('debug_playback', 'true')
```

随后查看 `[play-url:*]`、`[playback:*]` 日志。播放失败先检查 `index.html` 的 `no-referrer` meta、音频 URL、Network 中的 403/404，以及 `api_cookie` 是否仍有效。Tauri HTTP 转发问题检查 `src-tauri/src/api.rs`。

`pnpm test` 还运行 `scripts/repo-hygiene.test.mjs`，检查 Git 跟踪路径和常见密钥格式，并扫描本次暂存内容。它不打印疑似密钥值；提交前仍需审阅实际 diff。历史审计记录不代表当前验收结果。

改动后的最低验证：

| 改动 | 验证 |
|---|---|
| Svelte/TypeScript、样式或业务逻辑 | 本地 `pnpm check`、相关测试和浏览器预览；CI 运行 `pnpm verify` |
| Rust 桌面代码 | 推送 `dev` 后由 GitHub 编译，下载安装包验证；本地不执行 Rust 构建 |
| 单一纯逻辑模块 | 对应 `node path/to/module.test.ts`，再按影响范围运行完整检查 |
| CI 或发布流程 | 本地运行 `node scripts/build-workflow.test.mjs`、`pnpm check:versions`、`pnpm test`；GitHub 验证实际构建 |

发布流程：在 `main` 手动运行 [`release-prepare.yml`](../.github/workflows/release-prepare.yml)，验证后生成版本文件与 CHANGELOG 更新 PR，不直接写入 `main`。仓库需开启 Actions 创建 PR 的权限；机器人创建的 PR 检查如进入等待批准状态，先在 GitHub 批准运行。合入后 [`release-publish.yml`](../.github/workflows/release-publish.yml) 校验版本、CHANGELOG 与 `main` 祖先关系，创建标签，再用 `workflow_dispatch` 显式触发构建，避免依赖 `GITHUB_TOKEN` 推送标签的隐式触发。正式标签构建两平台并发布 Release，其他事件不发布。发版后通过 `main → dev` PR 同步版本更新；日常改动不修改历史 CHANGELOG 条目。

## 代码约定

遵守 [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)：优先利用已有模块和平台能力，避免无关抽象；输入校验、数据保护、安全和无障碍不能省略。复杂逻辑至少留下一个可运行的最小自检。修改前先读调用方、被调用方和现有测试；文档中的固定数值或行为变化时，同时核对其代码来源。
