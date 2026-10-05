# Android 启动链路

ZTMusic 的 Android 启动目标是：**尽快显示真实应用界面，不使用品牌开屏动画，不人为延长启动时间。**

## 当前策略

Android 仍会显示系统要求的静态启动面（AndroidX SplashScreen / Android 12+ system splash）。这不是应用内的品牌动画，而是系统在 Activity 创建到 WebView 首个可用壳层之间提供的启动背景。

启动流程：

1. `MainActivity` 调用 `installSplashScreen()`，只保留静态系统启动面。
2. `src/main.js` 同步从 `localStorage` / 系统深浅色偏好应用主题，不等待原生 IPC。
3. Svelte 和 `App.svelte` 立即并行加载并 mount。
4. 移动端 `MobileApp.svelte` 一挂载就调用 `announceAndroidFrame()`。
5. `startupReady` 通知 `MainActivity`，系统启动面立即移除，没有自定义缩放、淡出、封面飞行或内容 reveal。
6. `player.restore()` 与首屏渲染并行执行，不等待启动面退出。

## 明确禁止

启动链路不应重新引入以下行为：

- `StartupSplash.svelte` 或全屏品牌开屏组件；
- 最短展示时长 / 人工延时；
- 在 App mount 前等待 `startupTheme` 等原生 IPC；
- 将 WebView `alpha` 设为 0 后等待首帧再 reveal；
- 自定义系统 Splash 退出缩放、淡出或位移动画；
- 通过 `ztmusic:android-reveal` 阻塞播放器恢复或主界面交互。

`scripts/android-startup.test.mjs` 会守住这些边界。

## 主题与闪屏

`prepareAndroidStartup()` 只做同步本地主题预应用：

- 优先读取 `zheting-theme`；
- 没有保存值时使用 `prefers-color-scheme`；
- 不发起网络请求；
- 不等待原生命令。

原生窗口和 WebView 背景仍使用 `#ffffff` / `#111113`，避免系统启动面移除时出现白闪。

## 失败兜底

正常情况下系统启动面在移动壳 mount 后立即释放。如果 JS 未能完成壳层通知，`MainActivity` 有 3 秒故障兜底，仅用于避免异常情况下永久卡在系统启动面；它不是正常启动延时。
