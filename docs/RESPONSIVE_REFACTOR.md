# 响应式重构说明

## 架构变更

将原来混合在一起的移动端/PC端代码完全分离，避免样式冲突。

### 之前
- 单一 `LyricsPage.svelte` 组件
- 单一 `app.css` 文件，通过 `@media` 区分
- ❌ 问题：CSS 选择器重名、样式污染、布局冲突

### 现在
```
src/
├── lib/
│   ├── components/
│   │   ├── LyricsPageV2.svelte      (新版入口，路由分发)
│   │   ├── AppleMusicPlayer.svelte  (移动端独立播放器)
│   │   ├── PCPlayer.svelte          (PC端独立播放器)
│   │   ├── SongContextStrip.svelte  (歌曲相关内容条)
│   │   └── MobileApp.svelte         (移动端外壳)
│   ├── composables/
│   │   └── useLyrics.js             (歌词逻辑共享)
│   └── utils/
│       └── responsive.js            (响应式检测工具)
├── app.css                          (基础样式)
├── app-pc.css                       (PC端独立样式)
└── app-mobile.css                   (移动端独立样式)
```

## 核心改进

### 1. 组件分离
- **AppleMusicPlayer.svelte**: 只包含移动端逻辑，Apple Music 风格布局
- **PCPlayer.svelte**: 只包含PC端逻辑，两列布局
- **LyricsPageV2.svelte**: 根据设备类型自动选择组件
- **SongContextStrip.svelte**: 复用的相似歌曲/歌单/热评组件

### 2. CSS 隔离 (2026-07 二次架构修正)
变更：从宽度媒体查询**改为 runtime class 单一信源**

- **之前**:
  - `app.css`: 基础样式 + 依赖宽度媒体切布局
  - `app-pc.css`: 外层包 `@media (min-width: 761px)`
  - `app-mobile.css`: 外层包 `@media (max-width: 1024px)`
  - JS 动态 import 对应 CSS + `layoutMode` 算 isMobile → JS 和 CSS 两套判断规则，不匹配时规则失效，导致裸 HTML。
- **现在**:
  - `app.css`/`app-mobile.css`/`app-pc.css` **全静态加载**
  - **移动端规则**: 全前缀 `html.mobile-runtime`
  - **PC 端规则**: 全前缀 `html:not(.mobile-runtime)`
  - **唯一真值**: `layoutMode` store 在启动时更新 `document.documentElement.classList.toggle('mobile-runtime', isMobile)`，切换全靠类名，再也不会 JS/媒体不匹配。
  - 保留 `@media (orientation: landscape)` 和 `prefers-reduced-motion` 等原生媒体查询嵌套。
  - 解决问题：
    1. 消除了 "JS 说 mobile but CSS 媒体说 PC → 移动端规则不生效 → 裸 HTML 无布局" 间歇性故障
    2. 消除了 Tauri 自定义协议下动态 CSS import 的跨源加载失败
- `app.css`: 基础样式（全屏、动画、通用变量）+ 移动端 shell 规则已转 runtime 前缀
- `app-pc.css`: PC 端独立样式，全部前缀 `html:not(.mobile-runtime)`
- `app-mobile.css`: 移动端独立样式，全部前缀 `html.mobile-runtime`

### 3. 响应式工具
```javascript
import { responsive, isMobileDevice } from '$lib/utils/responsive.js'

// 在组件中使用
{#if $responsive.isMobile}
  <MobilePlayer />
{:else}
  <PCPlayer />
{/if}
```

## 已解决的问题

✅ **播放列表导致布局错位** - PC 端 `.ly-local-queue` 现在绝对定位
✅ **移动端关闭按钮污染 PC** - 通过 CSS 媒体查询隐藏
✅ **歌词字体大小不一致** - 独立的样式文件，完全隔离
✅ **网格布局冲突** - 移动端/PC端完全分离，互不影响

## 已完成的迁移计划

✅ **将完整的歌词逻辑迁移到 V2 版本** — `AppleMusicPlayer` 与 `PCPlayer` 统一使用 `useLyrics()`
✅ **将 context strip 等功能迁移到对应组件** — 新增 `SongContextStrip.svelte`，在 `PCPlayer` 中复用
✅ **逐步废弃旧版 `LyricsPage.svelte`** — 已删除，入口统一为 `LyricsPageV2.svelte`
✅ **把共享逻辑提取到 composables** — 新增 `src/lib/composables/useLyrics.js`

## 文件清单

新增文件：
- `src/lib/utils/responsive.js` - 响应式检测工具
- `src/lib/components/AppleMusicPlayer.svelte` - 移动端播放器组件
- `src/lib/components/PCPlayer.svelte` - PC端播放器组件
- `src/lib/components/LyricsPageV2.svelte` - 新版入口组件
- `src/lib/components/SongContextStrip.svelte` - 歌曲相关内容条
- `src/lib/composables/useLyrics.svelte.js` - 歌词共享逻辑
- `src/app-pc.css` - PC端独立样式
- `src/app-mobile.css` - 移动端独立样式
- `docs/RESPONSIVE_REFACTOR.md` - 本文档

删除文件：
- `src/lib/components/LyricsPage.svelte` - 旧版歌词页（已迁移到 V2）

修改文件：
- `src/main.js` - 导入新样式文件
- `src/App.svelte` - 使用新版移动端外壳与歌词页
