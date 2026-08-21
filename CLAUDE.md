# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

**ZTmusic（哲听）** —— 网易云音乐第三方跨平台客户端，Svelte 5 + Tauri 2，支持 Windows / Linux / Android / Web。包名是 `zheting`（拼音），仓库名是 `ZTmusic`（"哲听"缩写），历史遗留不一致。

> 仅供个人学习与技术交流，音乐数据来自第三方 API。

## 常用命令

```bash
pnpm install              # 装依赖（pnpm，有 lockfile）
pnpm dev                  # 浏览器开发（Vite，/ncm-api 代理转发）
pnpm tauri:dev            # 桌面端开发
pnpm build                # 前端构建
pnpm test                 # 全部自检（node scripts/run-tests.mjs）
pnpm check:versions       # 校验 4 处版本号一致
pnpm verify               # = check:versions + test + build ← CI 的门禁，改完代码跑这个
```

**跑单个测试**：测试就是可直接执行的 node 脚本，没有框架：

```bash
node src/lib/player/fallback.test.js   # 退出码 0 = 过，1 = 挂
```

`pnpm test` 递归收集 `src/` 和 `scripts/` 下所有 `*.test.{js,mjs}`，**每个文件用独立子进程跑**（它们会装浏览器全局变量、patch 模块单例，同进程会互相污染）。测试不依赖 `node_modules`，未装依赖也能跑。

**构建安装包**：

```bash
pnpm tauri:build            # Windows NSIS（已内置 --target x86_64-pc-windows-gnu）
pnpm tauri:build:linux      # deb + rpm
pnpm tauri:build:android    # arm64-v8a release APK（需本机 SDK/NDK + 签名）
```

⚠️ **Windows 打包不要裸跑 `tauri build`**：用户级 `~/.cargo/config.toml` 设了 `[build] target`，cargo 输出到 `target/x86_64-pc-windows-gnu/release/` 而 tauri CLI 默认找 `target/release/` → `os error 2`。`package.json` 里已内置 `--target`。

## 架构

### 两个运行时，两条请求链路

| 环境 | 请求路径 |
|---|---|
| 浏览器开发 | `/ncm-api` → Vite proxy → `https://music.xubuyuan.top` |
| Tauri 桌面 / 移动 | `invoke('api_request')` → `src-tauri/src/api.rs` → reqwest |

`client.js` 里的 `isBrowserDevRuntime()` / `isTauriRuntime()` 决定走哪条。**SSRF 白名单、Referer、重定向策略都在 Rust 端** (`api.rs`)，只允许精确匹配的 host。IPC 命令名是 `api_request`（不是 `ncm_request`）。

### 数据访问的分层（重要）

```
页面/组件 → musicService（稳定门面）→ MusicProvider（服务适配器）→ ncm 端点客户端 → API
```

- `lib/music/service.js` —— 页面该用的入口，已注册网易云 Provider
- `lib/music/providers/netease.js` —— 把网易云字段映射成中立模型（`providerId/sourceId/artists/album/durationMs/coverUrl`；兼容字段 `ar/al/dt/picUrl` 播放器还在用，别删）
- `lib/api/client.js` 的 `ncm` 对象 —— 网易云端点、缓存、cookie

Provider 是**能力型契约**，不要求实现全部方法。登录、收藏、歌单写操作、关注、评论、消息**仍直接用 `ncm`**（带账号态或平台特色能力，不强行统一）。

⚠️ `lib/music/provider-boundary.test.js` 会检查已迁移的模块没有重新引用 `ncm` / `api/client.js` —— 在已迁移模块里直接调 `ncm` 会让测试挂。

### 播放链路

- `stores/player.svelte.js`（约 1000 行，播放状态机）+ `player/engine.js`
- `engine.js` 用**双 Audio 元素**做预加载：`preload()` 在隐藏元素上加载 → `swapToPreloaded()` 零延迟换位
- `player/url-resolver.js` —— URL 获取顺序：预取内存缓存 → IndexedDB → Phase 1 快速出声（standard/higher/用户偏好）→ Phase 2 unblock → 官方 fallback → 后台填充更多音质
- `player/fallback.js` —— 纯同步状态机，只管 URL 列表遍历/重试，不碰引擎和 UI
- 超时/容量等魔数集中在 `utils/constants.js`（`PLAYBACK`、`LIMITS`、`QUALITY_ORDER`）

### 布局与响应式

`utils/layout-mode.js` 是**唯一真相源**。`main.js` 订阅它切换 `<html>` 上的 `mobile-runtime` class，CSS 全部靠 `html:not(.mobile-runtime)` / `html.mobile-runtime` 前缀门控。`utils/responsive.js` 只是委托给它的兼容层。

`App.svelte` 是根组件，按 `router.activeView` 做 `{#if}/{:else if}` 条件渲染（**不是客户端路由**），页面都用 `lazyModule(() => import(...))` 懒加载。调试时 URL 加 `?mobile` 强制移动端布局。

### 状态管理

`lib/stores/` 下用 Svelte 5 rune（`$state`）：`auth` / `player` / `router` / `wallpaper` / `toast` / `local-music`。

### 存储

`lib/db/` —— 优先 SQLite（SQLocal），不可用降级 IndexedDB（`utils/dbcache.js`）。API 缓存 TTL 表在 `api/cache-policy.js`，缓存 key 把**完整 cookie 也 hash 进去**（避免跨账号串数据）。失败响应不写缓存。

### 桌面/移动原生（`src-tauri/src/`）

`api.rs`（IPC HTTP 代理）、`windows_smtc.rs`（Windows SMTC）、`linux_mpris.rs`（Linux MPRIS）、`media_playback.rs` / `media_metadata.rs`、`pending_action.rs`、`webdav.rs`。

`player/native-media-platform.js` 的 `selectMediaBackend()` 决定用原生还是 web media session —— **Android 走 `'web'`**，只有 Linux/Windows 走 `'native'`。

Cargo `crate-type` 含 `staticlib`/`cdylib` 是给移动端生成原生库用的，桌面端 `main.rs` 用 `rlib` 调 `app_lib::run()`。

## CSS 的硬约束

样式在 `main.js` 顶部**静态导入**，顺序有依赖。新增全局 CSS 文件必须同步改 `main.js` **和** `scripts/css-files.mjs`（自检与清理脚本共享的清单）。

⚠️ **不要改回动态 `import()`**：Vite 生产构建无法静态分析变量路径，动态导入的 CSS 不会被打包，曾导致生产版 `app-pc.css` 丢失、歌词页空白。

⚠️ **不要动态拼接 class 名**（`class={`x-${v}`}`）：CSS 清理脚本靠静态字面量扫描，一旦有动态拼接就会漏判。

⚠️ **`font-weight` 只能写 400 / 500 / 700** —— 随包只分发 HarmonyOS Sans SC 三个字面，其余字重会被合成假粗体。字体文件**禁止修改**（许可证要求，所以不 subset、不转 woff2），「关于」页的字体声明**不能删**。

部分"测试"其实是 CSS 设计令牌守卫，会扫描全局 CSS 并让 `pnpm test` 失败：`utils/font-weight.test.js`、`type-scale.test.js`（字距）、`border-radius.test.js`（圆角只允许 6/8/12/16/20px 等语义档）、`ui-harmony.test.js`（对比度）。配套的批量收敛脚本：

```bash
node scripts/converge-font-weight.mjs --dry
node scripts/converge-border-radius.mjs --dry
node scripts/find-dead-css.mjs            # 列零引用 class
node scripts/prune-dead-css.mjs --dry     # 预览删除
```

## 调试

```js
localStorage.setItem('debug_playback', 'true')  // Console 输出 [play-url:*] / [playback:*]
```

播放失败排查：`index.html` 的 `<meta name="referrer" content="no-referrer">` 是否还在 → 音频 URL 是否 HTTPS（`normalizePlayUrl()` 自动转）→ Network 面板查 403/404 → `api_cookie` 权限。

`vite.config.js` 里的 `stripCrossorigin` 插件移除 `crossorigin` 属性 —— Tauri WebView 用自定义协议加载资源，带 `crossorigin` 的 module 脚本/样式会被 CORS 拦截导致只显示裸 HTML。它保留封面取色用的 `crossOrigin="anonymous"`，改这块要两端实机验证。

## 代码风格：ponytail 懒 Senior 模式

完整规则见 [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。要点：

- 动手前逐级自问：真需要建吗 → 标准库有吗 → 平台特性有吗 → 已装依赖能解吗 → 能一行吗
- 没明确要求就不加抽象、不加依赖、不加 boilerplate
- **删减优于添加，无聊优于巧妙，文件越少越好**
- 有意简化用 `ponytail:` 注释标注，并写明已知上限与升级路径（代码里已有多处，照此风格写）
- 非平凡逻辑留**一个**可运行的检查（assert 自检或一个最小测试文件，不用框架/夹具）；一行逻辑不用测
- 不能偷懒：信任边界输入校验、防数据丢失的错误处理、安全、无障碍

## 版本与发版

版本号有 4 处必须一致（`package.json` 为准）：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。`pnpm check:versions` 守这条，改版本别手改单个文件。

发版走 GitHub Actions：手动触发 **Prepare Release** → 跑 `pnpm verify` → 算版本号 → 更新上述文件 + CHANGELOG → 原子 push `main` 与 tag → tag push 自然触发 **Build Installers**（不用再手动 dispatch）。`build.yml` 在 push main / PR / tag `v*` / 手动触发时都先跑 `pnpm verify` 再构建。

## 延伸文档

- [`docs/development.md`](docs/development.md) —— 最详尽的架构、API 链路、构建陷阱、UI 规范
- [`docs/ui-design.md`](docs/ui-design.md) —— 全局 UI 设计规范与视觉令牌
- [`docs/platform-adaptation.md`](docs/platform-adaptation.md) —— 各平台适配现状与待办
