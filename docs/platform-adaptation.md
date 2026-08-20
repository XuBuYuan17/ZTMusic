# ZTmusic 平台适配现状

本文对齐当前 Tauri 2 多平台构建状态。桌面端以 Windows / Linux 安装包为主，Android 先恢复 CI 产出 debug APK。

---

## 一、各平台现状

### Windows

| 项 | 状态 |
|---|---|
| SMTC（系统媒体传输控制） | ✅ `src-tauri/src/windows_smtc.rs` + `windows` crate |
| NSIS 安装包（简体中文 + installer hooks） | ✅ `tauri.conf.json` 的 `bundle.windows.nsis` |
| WebView2 安装模式 | ⚠️ 未配置 `webviewInstallMode`，建议 `downloadBootstrapper`（现代 Windows 已内置 WebView2） |

### Linux

| 项 | 状态 |
|---|---|
| MPRIS 媒体控制 | ✅ `src-tauri/src/linux_mpris.rs` + `mpris-server` crate |
| `.deb` / `.rpm` 打包 | ✅ `pnpm tauri:build:linux` |

### Android

| 项 | 状态 |
|---|---|
| debug APK 打包 | ✅ `pnpm tauri:build:android`，仅 arm64-v8a |
| CI 依赖 | ✅ Java 17 + Android SDK / Build Tools / NDK + `aarch64-linux-android` |
| Android 工程 | ⚠️ CI 会在 `src-tauri/gen/android` 不存在时执行 `tauri android init` |
| release 签名 / AAB | ⏳ 未配置，需要 keystore secrets |

### Web

- Vite 纯前端构建（`pnpm build` → `dist/`），API 走 `/ncm-api` 代理
- 未部署；如需公网访问，建议 Cloudflare Pages / GitHub Pages 单独部署
- 手机浏览器访问走移动端布局（`pages/mobile/`），与 Android APK 共用前端适配逻辑

---

## 二、待办

| 优先级 | 项 | 说明 |
|---|---|---|
| P1 | WebView2 `downloadBootstrapper` | 减小安装包体积，缺 WebView2 的旧机器自动下载 |
| P1 | Android release 签名 | 配置 keystore secrets 后再产出正式 release APK / AAB |
| P2 | tauri updater | 桌面端自动更新，需要签名密钥与更新服务器 |

版本号三处一致（`package.json` / `Cargo.toml` / `tauri.conf.json`）由 `pnpm check:versions` 校验，已并入 `pnpm verify`。

---

## 三、关键文件索引

| 文件 | 作用 |
|---|---|
| `src-tauri/src/windows_smtc.rs` | Windows 系统媒体控制 |
| `src-tauri/src/linux_mpris.rs` | Linux MPRIS |
| `src-tauri/Cargo.toml` | Rust 依赖 + 编译优化 |
| `src-tauri/tauri.conf.json` | Tauri 配置 + 版本号 |
| `src/lib/player/native-media.js` | 前端 ↔ 原生桥接；Android 使用 Web Media Session |
| `.github/workflows/build.yml` | CI/CD 构建流程 |

---

## 四、链接汇总

| 资源 | 链接 |
|---|---|
| Tauri 2 官方文档 | https://v2.tauri.app/ |
| Tauri Android 前置依赖 | https://v2.tauri.app/start/prerequisites/#android |
| Tauri Android / Google Play 构建 | https://v2.tauri.app/distribute/google-play/ |
| Tauri IPC 通信 | https://v2.tauri.app/concept/inter-process-communication/ |
| Tauri Updater | https://v2.tauri.app/distribute/updater/ |
| Tauri WebView2 分发 | https://v2.tauri.app/distribute/windows-installer/ |
