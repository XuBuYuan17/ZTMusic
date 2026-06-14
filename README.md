<p align="center">
  <img src="./src-tauri/icons/icon.png" alt="ZTmusic Logo" width="112" />
</p>

<h1 align="center">ZTmusic (哲听)</h1>

<p align="center">
  <em>一个简洁、安静的网易云音乐第三方桌面客户端。</em>
</p>

<p align="center">
  <a href="https://github.com/xubuyuan18/ZTmusic/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://svelte.dev/"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte" alt="Svelte" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri" alt="Tauri" /></a>
</p>

---

## 快速开始

```bash
pnpm install
pnpm dev              # 浏览器开发
pnpm tauri:dev        # 桌面端开发
pnpm build            # 前端构建
pnpm tauri:build      # 构建安装包
```

默认 API `https://music.xubuyuan.top`，浏览器由 Vite 代理转发。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Svelte 5 + Vite 8 |
| 桌面端 | Tauri 2 + Rust |
| 音频 | HTML5 Audio（双缓冲预加载） |
| API | NeteaseCloudMusicApi Enhanced |

---

## 功能

- 二维码 / 手机号 / 邮箱登录
- 发现页、歌单、歌手详情
- 资料库、最近播放、历史日推
- 全屏歌词页、播放队列
- 音质选择、IndexedDB 持久缓存
- 下一首音频预加载（零延迟切歌）
- 深色/浅色主题、中英文

---

## 相关文档

详细开发参考 → [docs/development.md](./docs/development.md)

---

## 发版

GitHub Actions 自动构建。运行 Prepare Release workflow 输入版本号即可。Android 需在 Secrets 中配置签名密钥。

---

## 许可证

MIT
