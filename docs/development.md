# 开发参考文档

## API 请求链路

所有网易云接口从 `src/lib/api/client.js` 的 `ncm` 对象发出。

- **浏览器开发** — 走 `/ncm-api` → Vite proxy → `https://music.xubuyuan.top`
- **Tauri 桌面** — `invoke('ncm_request')` → `src-tauri/src/lib.rs` → reqwest

默认请求带 `randomCNIP=true`，cookie 保存在 `api_cookie`。GET 缓存配置见 `CACHE_TTL`。

---

## 登录链路

`src/lib/stores/auth.svelte.js` 支持手机号/邮箱/二维码登录。成功调用 `ncm.setCookie(cookie)`。

cookie 过期自动检测：`fetchSongUrl` 发现已登录但无 URL 或试听片段 → `auth.checkLoginStatus()` → 无效则清除登录态弹出登录窗。

---

## 播放链路

`src/lib/stores/player.svelte.js` + `src/lib/player/engine.js`

### 音质与 fallback 链

```
Phase 1（3.5s 超时）: [standard, higher, 用户偏好] → 首条可用 URL 即播放
Phase 2（5s 超时）:
  1. 用户偏好音质（仅严格更好时升级）
  2. 上述 + unblock
  3. music.163.com 外链
  4. /song/url 老版 API
  5. /song/url/match (UnblockNeteaseMusic)
```

### 预加载

`engine.js` 双 Audio 元素：`preload(url)` 隐藏加载，`swapToPreloaded()` 零延迟切换。
`prefetchNextTrackUrl()` 自动触发，预取 URL 同时写入 IndexedDB。

---

## 调试

```js
localStorage.setItem('debug_playback', 'true')
```

Console 输出 `[play-url:result]` / `[playback:xxx]` 日志。

播放失败排查：
1. 确认 `index.html` 保留 `<meta name="referrer" content="no-referrer">`
2. 检查音频 URL 是否为 HTTPS（`normalizePlayUrl()` 自动转换）
3. Network 面板确认无 403/404
4. 检查 `api_cookie` 是否有权限

---

## 页面与布局

- **桌面端**：`Sidebar + MainArea + PlayerBar / QueuePanel / LyricsPage / SearchOverlay`
- **手机端**：`main.js` 通过 `mobile-runtime` class 触发。结构 `MobileTopBar → content-scroll → MobileMiniPlayer → MobileTabs`。CSS 变量 `--mobile-topbar-h` / `--mobile-tabs-h` / `--mobile-mini-player-h` 控制间距。
- **首页**：桌面 `HomePage.svelte`，移动 `MobileHomePage.svelte`。

---

## 常用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | Vite 开发 |
| `pnpm build` | 前端构建 |
| `pnpm tauri:dev` | Tauri 桌面开发 |
| `pnpm tauri:build` | 桌面安装包 |
| `pnpm tauri android build --apk --target aarch64` | Android APK |

---

## 项目结构

```
src/
├── App.svelte        # 路由布局
├── app.css           # 全局样式
└── lib/
    ├── api/          # API 封装
    ├── components/   # 通用组件
    ├── pages/        # 页面
    ├── player/       # 音频引擎
    ├── services/     # 数据加载
    ├── stores/       # 状态管理
    └── utils/        # 工具函数
```

---

## 构建与发版

### Android 签名

```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 -w 0 upload-keystore.jks
```

GitHub Secrets：`ANDROID_KEY_BASE64`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`、`ANDROID_STORE_PASSWORD`

### 自动发版

1. 运行 **Prepare Release** workflow，输入版本号
2. 自动更新版本文件 → 打 tag → 触发 **Build & Release**
3. 构建 `.deb` / `.rpm` / `.msi` / `.apk` 并发布 Release
