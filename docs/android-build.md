# Android APK 云端构建

通过 `.github/workflows/android.yml` 在 GitHub Actions 生成测试 APK。本机不需要安装 Java、Android Studio、SDK 或 NDK，也不需要运行前端构建或 APK 打包。

## 触发与下载

1. 将本次 Android 支持和需要打包的 UI 改动提交到仓库并推送。Actions 只使用远端所选分支的源码，不包含本地未提交的修改。
2. 让默认分支包含 `android.yml`，GitHub 才会提供手动运行入口。之后可以在运行时选择要打包的分支。
3. 打开仓库的 **Actions → Android APK → Run workflow**，选择分支并运行。
4. 成功后，在该运行页面的 **Artifacts** 下载 `zheting-android-arm64-debug-…`。
5. 解压 ZIP，将其中的 `.apk` 传到手机并安装。安装 APK 时按 Android 提示允许对应应用安装未知来源应用。

当前构建 ARM64 测试 APK，适用于支持 arm64-v8a 的 Android 设备。默认 Tauri Android 模板的最低系统要求为 Android 7.0（API 24）。不构建 Play 商店使用的 AAB，也不自动发布 GitHub Release。

## 构建内容

- Node 22、pnpm 10.28.1、Rust 1.88.0，匹配现有桌面工作流。
- Java 17、Android API 36、Build Tools 36.0.0、NDK 27.2.12479018。
- `pnpm install --frozen-lockfile` 后运行版本、类型和单元测试检查。
- 在云端执行 `tauri android init`，生成 `src-tauri/gen/android`；该目录已有忽略规则，不提交生成文件。
- 复用 `src-tauri/icons/icon.png` 生成 Android 图标。
- 执行 `pnpm tauri android build --ci --debug --apk --target aarch64`；`beforeBuildCommand` 自动在云端构建前端。
- 校验 APK 签名，输出 SHA-256，上传 APK，保留 14 天。

初始化和打包使用同一份内联配置：产品名 `哲听测试版`，包名 `com.zheting.music.androidtest`。测试数据与后续正式包 `com.zheting.music` 分开，不修改现有桌面产品标识。

## 签名与更新

首轮使用 Android debug 签名，不需要配置仓库 Secrets。工作流缓存 `~/.android/debug.keystore`，在缓存仍存在时复用同一测试证书。构建全仓库串行执行，避免首次并发构建生成不同证书。

缓存不是签名密钥的永久备份。缓存被清理后，新的测试 APK 可能不能直接覆盖旧版本。此时不要直接卸载有重要本地数据的测试包；先备份数据或恢复原测试证书，再决定如何更新。

正式 APK 应使用独立、持久保存的 release keystore，并通过 GitHub Secrets 在构建时注入。不要将密钥、密码或 `keystore.properties` 提交到仓库。正式签名、AAB 和自动发版另行接入。

## 本轮能力边界

Android 分支已接入本地 `tauri-plugin-zt-player`：Svelte UI 通过 MediaController 控制 MediaSessionService，Service 持有唯一的 ExoPlayer。桌面与普通浏览器保留 HTML Audio 播放链路。Android 不会被识别为 Linux 桌面，不显示桌面标题栏，也不调用 Linux MPRIS。

Media3 / ExoPlayer、原生媒体会话、音频焦点、耳机拔出暂停、原生悬浮歌词和原生听歌记录已有源码实现，尚需远程编译及真机验收。厂商增强默认关闭。详细边界与验收步骤见 [Android 原生播放](android-native.md)。

## 验证

本地可运行 `pnpm check`、`pnpm test`。工作流配置及 Android 平台边界检查为 `node scripts/android-build.test.mjs`。

完整 Rust Android 编译、Gradle 打包及 APK 签名验证只能由本工作流确认。第一次运行成功后，还需在手机检查启动、登录、API 请求、前台播放、歌词、队列、软键盘、安全区和返回操作。构建成功不能替代后台播放的真机验收。

参考：[Tauri Android CLI](https://v2.tauri.app/reference/cli/)、[Android 环境要求](https://v2.tauri.app/start/prerequisites/#android)、[Android 签名](https://v2.tauri.app/distribute/sign/android/)。
