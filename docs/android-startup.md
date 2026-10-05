# Android 系统启动与首帧

使用单个 MainActivity + AndroidX 官方 SplashScreen（Android 12+ 使用平台实现，旧版本使用兼容实现）。不新增 SplashActivity、不修改系统窗口进入动画。桌面人物插画保留在 Adaptive Icon 前景安全区，背景使用 #c74639；Splash 引用同一个 adaptive 图标。

Tauri 生成的 Android 项目位于被忽略的 src-tauri/gen/android。每次初始化、生成图标后执行：

```sh
node scripts/configure-android-startup.mjs
```

这会应用 src-tauri/android 中的 Activity 和资源，并添加 AndroidX core-splashscreen。正式与测试包均从生成的 namespace 得到 Kotlin 包名。打包工作流已接入该步骤，生成目录不进入版本控制。

## 交接

竖屏移动首页与横屏/桌面外壳 onMount 只报告本地壳层与 placeholder 已提交。MainActivity 先允许原生窗口绘制，保留系统 Splash 覆盖层，WebView alpha 保持 0；使用 WebView.postVisualStateCallback 确认首个可绘制 frame 后才开始交接。可动画时设置 320ms 的最低展示时间（只补足已耗时的差值，不等待网络，也不另加 320ms）。JS 安装页面动画后才将原 WebView alpha 设为 1，不制作缩放克隆。重载直接 reveal；错误面板也报告可绘制。

原系统 Splash 图标缩小到 0.97，整体 200ms 淡出，使用 FastOutSlowInInterpolator。退出开始 120ms 后，首页与骨架以 260ms、12 CSS px 位移淡入，曲线 cubic-bezier(.4,0,.2,1)，两段重叠 80ms。浏览器与桌面不启用这些动画；网页 reduced motion 会传给原生，系统关闭动画或 reduced motion 时两侧均直接切换。

## 手机品牌开屏与播放器交接

竖屏手机壳层挂载 `StartupSplash.svelte`，使用组件作用域 CSS 和 WAAPI 重建红紫背景、ZT 入场、红月唱片、装饰频谱与“少女祈祷中”。桌面和横屏布局不挂载。品牌开屏启用时，原有 Android 首页内容淡入让出控制权；系统 Splash 的首帧交接保持独立，不能等品牌动画结束才发送 `startupReady`。

壳层真实挂载、本地配置应用，以及 Android 原生 `ztmusic:android-state-restored` 元数据恢复共同决定退出。无会话的空状态也算 ready；在线推荐、数据库懒加载和音频缓冲不在等待条件中。Android 收到 `ztmusic:android-reveal` 后才开始约 2200ms 的可见最低展示时间，正常退出使用约 820ms morph。唱片测量 `MobileMiniPlayer` 的真实封面槽位，从中央圆形唱片收缩、移动到底栏的圆角封面。手机启动直接进入发现页，不自动展开歌曲播放页；点击或上滑底栏后才展开现有播放器。开屏本身不播放、不跳歌、不写音量，后台已有播放继续由原生状态决定。

空会话时底栏预置洛天依Official / ChiliChill乐团《下等马》（网易云歌曲 2709782550，专辑《闪耀》），手动展开播放器后初始进度为 0:00。`startup-track.ts` 提供经歌曲详情核对的元数据；仅在没有当前歌曲、当前曲目对象和播放队列时使用。默认曲目作为待选歌曲展示，不写入已有会话，也不创建 Android 播放服务；点击播放后通过现有 `player.playTrack` 正式入队。已有会话优先恢复，图片失败不阻塞开屏。

恢复未完成时，品牌开屏在约 6000ms 后退出到发现页，不显示“进入首页”按钮。退出动画另有 1400ms 完成兜底，旋转或后台中断会结束交接并还原目标封面。减少动画或原生关闭动画时保留静态视觉，满足时间和 ready 条件后直接交接。所有计时器、观察器和动画在卸载时清理，开屏不随后台返回重播。

App 挂载后即开始后台预取发现页数据，并与发现页共享五分钟、账号隔离的进行中请求与结果缓存。首批歌单详情复用 router 的两路并发预取，发现页显示时继续预取页面展示的歌单列表（每组最多十二张）并预载封面。登录后预取日推、心动、漫游和私人雷达，进入专属歌单复用相同数据；日推/漫游使用首首歌曲专辑封面，心动使用喜欢歌单封面，私人雷达使用真实歌单封面，失败时保留本地图。退出或换账号清除专属缓存与封面，旧账号的晚到响应不能写回。心动缓存记录当前歌曲种子，换歌后重建推荐，已运行的心动连续播放不被预取重置。后台请求不播放音频，也不加入开屏 ready 等待条件。

原生主题读取最多等待 1500ms，失败沿用本地/系统主题继续挂载。Activity 首帧交接另有 8000ms watchdog，释放系统覆盖层并显示已有文档；后续首帧仍可报告，JS 不会因早到的 reveal 漏掉会话恢复。模块加载失败继续显示入口的错误面板，不能把模块不可用伪装成首页成功。

浏览器验收脚本为 `scripts/browser/startup-splash.mjs`，指定现有 `PR9_PLAYWRIGHT_MODULE`，可用 `ZT_BROWSER_CHANNEL=msedge` 使用已安装的 Edge；不自动下载浏览器。默认连接开发服务，`ZT_SPLASH_URL` 可指向生产预览，截图与指标写入 `ZT_SPLASH_ARTIFACTS`。覆盖手机空会话、小屏浅色、减少动画、模拟原生会话/延迟/超时、图片损坏、跳过、旋转和桌面边界；IPC 模拟不代替 APK 和真机验收。

移动端 Splash、Window、WebView、HTML 和首页共用底色：深色 #111113，浅色 #ffffff。Android 新安装的初始主题跟随系统；已有用户保留本地选择。API 31+ 使用 UiModeManager.setApplicationNightMode 保存应用主题，使下一次系统启动窗口遵循应用偏好。旧安装第一次升级时系统还未保存应用主题，最初启动窗口可能短暂遵循系统；首页出现后同步，后续冷启动应一致。

## 验收

自动检查覆盖生成步骤重复运行、Android 门控、只报告一次首帧、减少动画和并行淡入。模拟器覆盖 API 31 / 33 / 34 / 35 / 36：断网冷启动、明暗系统主题、与系统相反的应用保存主题冷启动、首帧与背景颜色。模拟器指标记录 WebView 壳层提交和实际系统 Splash 退出，不代替物理手机的桌面转场或启动速度测量。

HyperOS 真机必须从桌面点图标，测试冷启动、后台已有实例返回、深浅主题、系统关闭动画、断网、壁纸开启以及首次升级。录屏检查桌面放大保留、人物图标中心不跳、无黑/灰/白插帧、首页先于在线内容出现。至少同时在一台普通 Android 手机上确认。厂商桌面动画由系统控制，应用不能保证不同 HyperOS 版本完全相同。

正式交付记录应区分：源码/打包通过、模拟器通过、HyperOS 真机通过；未执行的设备检查标记待测。

## 静默恢复与音量 HUD 诊断（Issue #10）

已确认的旧启动链路是 UI restore → AndroidEngine.connect → state → MediaController → PlaybackService.onCreate → ExoPlayer / AudioAttributes / MediaSession；这不是调用系统音量写入 API 的证据，也不能单靠源码确认 HyperOS HUD 来自哪一阶段。

API 35 的失败截图复现了应用自己的居中 100% PlayerHud：该提示存在于 WebView DOM，且播放服务没有创建。用户确认真机出现的也是这个居中方框。旧 PlayerHud 观察 volume/mode 的所有变化，依赖挂载后 1800ms 的时限抑制初次 1.0 同步；恢复晚于该时限就会误认为用户调音量。现以 setVolume/setMode 的明确操作请求触发提示，静默 hydration 不发送请求，不隐藏或延迟系统 HUD。

初始主题从 Activity 的 Configuration 读取后再挂载 App，避免 Android WebView 的 prefers-color-scheme 与系统启动窗口不一致。测试每个 fresh-theme 用例会重装应用，避免 pm clear 遗留平台 per-app night-mode override；保存主题用例保持数据不变。

`state` 在服务未运行时只读原生 NativePlaybackStore，`journal` 只读原生听歌数据库，不创建播放器。服务仍在运行时连接实时原生状态，保留后台播放的 authoritative source。服务将队列、索引、位置、模式和播放器音量存入 app-private checkpoint，在线解析配置另存且不返回 UI。进程被回收后 UI 以 paused 状态恢复原生队列，用户播放时再创建服务、加载队列并 prepare/play；不会以保存的 playing 标记自动播放。Media3 setAudioAttributes(..., true)、setHandleAudioBecomingNoisy(true)、MediaSession 和后台服务保持官方机制；不添加 AudioManager focus manager，不写系统音量。

debug APK 的 `ZTAudioStartup` 标签记录 connect、state/play/volume 命令、服务创建、ExoPlayer build、AudioAttributes、MediaSession build、playWhenReady reason、playback suppression reason 和播放器音量事件，不记录 cookie、URL 或歌曲内容。同步保存 `dumpsys audio` 检查真实 focus owner；suppression reason 不能代替所有系统 AudioFocus 日志。

HyperOS 分阶段复测：停止真实播放服务后，从 debug WebView inspector 控制台调用下列命令，每阶段间隔 3–5 秒，记录 HUD 是否出现；它们只在 debug build 且真实服务未运行时允许执行，不会改变正式播放队列。

```js
const probe = stage => window.__TAURI_INTERNALS__.invoke('plugin:zt-player|execute', {
  payload: { action: 'audioStartupProbe', data: { stage } }
})
await probe('player')      // 仅 ExoPlayer.Builder.build()
await probe('attributes')  // setAudioAttributes(..., true)，没有 prepare/play
await probe('session')     // MediaSession.build()
await probe('controller')  // controller connect + state read，没有播放
await probe('release')
```

分别保存 `adb logcat -d`、`adb shell dumpsys audio`、`adb shell dumpsys media_session` 和真机录屏。首次出现 HUD 的阶段及 focus owner 才能定位 OEM 触发点。模拟器成功不能证明 Xiaomi / HyperOS HUD 已修复。真机还需验证实际蓝牙/有线耳机断开；CI noisy 广播验证的是平台暂停路径。

startup CI 的 pidof 现在轮询 150ms、最长 15s，只有超时才判断进程未启动；失败独立保存 screenshot、logcat、activity、media_session 和 audio。API 31/33/34/35/36 覆盖 fresh install、force-stop、深浅/保存主题、离线、动画关闭，以及真实本地 PCM 播放、原生队列 paused 恢复、进程回收、锁屏媒体键和 noisy 暂停。
