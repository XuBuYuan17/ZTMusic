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
│   │   ├── LyricsPage.svelte    (旧版，保留兼容)
│   │   ├── LyricsPageV2.svelte  (新版入口，路由分发)
│   │   ├── MobilePlayer.svelte  (移动端独立组件)
│   │   └── PCPlayer.svelte      (PC端独立组件)
│   └── utils/
│       └── responsive.js         (响应式检测工具)
├── app.css                       (基础样式)
├── app-pc.css                    (PC端独立样式)
└── app-mobile.css                (移动端独立样式)
```

## 核心改进

### 1. 组件分离
- **MobilePlayer.svelte**: 只包含移动端逻辑，Apple Music 风格布局
- **PCPlayer.svelte**: 只包含PC端逻辑，两列布局
- **LyricsPageV2.svelte**: 根据设备类型自动选择组件

### 2. CSS 隔离
- `app.css`: 基础样式（全屏、动画、通用变量）
- `app-pc.css`: 仅在 `@media (min-width: 761px)` 生效
- `app-mobile.css`: 仅在 `@media (max-width: 760px)` 生效

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

## 下一步计划

1. 将完整的歌词逻辑迁移到 V2 版本
2. 将 context strip 等功能迁移到对应组件
3. 逐步废弃旧版 `LyricsPage.svelte`
4. 把共享逻辑提取到 composables

## 文件清单

新增文件：
- `src/lib/utils/responsive.js` - 响应式检测工具
- `src/lib/components/MobilePlayer.svelte` - 移动端播放器组件
- `src/lib/components/PCPlayer.svelte` - PC端播放器组件
- `src/lib/components/LyricsPageV2.svelte` - 新版入口组件
- `src/app-pc.css` - PC端独立样式
- `src/app-mobile.css` - 移动端独立样式
- `docs/RESPONSIVE_REFACTOR.md` - 本文档

修改文件：
- `src/main.js` - 导入新样式文件
