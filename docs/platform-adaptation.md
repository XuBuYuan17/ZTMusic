# ZTmusic 平台适配现状

本文对齐当前 Tauri 2 桌面端与 Web 构建状态。桌面端提供 Windows / Linux 安装包，Web 端提供 Vite 静态产物。

---

## 一、各平台现状

### Windows

| 项 | 状态 |
|---|---|
| SMTC（系统媒体传输控制） | ✅ `src-tauri/src/windows_smtc.rs` + `windows` crate |
| NSIS 安装包（简体中文 + installer hooks） | ✅ `tauri.conf.json` 的 `bundle.windows.nsis` |
| WebView2 安装模式 | 未显式配置，使用当前 Tauri 配置 schema 的 `downloadBootstrapper` 默认值 |

### Linux

| 项 | 状态 |
|---|---|
| MPRIS 媒体控制 | ✅ `src-tauri/src/linux_mpris.rs` + `mpris-server` crate |
| `.deb` / `.rpm` 打包 | GitHub 正式构建；本地不打包 |

### Web

- 本地使用 `pnpm dev`，默认 API 走 `/ncm-api` 代理。
- `pnpm build` 生成的静态产物本身不提供代理，公开部署需另外确认后端 CORS 或代理配置。
- 手机浏览器使用响应式移动布局和共享页面；不提供 Android 安装包。

### 开发与稳定渠道

`dev` 推送和指向 `dev/main` 的 PR 自动构建 Windows UI 调试包；Linux 开发包按需手动构建。`main` 验证 Windows/Linux 正式包，正式标签构建完成后发布 Release。

开发版使用“哲听 Dev”、`com.zheting.music.dev` 和 `zheting-dev`，安装与数据独立，启用 DevTools、日志和前端源码映射。稳定版保留原应用身份并关闭 DevTools。下载与验证流程见 [开发指南](development.md#分支与安装包)。

---

## 二、待办

| 优先级 | 项 | 说明 |
|---|---|---|
| P2 | tauri updater | 桌面端自动更新，需要签名密钥与更新服务器 |

版本号四处一致（`package.json` / `Cargo.toml` / `tauri.conf.json` / `Cargo.lock`）由 `pnpm check:versions` 校验，已并入 `pnpm verify`。

---

## 三、关键文件索引

| 文件 | 作用 |
|---|---|
| `src-tauri/src/windows_smtc.rs` | Windows 系统媒体控制 |
| `src-tauri/src/linux_mpris.rs` | Linux MPRIS |
| `src-tauri/Cargo.toml` | Rust 依赖 + 编译优化 |
| `src-tauri/tauri.conf.json` | Tauri 配置 + 版本号 |
| `src/lib/player/native-media.ts` | 前端 ↔ 桌面原生媒体控制桥接；Web 使用 Media Session |
| `.github/workflows/build.yml` | CI/CD 构建流程 |

---

## 四、链接汇总

| 资源 | 链接 |
|---|---|
| Tauri 2 官方文档 | https://v2.tauri.app/ |
| Tauri IPC 通信 | https://v2.tauri.app/concept/inter-process-communication/ |
| Tauri Updater | https://v2.tauri.app/distribute/updater/ |
| Tauri WebView2 分发 | https://v2.tauri.app/distribute/windows-installer/ |
