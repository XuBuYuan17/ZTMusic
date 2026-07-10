<p align="center">
  <img src="./src-tauri/icons/icon.png" alt="ZTmusic Logo" width="112" />
</p>

<h1 align="center">ZTmusic (哲听)</h1>

<p align="center">
  <em>一个简洁、安静的网易云音乐第三方桌面客户端。</em>
</p>

<p align="center">
  <a href="https://github.com/xubuyuan18/ZTmusic/releases"><img src="https://img.shields.io/github/v/release/xubuyuan18/ZTmusic?color=24C8DB&label=release" alt="Release" /></a>
  <a href="https://github.com/xubuyuan18/ZTmusic/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://svelte.dev/"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte" alt="Svelte" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri" alt="Tauri" /></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能">功能</a> ·
  <a href="#支持平台">支持平台</a> ·
  <a href="#技术栈">技术栈</a> ·
  <a href="#相关文档">文档</a>
</p>

---

## 简介

**哲听（ZTmusic）** 是一个跨平台的网易云音乐第三方客户端，界面简洁安静，专注听歌本身。基于 Svelte 5 与 Tauri 2 构建，桌面端体积小、启动快，同时支持 Android。

> ⚠️ 本项目仅供个人学习与技术交流使用，音乐数据来自第三方 API，版权归网易云音乐及各版权方所有。请勿用于商业用途。

---

## 支持平台

| 平台 | 格式 | 状态 |
|---|---|---|
| Windows | `.exe`（NSIS 安装包） | ✅ |
| Linux | `.deb` / `.rpm` | ✅ |
| Android | `.apk` | ✅ |
| Web | 浏览器直接访问 | ✅ |

> macOS / iOS 未提供预构建包，可自行用 `pnpm tauri:build` 编译。

---

## 功能

**登录**
- 二维码扫码、手机号、邮箱多种登录方式
- 登录态持久化，重启免登录

**浏览与发现**
- 发现页、歌单详情、歌手主页
- 资料库、最近播放、历史每日推荐

**播放**
- 全屏歌词页、播放队列管理
- 多音质选择，VIP/试听智能回退
- 下一首音频预加载，零延迟切歌
- IndexedDB 持久缓存，二次加载更快
- 桌面端系统媒体控制（SMTC / MPRIS）

**体验**
- 深色 / 浅色主题
- 中文 / 英文界面
- 桌面端窗口状态记忆、单实例运行
- 移动端专属交互与视觉

---

## 快速开始

```bash
pnpm install
pnpm dev              # 浏览器开发
pnpm tauri:dev        # 桌面端开发
pnpm build            # 前端构建
pnpm tauri:build      # 构建当前平台安装包
```

默认 API 为 `https://music.xubuyuan.top`，浏览器开发时由 Vite 代理转发以规避跨域。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Svelte 5 + Vite 8 |
| 桌面端 / 移动端 | Tauri 2 + Rust |
| 音频 | HTML5 Audio（双缓冲预加载） |
| 本地存储 | IndexedDB / SQLocal |
| API | NeteaseCloudMusicApi Enhanced |

---

## 项目结构

```
zheting/
├── src/            前端源码（Svelte 5）
├── src-tauri/      Tauri / Rust 桌面端与移动端
├── docs/           开发文档
└── .github/        CI/CD 工作流
```

---

## 相关文档

详细的架构说明、开发约定与调试技巧 → [docs/development.md](./docs/development.md)

---

## 发版

由 GitHub Actions 自动构建三端安装包：

1. 运行 **Prepare Release** workflow，输入目标版本号；
2. 自动打 tag 并触发 **Build Installers**，产物发布到 Releases。

> Android 打包需在仓库 Secrets 中配置签名密钥。

---

## 许可证

基于 [MIT](./LICENSE) 许可证开源。
