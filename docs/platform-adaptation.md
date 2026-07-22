# ZTmusic 多平台适配研究报告

> 基于 Tauri 2 官方文档（curl 抓取）+ GitHub 代码搜索 + 项目实际代码的整合分析

---

## 一、Tauri 2 Android 官方模板（基准对照）

从 `tauri-apps/tauri` 官方模板 `crates/tauri-cli/templates/mobile/android/` 抓取：

**官方 `AndroidManifest.xml` 默认只声明**：
```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- 无 FOREGROUND_SERVICE -->
<!-- 无 POST_NOTIFICATIONS -->
<!-- 无 Service 声明 -->
```

**结论**：Tauri 官方模板**不包含**媒体播放所需的任何 Android 组件。ZTmusic 的所有媒体相关代码（权限、Service、MediaSession）都是**自定义实现**，远超官方模板。

---

## 二、项目现状总结

ZTmusic 的 Android 适配**已经相当完整**，远超"玩具"级别。以下是已实现的：

### ✅ 已实现

| 模块 | 实现 | 文件 |
|---|---|---|
| **MediaSession** | 完整的 MediaSession + PlaybackState | `MediaSessionPlugin.kt:145-174` |
| **前台服务** | MediaSessionService + startForeground | `MediaSessionPlugin.kt:272-289` |
| **通知栏控制** | MediaStyle 通知 + 三按钮（上/播放暂停/下） | `MediaSessionPlugin.kt:327-351` |
| **封面加载** | 异步下载 + LRU 缓存 + 缩放（≤512px） | `MediaSessionPlugin.kt:377-412` |
| **通知渠道** | NotificationChannel (IMPORTANCE_LOW) | `MediaSessionPlugin.kt:363-375` |
| **权限处理** | POST_NOTIFICATIONS 运行时请求 | `MainActivity.kt:33-37` |
| **安全区域** | 手动 WindowInsets → padding | `MainActivity.kt:26-31` |
| **Edge-to-Edge** | enableEdgeToEdge + 透明系统栏 | `MainActivity.kt:18-20` |
| **媒体按钮** | BroadcastReceiver → pendingAction → Rust 轮询 | `MediaSessionPlugin.kt:75-88` |
| **Rust ↔ Kotlin 桥** | Tauri Plugin + `@Command` + `trigger` | `MediaSessionPlugin.kt:106-172` |
| **版本号** | package.json / Cargo.toml / tauri.conf.json | 三处 |
| **CI/CD** | GitHub Actions + matrix + signing | `build.yml:131-391` |
| **编译优化** | lto="thin" + strip + opt-level="s" | `Cargo.toml:42-47` |

### ⚠️ 可改进（按优先级）

| # | 改进 | 影响 | 难度 |
|---|---|---|---|
| 1 | **16KB 页面对齐**（Android 15+ 强制） | 高：2025 年 11 月后 Google Play 要求 | 低 |
| 2 | **音频焦点**（AudioFocusRequest） | 高：其他 App 播放时不会自动暂停 | 中 |
| 3 | **耳机拔出暂停** | 中：基础体验 | 低 |
| 4 | **版本号同步** | 低：Cargo.toml/tauri.conf.json 仍 1.2.0 | 低 |
| 5 | **CI/CD 优化**（tauri-action / rust-cache） | 低：加速构建 | 低 |

---

## 二、深度对比：研究 vs 实际

### 2.1 Android 原生代码

**研究建议**：用 Media3 / ExoPlayer + MediaSessionService  
**项目实际**：用原生 MediaSession + NotificationCompat + 前台 Service

**评价**：项目方案更轻量（不引入 ExoPlayer 依赖），且与 Tauri 的 WebView 音频播放架构兼容。Media3 更适合"独立播放器"，但 ZTmusic 的音频走 WebView `<audio>` 元素，原生侧只做通知栏控制——当前方案是正确的。

### 2.2 音频焦点

**项目现状**：未实现  
**修复方案**：在 `MediaSessionPlugin.kt` 中添加 AudioFocusRequest：

```kotlin
// 在 initMediaSession() 中添加
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
            .build())
        .setOnAudioFocusChangeListener { focusChange ->
            when (focusChange) {
                AudioManager.AUDIOFOCUS_LOSS -> pendingAction = "pause"
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pendingAction = "pause"
                AudioManager.AUDIOFOCUS_GAIN -> pendingAction = "play"
            }
        }
        .build()
    val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioManager.requestAudioFocus(focusRequest)
}
```

### 2.3 16KB 页面对齐（Android 15+）

**项目现状**：未配置  
**修复方案**：在 `src-tauri/.cargo/config.toml` 中添加：

```toml
[target.aarch64-linux-android]
rustflags = ["-C", "link-arg=-Wl,-z,max-page-size=16384"]

[target.armv7-linux-androideabi]
rustflags = ["-C", "link-arg=-Wl,-z,max-page-size=16384"]

[target.x86_64-linux-android]
rustflags = ["-C", "link-arg=-Wl,-z,max-page-size=16384"]
```

### 2.4 版本号同步

**问题**：`package.json` 是 `1.3.0`，但 `Cargo.toml` 和 `tauri.conf.json` 仍是 `1.2.0`  
**修复**：三处版本号必须一致

### 2.5 CI/CD

**项目现状**：手动编写 Android SDK 安装 + Python patch 脚本  
**研究建议**：用 `tauri-apps/tauri-action`

**评价**：项目当前的 Python patch 脚本是为了修复 Tauri 生成的 `build.gradle.kts` 中的兼容性问题（compileSdk、minSdk、依赖注入）。这是合理的——`tauri-action` 不支持这种细粒度定制。保留当前方案。

---

## 三、各平台适配细节

### 3.1 Android

#### 构建产物
- 当前：仅 arm64-v8a（`build.yml:140`）
- 建议：增加 x86_64（模拟器）+ armv7-v7a（旧设备）

#### 签名
- 当前：通过 `keystore.properties` + GitHub Secrets（`build.yml:147-166`）
- 已实现：base64 解码 + 动态写入 keystore.properties

#### 前台服务类型
- 当前：未显式声明 `foregroundServiceType`
- 修复：`MediaSessionService` 应在 `AndroidManifest.xml` 中声明 `android:foregroundServiceType="mediaPlayback"`

#### 通知刷新策略
- 当前：`shouldRefreshPlaybackNotification` 仅在元数据/播放状态变化时更新
- 优化：进度条每 1-2 秒更新一次（Android 13+ 会显示进度条）

### 3.2 Windows

#### WebView2
- 当前：未配置 `webviewInstallMode`
- 建议：`"type": "downloadBootstrapper"`（现代 Windows 已内置 WebView2）

#### SMTC（系统媒体传输控制）
- 已实现：`src-tauri/src/windows_smtc.rs` + `windows` crate（`Cargo.toml:40`）

### 3.3 Linux

#### MPRIS
- 已实现：`mpris-server` crate（`Cargo.toml:36`）

### 3.4 Web

- 当前：Vite 纯前端构建
- 建议：用 Cloudflare Pages / GitHub Pages 单独部署

---

## 四、推荐改进清单（按优先级）

### P0（必须做）

1. **16KB 页面对齐**：`.cargo/config.toml` 添加 rustflags
2. **版本号同步**：Cargo.toml + tauri.conf.json → 1.3.0
3. **音频焦点**：MediaSessionPlugin 添加 AudioFocusRequest

### P1（应该做）

4. **耳机拔出暂停**：注册 `ACTION_AUDIO_BECOMING_NOISY` BroadcastReceiver
5. **foregroundServiceType**：AndroidManifest 声明 mediaPlayback
6. **进度条更新**：Android 13+ 通知栏进度条定时更新

### P2（可以做）

7. **多 ABI 构建**：增加 x86_64 + armeabi-v7a
8. **tauri updater**：桌面端自动更新（Android 不走此机制）
9. **WebView2 配置**：downloadBootstrapper 模式

---

## 五、关键文件索引

| 文件 | 作用 |
|---|---|
| `src-tauri/android-src/MainActivity.kt` | Android 入口 Activity |
| `src-tauri/android-src/MediaSessionPlugin.kt` | MediaSession + 通知 + 封面 |
| `src-tauri/Cargo.toml` | Rust 依赖 + 编译优化 |
| `src-tauri/tauri.conf.json` | Tauri 配置 + 版本号 |
| `src/lib/player/native-media.js` | 前端 ↔ 原生桥接 |
| `.github/workflows/build.yml` | CI/CD 构建流程 |

---

## 六、链接汇总

| 资源 | 链接 |
|---|---|
| Tauri 2 官方文档 | https://v2.tauri.app/ |
| Tauri Android 入门 | https://v2.tauri.app/start/prerequisites/ |
| Tauri 移动插件开发 | https://v2.tauri.app/develop/plugins/develop-mobile/ |
| Tauri IPC 通信 | https://v2.tauri.app/concept/inter-process-communication/ |
| Android Media3 | https://developer.android.com/media/media3 |
| Android 16KB 对齐 | https://developer.android.com/guide/practices/page-sizes |
| Android AudioFocus | https://developer.android.com/media/audio/audio-focus |
| tauri-action | https://github.com/tauri-apps/tauri-action |
| Tauri Updater | https://v2.tauri.app/distribute/updater/ |
