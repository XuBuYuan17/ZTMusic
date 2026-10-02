# Android 原生播放接入与验收

本分支已有原生实现，尚未通过 Android 编译和真机验收。依赖只允许在远程 CI 下载，本地没有安装 Android SDK、NDK 或 Rust Android target。

## 播放所有权

`Svelte PlayerStore → AndroidEngine → Tauri 插件 → MediaController → PlaybackService`。Service 持有唯一 ExoPlayer 和 MediaSession，负责队列、在线 URL 解析、音频焦点及耳机拔出暂停。Activity 销毁只释放 Controller；UI 重建先读取 Service 状态，不用旧的前端会话覆盖后台播放。Android 不再创建 HTML Audio；桌面和普通浏览器沿用原引擎。

系统通知由 MediaSessionService 的标准媒体通知提供。锁屏、蓝牙及耳机控制使用标准媒体会话。外部 Controller 不获得私有命令或修改播放源的权限；通知控制保持 Media3 默认授权范围。后台继续播放的前提是系统允许前台媒体服务运行；强制停止应用、系统终止进程和重启后的自动恢复不在本轮实现范围内。

前端收到离散状态事件后按时间锚点显示进度，不逐帧调用 Native。Native 听歌记录每 5 秒保存到 SQLite，前端恢复可见后按游标导入累计记录，以相同 key 覆盖避免重复累计。单曲循环开启新记录。当前实现保存本机统计；网易云在线听歌上报尚未从原 Web 引擎迁移。

## 原生歌词与权限

LyricsOverlayService 绑定播放 Service，使用原生 TextView 与 WindowManager，自己读取播放器时间和解析 LRC，不依赖 WebView 常驻。支持拖动、锁定、穿透、透明度、字号、三种系统字体和双语。悬浮权限仅在用户点击设置入口时申请；撤销权限只关闭歌词层。在线歌词获取失败显示歌曲标题；本地歌词文件尚未迁移到 Native。

Manifest 声明 INTERNET、FOREGROUND_SERVICE、FOREGROUND_SERVICE_MEDIA_PLAYBACK 和 SYSTEM_ALERT_WINDOW。不申请忽略电池优化，不实现开机自启，也不使用常驻后台复活。Android-only capability 限定插件权限。

## 厂商兼容边界

Standard Android First / OEM Enhancement Second / Graceful Fallback Always。

| 系统 | 当前增强状态 | 标准行为 |
|---|---|---|
| 原生 Android、Pixel、其他 ROM | Fallback | Media3 媒体会话与系统媒体通知 |
| Xiaomi HyperOS | 默认关闭；官方接入须满足适用场景、授权和版本要求 | 同上 |
| OPPO / OnePlus | 默认关闭；未验证适用于本项目的官方音乐增强接口 | 同上 |
| vivo / Honor / Huawei | 默认关闭；未验证适用于本项目的官方音乐增强接口 | 同上 |

能力检测集中在 AndroidSystemAdapter。API level 达标只表示平台版本条件满足，不能证明 OEM 接口、授权或 Live Updates 场景可用。LiveActivityRouter 隔离增强的启动、更新与停止；SDK 缺失或权限异常禁用增强，不触碰 ExoPlayer 和标准媒体通知。本轮没有接入厂商 SDK、私有通知 extras 或伪造灵动岛。

## 已知限制

- 队列快照通过 Binder 返回全部简化元数据；输入最多 5000 项，序列化元数据最多 192 KiB，超限拒绝而不覆盖已有队列。尚未实现分页协议，仍须真机检查 MediaController 事务体积。
- 本地与 WebDAV 音频先复制到应用私有缓存，首次大文件加载需要等待；缓存没有容量清理策略。
- Native 统计日志尚无过期清理，后台进程被强制终止可能损失最后一个未保存的 5 秒间隔。
- UI 恢复后的统计导入、跨日分段、离线网络恢复、音质切换及长期后台播放需要真机专项验收。
- 当前不提供进程终止后自动续播，也没有 Android Auto 媒体浏览目录。

## 验证顺序

1. 本地运行 `pnpm check`、`pnpm verify`；`scripts/android-native.test.mjs` 检查源码边界，不能替代 Kotlin 编译或实际播放测试。
2. 在 GitHub Actions 构建 ARM64 APK，并运行插件 JVM 测试。不得在本地下载构建依赖。
3. 安装到手机，播放在线歌单；关闭屏幕、切换应用、划走 Activity，确认服务、通知和下一首仍工作。
4. 使用锁屏、通知及蓝牙按键暂停/续播/切歌，拔出耳机，插入来电或其他音频焦点请求，确认暂停和恢复策略。
5. 重新打开 UI，确认歌名、进度、队列及统计与 Service 一致，暂停不累计时长；循环、跨日、重开 UI 不重复统计。
6. 开启原生歌词并切换应用；检查拖动、锁定、穿透、字体和双语。播放过程中撤销悬浮权限，确认音乐和标准通知正常。
7. 在未启用任何厂商增强的不同 ROM 上重复上述步骤；OEM 不支持时标准播放器仍须完整工作。

参考：[MediaSessionService 后台播放](https://developer.android.com/media/media3/session/background-playback)、[MediaSession Controller 授权](https://developer.android.com/reference/androidx/media3/session/MediaSession.ConnectionResult)、[Tauri 移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/)。
