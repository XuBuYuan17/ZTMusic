# Android 系统启动与首帧

使用单个 MainActivity + AndroidX 官方 SplashScreen（Android 12+ 使用平台实现，旧版本使用兼容实现）。不新增 SplashActivity、不修改系统窗口进入动画。桌面人物插画保留在 Adaptive Icon 前景安全区，背景使用 #c74639；Splash 引用同一个 adaptive 图标。

Tauri 生成的 Android 项目位于被忽略的 src-tauri/gen/android。每次初始化、生成图标后执行：

```sh
node scripts/configure-android-startup.mjs
```

这会应用 src-tauri/android 中的 Activity 和资源，并添加 AndroidX core-splashscreen。正式与测试包均从生成的 namespace 得到 Kotlin 包名。打包工作流已接入该步骤，生成目录不进入版本控制。

## 交接

竖屏移动首页与横屏/桌面外壳 onMount 只报告本地壳层与 placeholder 已提交。MainActivity 先允许原生窗口绘制，保留系统 Splash 覆盖层；再使用 WebView.postVisualStateCallback 等待这些像素可以绘制，随后释放覆盖层；不等待用户信息、API、图片、缓存查询或动画播放。启动错误面板也会报告可绘制，不会被 Splash 遮住。没有人为最短展示时间。Media3 连接在该交接后才发起，Android 不同步解析网页副本队列；正在播放的后台原生服务不受影响。

退出时在原系统 Splash 图标上缩小到 0.92，整体 200ms 淡出；同时首页内容以 280ms、12 CSS px 位移淡入，Material FastOutSlowIn 曲线。壁纸在 140ms 后以 500ms 淡入。浏览器与桌面不启用这些启动动画；减少动画设置跳过网页动画，系统关闭动画时直接移除 Splash。

移动端 Splash、Window、WebView、HTML 和首页共用底色：深色 #111113，浅色 #ffffff。Android 新安装的初始主题跟随系统；已有用户保留本地选择。API 31+ 使用 UiModeManager.setApplicationNightMode 保存应用主题，使下一次系统启动窗口遵循应用偏好。旧安装第一次升级时系统还未保存应用主题，最初启动窗口可能短暂遵循系统；首页出现后同步，后续冷启动应一致。

## 验收

自动检查覆盖生成步骤重复运行、Android 门控、只报告一次首帧、减少动画和并行淡入。模拟器覆盖 API 31 / 33 / 34 / 35 / 36：断网冷启动、明暗系统主题、与系统相反的应用保存主题冷启动、首帧与背景颜色。模拟器指标记录 WebView 壳层提交和实际系统 Splash 退出，不代替物理手机的桌面转场或启动速度测量。

HyperOS 真机必须从桌面点图标，测试冷启动、后台已有实例返回、深浅主题、系统关闭动画、断网、壁纸开启以及首次升级。录屏检查桌面放大保留、人物图标中心不跳、无黑/灰/白插帧、首页先于在线内容出现。至少同时在一台普通 Android 手机上确认。厂商桌面动画由系统控制，应用不能保证不同 HyperOS 版本完全相同。

正式交付记录应区分：源码/打包通过、模拟器通过、HyperOS 真机通过；未执行的设备检查标记待测。
