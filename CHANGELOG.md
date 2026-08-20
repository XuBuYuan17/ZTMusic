# 更新日志

本项目所有值得注意的变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.4.1] - 2026-08-19

### 修复

- 修复搜索结果分类栏文字被裁切，以及桌面悬浮播放栏过度胶囊化的问题。
- 修复 Windows 快捷设置显示“未知应用”和可执行文件路径、并重复出现两条媒体会话的问题；Windows 现统一使用绑定主窗口的原生 SMTC，并补齐 AUMID、封面和延迟注册。
- 修复原生 SMTC 在 Tauri 窗口创建前读取 HWND，导致 Windows Release 启动即以 `0xc0000409` 退出的问题。

### 变更

- 将全局圆角收敛为 `6/8/12/16/20px` 五档语义令牌，统一桌面、移动端、搜索、歌词、播放器和弹窗布局，并增加自动规范检查。
- 拆分全局 CSS，补充结构化 UI 设计与开发规范。
- 新增音乐服务 Provider 契约和网易云适配器，搜索、歌词、详情与播放源解析改用统一服务边界，为接入其他 API 服务预留能力。
- Tauri IPC 改为 provider-aware 请求，并收紧 API 主机白名单与生产 CSP。

### 内部

- 增加 Provider、适配器、架构边界和圆角规范测试；移除未直接使用的 Rust `tokio` 依赖。

## [1.4.0] - 2026-08-17

### 修复

- 修复生产版歌词页空白：`main.js` 布局 CSS 由变量路径动态 `import()` 改为静态导入。Vite 生产构建无法静态分析变量路径，`app-pc.css` 未被打包，`.ly-pc-player { display: contents }` 规则丢失导致左右栏垂直堆叠、歌词溢出视口
- 修复 Windows 本地打包失败（`os error 2`）：`tauri:build` 显式指定 `--target x86_64-pc-windows-gnu`（用户级 `.cargo/config.toml` 设置了 `build.target`，tauri CLI 默认去 `target/release/` 找不到 exe）；`bundle.targets` 改为 `["nsis"]` 跳过 MSI
- 修复移动端设置页「歌词背景模糊」「歌词文字模糊」关闭后开关仍显示"开"：`setBooleanSetting` 返回归一化字符串，而 `'false'` 是 truthy，移动端漏写 `=== 'true'`（PC 端已有，两份实现漂移）。需离开设置页再进入才显示正确
- 修复 PC 设置页 Cookie 检测的定时器在组件销毁后仍回写状态：改用与移动端一致的 `safeTimeout`
- 修复设置页版本号显示错误：PC 端写死 `1.3.0`、移动端写死 `0.1.0`（与真实版本差三个 minor），现均改为读 `package.json`

### 变更

- 界面主字体改为随包分发的 **HarmonyOS Sans SC**（Regular 400 / Medium 500 / Bold 700 三档）。此前字体栈里没有任何中文字体，89.6% 的中文界面文字全部落到栈末 `sans-serif` → 在中文 Windows 上被解析为微软雅黑（只有三档字重、hinting 为小字号优化、大字号发虚），是"廉价网页感"的主要来源
- 全局字重收敛到打包的 400/500/700 共 65 处：`600 → 500`（小字号 UI 文本，Medium 已足够醒目），`650~860 → 700`（标题类统一 Bold）。此前 `750/760/780/800/820/850` 六档在任何非可变字体上都会被舍入或合成假粗体。副作用是这几档间的细微层级消失，改由 font-size + color 承担
- 修复开屏到应用的字体跳变：`index.html` 的 body 字体栈原为 Apple 优先、`app.css` 为 Segoe 优先，两者从未对齐；现统一
- 大字号标题补齐光学字距收紧：14 处 `font-size >= 22px` 的标题此前 `letter-spacing: 0` 或未设置，字号越大越发散（`.home-listen-copy h1` 达 72px、`.music-discovery-header h1` 38px）。按项目既有梯度补负字距；`clamp()` 流体字号用 `em` 以便收紧量随字号缩放。歌词正文 `.ly-line-text` 的正字距是为长句可读性有意为之，白名单排除

- 设置页逻辑抽出为 `composables/useSettings.svelte.js`，PC 与移动端共用一份实现（两套模板保留，class 体系不同）。两边 `<script>` 从 174/177 行降至 10/11 行，消除了导致上述 bug 的重复
- 清理 `app.css` 中零引用的废弃样式：删除 187 条规则、7561 → 6229 行（-1332），构建产物 CSS 269.3 → 255.0 kB（gzip 43.2 → 40.9 kB）。主要是已废弃的 `home-taste-*` / `explore-card-*` / `ly-menu-*` / `ly-picker-*` / `mobile-mini-*` 等模块残留

### 内部

- `bootstrap.test.js` 改为守「布局 CSS 必须静态导入」，替换掉引用已删除的 `loadLayoutCss` 而失效的断言
- 新增 `settings-boolean.test.js`：锁定布尔设置项取值契约（`setBooleanSetting` 返回字符串，必须 `=== 'true'` 收敛）
- 新增 `scripts/find-dead-css.mjs` + `scripts/prune-dead-css.mjs`：扫描并删除无引用的 CSS 规则，配 `prune-dead-css.test.mjs` 自检（空死名单必须恒等）
- `run-tests.mjs` 现在也收集 `scripts/*.test.mjs`，此前构建工具的自检不会被执行
- 新增 `type-scale.test.js`：守住「大字号标题必须收紧字距」+「流体字号用 em 收紧」，防止回归
- 新增 `font-weight.test.js`：守住「字重只能是打包的 400/500/700」+「@font-face 与字体栈正确接入」+「index.html 与 app.css 字体栈一致」
- 新增 `scripts/converge-font-weight.mjs`（字重收敛，覆盖三个 CSS + 组件 `<style>`）与 `scripts/verify-font-integrity.ps1`（校验随包 ttf 与原始 zip 逐字节一致，满足许可证禁止修改的要求）
- 「关于」页新增字体声明区块（HarmonyOS Sans 许可证要求在软件内显著声明，勿删）
- 新增 `version-display.test.js`：守住「版本号必须读 package.json，模板里不得硬编码」

## [1.3.0] - 2026-07-22

### 新增

- 全局 Toast 通知系统：操作反馈、错误分类提示（网络/登录/超时/VIP）
- 键盘快捷键帮助面板：按 `?` 显示所有快捷键
- 播放队列"下一首播放"：将歌曲插入到当前播放之后
- 播放队列拖拽排序：HTML5 拖拽调整播放顺序
- 页面切换过渡动画：fade 150ms 平滑过渡

### 修复

- 修复 `_handleEnded` 定时器泄漏：destroy 后自动切歌导致状态冻结
- 修复 `restore()` 无 fallback：恢复会话时后台填充更多 URL
- 修复 `PlayerBar` 歌词 effect 竞态：快速切歌时歌词不加载
- 修复 `checkLoginStatus` 竞态：100ms 内重新登录被误清
- 修复 `MobileApp` $effect 状态循环依赖
- 修复 `PlaybackControls` 嵌套 $effect 重复注册
- 修复 `SongListActions` onBindRow 反复触发重渲染
- 修复移动端 UI 布局 15 项问题（头像定位、歌词溢出、空状态等）
- 删除 ~561 行死代码（旧移动端歌词页样式）

### 可访问性

- 全屏歌词页 focus-trap：焦点锁定在弹窗内
- 歌词区域 `aria-live="polite"`
- "跳到主要内容" skip-link

## [1.2.0] - 2026-07-21

### 修复

- 修复 Android CI patch 脚本 no-op 误判导致 APK 构建失败

## [1.1.0] - 2026-07-10

### 新增

- 桌面端单实例运行：再次启动时聚焦已有窗口，避免多开
- 桌面端窗口状态记忆：记住窗口大小与位置
- PC 全局键盘快捷键：播放/暂停、上一首/下一首、音量增减、静音、快进/快退
- 移动端启动前同步标记 `mobile-runtime`，消除样式闪烁（FOUC）

### 优化

- 重构响应式布局：按视口宽度判定 PC/移动，切换时联动侧栏收展
- 增强错误处理与 PC/移动端设置页、消息页交互

## [1.0.0] - 2026-07-10

### 新增

- 首个正式版本：网易云音乐第三方桌面/移动客户端
- 支持 Windows（NSIS）、Linux（deb·rpm）、Android（apk）与 Web 平台
- 登录、浏览与发现、播放、体验等核心功能
