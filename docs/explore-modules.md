# 发现页的共同内容集合（E01）

## 1. 模块集合（两端共用同一份定义）

发现页由**六个模块**组成，两端都必须有。允许的差异只有排列顺序、每屏密度和卡片形态。

| # | 模块 | 数据来源 | 桌面呈现 | 移动端呈现 |
|---|---|---|---|---|
| 1 | 精选（banner / 编辑精选） | `banners`、`editorials` | `.music-discovery-feature` 大图 + 编辑卡片 | `.mobile-feature-rail` 横滑大图 |
| 2 | 新歌 | `songs`（`loadExploreData`） | `.music-new-songs-section` 网格 | `.mobile-song-rail` 横滑，每屏 2 组 |
| 3 | 推荐歌单 | `primaryPlaylists` | `.music-discovery-section` 网格 | `.mobile-cover-rail` 横滑 |
| 4 | 更多推荐歌单 | `secondaryPlaylists` | `.music-extra-playlists` | `.mobile-cover-rail`（E01 补） |
| 5 | 新专辑 | `exploreNewAlbums` | `.music-new-albums-panel` | `.mobile-cover-rail` |
| 6 | 榜单 | `toplists`（`loadToplistsData`） | `.music-toplist-panel` | `.mobile-cover-rail`（E01 补） |
| 7 | 登录推荐 | `<DiscoveryPlaylists>` | 直接渲染 | `<DiscoveryPlaylists mobile>` |

第 4 项是第 3 项的第二批数据，算同一个模块（推荐歌单）；其余六项各自独立。

## 2. E01 改了什么

**问题**：榜单没有出现在窄屏的渲染分支里，而且数据加载也被 `mobile` 判断挡住了：

```js
// 之前
$effect(() => { if (!mobile && !toplistsLoaded && !toplistsLoading) loadToplists() })
```

这属于「用布局判断排除业务能力」——窄屏连请求都不发，即使渲染也是空列表。

**改法**：

1. 去掉 `!mobile` 条件，榜单在两端都加载（`/toplist` 有 60 分钟缓存，代价可忽略）；
2. 窄屏分支补上「榜单」板块（复用 `.mobile-cover-rail` 与 `.mobile-cover-item`，与其它横滑板块同构）；
3. 窄屏分支顺带补上「更多推荐歌单」，让推荐歌单这一个模块在两端的**内容量**也一致。

没有做的事：

- 没有把发现页改造成配置驱动。两个分支的差异是真实的布局差异（横滑 vs 网格、大图比例、每屏数量），硬套一份 schema 只会把差异藏进配置里；
- 没有统一两端的排列顺序（桌面：精选 → 专辑 → 推荐 → 更多推荐 → 新歌 → 榜单；窄屏：精选 → 新歌 → 登录推荐 → 推荐 → 更多推荐 → 专辑 → 榜单），这是「允许布局调整排列」的范围。

## 3. 仍然存在的差异

| 项 | 桌面 | 窄屏 | 原因 |
|---|---|---|---|
| 精选形态 | 大图 + 编辑卡片 | 单张横滑大图 | 屏幕高度 |
| 新歌密度 | 网格多列 | 每屏 2 组、组内 3 行 | 触控与滚动 |
| 推荐表头 | 有「查看全部」类链接 | 无表头链接 | 目前没有「全部推荐」页可去，不做假入口 |
| 排序 | 见上 | 见上 | 布局自由度 |

## 4. 已知遗留

- `:global(html.mobile-runtime) .music-extra-playlists { display: none; }` 这条规则现在不会再命中（`mobile` 分支用的是 `mobile-*` 类名），保留是因为它属于桌面分支的窄屏兜底；清理需要单独确认。
- 两端都通过 `DiscoveryPlaylists` 的 `mobile` 属性切换内部布局，这个属性只影响布局，不影响能力。
- 没有浏览器/真机验证：窄屏新增的两个横滑板块的实际观感未确认。

## 5. E05 之后的加载生命周期

发现页现在只有**一份内容模板**：页面按固定顺序渲染七个模块，每个模块自己接收 `mobile` 决定布局。页面只负责数据与四态。

| 状态 | 判定 | 界面 |
|---|---|---|
| `initial` | 无内容、无错误 | 各模块自己的骨架态 |
| `cached` | 有内容、无错误、不在请求 | 直接展示（返回页面时用快照，立即出内容） |
| `refreshing` | 有内容、正在请求 | 继续展示旧内容，不闪空 |
| `stale` | 有内容、刷新失败 | 顶部一条「刷新失败，先显示上次的内容」+ 重试 |
| `failed` | 无内容、有错误 | 整页错误块 + 重试 |

沿用既有缓存：`exploreSnapshot` / `exploreSnapshotOwner` / `SNAPSHOT_TTL`，以及 `/toplist` 的 60 分钟 TTL。

账号隔离：`exploreSnapshotOwner !== owner` 时清空列表并按新账号请求；响应回来时再比对 `owner` 与 `rid`，晚到的旧账号响应直接丢弃。
