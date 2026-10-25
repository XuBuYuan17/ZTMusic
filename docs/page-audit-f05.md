# 其余独立页面的能力与布局审查（F05）

审查范围：不在 F01–F04 迁移清单里的页面。每条结论都标了理由与验证方式。

> 2026-10-25 复核补充：本文件的「已共用 / 保留独立」是结构结论，不表示所有交互已验收。复核发现的 7 项运行时/交互问题已修复并通过针对性浏览器回归，详情见 `session-summary.md` 更新节；其他页面和真机仍待完整验收。

## 1. 结论总表

| 页面 | 结论 | 理由 |
|---|---|---|
| `pages/pc/Home.svelte` | 已共用 | D02–D06 组合 `UserProfileHero` / `ProfileQuickEntries` / `RecentTracksModule` / `WeeklyListenModule` / `PlaylistSection` / `SocialPreviewSection` |
| `pages/pc/Library.svelte` | 已共用 | 组合卡片、社交预览、最近播放与最近播放模块；管理动作走 `library-playlist-actions.ts`（D07） |
| `pages/pc/Explore.svelte` | 已共用 | E02–E05：七块内容都是共享模块，页面只留数据与四态 |
| `pages/PlaylistPage.svelte` | 已共用 | C 系列：`SongList` + `PlaylistToolbar` + `PlaylistStatus` |
| `pages/pc/Liked.svelte` | 已共用 | F01：`SongList` + 单例菜单宿主 |
| `pages/pc/Recent.svelte` | 已共用 | F02：`SongList`，队列仍是整份最近列表 |
| `pages/pc/DailyHistory.svelte` | 已共用 | F02：`SongList`，队列仍是当前日期 |
| `pages/SearchPage.svelte` | 已共用 | F03：歌曲结果用 `SongList`；搜索服务未改 |
| `pages/ArtistPage.svelte` | 已共用 | F04：热门歌曲用 `SongList`；专辑区保留自有外观 |
| `pages/UserProfilePage.svelte` | 已共用 | F04：周榜用 `CompactTrackList`，歌单用 `PlaylistCoverCard`，社交用 `SocialPreviewSection` |
| `pages/pc/ListeningReport.svelte`（统计） | **保留独立** | 内容是日历热力、时段分布、封面墙等图表，**没有任何歌曲行、也没有播放动作**；没有可共享的列表或卡片重复点 |
| `pages/pc/Messages.svelte`（消息） | **保留独立** | 专用会话列表 + `ChatDialog`（`textarea` 输入、回车发送、草稿状态），与歌曲列表/卡片无结构重叠 |
| `pages/LocalMusicPage.svelte`（本地音乐） | **保留独立** | 行内含文件大小、格式等本地元数据，并且**逐行删除**（`local-track-delete`）不是歌曲菜单动作；导入按钮与 file input、WebDAV 表单都是页面专有交互 |
| `pages/mobile/Settings.svelte`（设置） | **保留独立** | 纯表单（开关/输入/选择），无列表或卡片重复点 |
| `pages/AboutPage.svelte`（关于） | **保留独立** | 静态信息与链接，无可复用结构 |
| `pages/ListeningStatsPage.svelte` | **建议删除（待确认）** | 415 行，全仓**无任何引用**；`listeningStats` 视图在两端加载的都是 `ListeningReport.svelte`。属于 A01 记录过的死页 |

**没有"需要迁移"的页面**：F01–F04 之后，剩余页面的相似点是外观层面的（表单、图表、聊天），迁移到共享歌曲/卡片组件会强行把不同业务数据塞进同一类型。

## 2. 特殊交互与公共手势

| 交互 | 位置 | 结论 |
|---|---|---|
| 消息输入框 | `components/messages/ChatDialog.svelte` 的 `textarea` + `handleComposerKeydown` + 表单提交 | 全局快捷键在 `app/keyboard-shortcuts.ts#isEditableTarget` 里跳过 `INPUT` / `TEXTAREA` / `SELECT` / `contentEditable`，输入不会被当成播放/搜索快捷键 |
| 本地文件导入 | `LocalMusicPage` 的两个 `<input type="file">`（文件/文件夹） | 页面**没有**使用 `SongList`（共享列表的长按手势只在它的 `<tbody>` 上生效），文件选择与行列点击互不干扰 |
| WebDAV 表单 | `LocalMusicPage` 的 `url` / `text` / `password` 输入 | 同上；这些输入由原生表单处理，不经过任何共享手势 |

共享手势（`SongList` 的触摸长按、`mobileLongPress`）只挂在歌曲列表的 `<tbody>` / 卡片上，上述页面都不在其作用域内。

## 3. 平台能力与布局无关

| 能力 | 门控依据 | 状态 |
|---|---|---|
| Android 专属设置分区 | `engine.native`（平台能力）→ `settingsCategories(android)` 过滤掉该分类 | 明确状态：非 Android 上分类不出现，不显示为"不可用" |
| 本地音乐导入 / WebDAV | 无平台门控（两端都可用） | 正常 |
| 统计 / 消息 / 关于 | 无平台门控 | 正常 |

**审查结论**：本轮检查的页面里没有 `isMobileDevice()` / `html.mobile-runtime` 参与的能力判断。F03 之前的 `SearchPage` 是唯一一处「平台判断决定状态是否保留」，已在本轮前修掉。

## 4. 待确认的清理项

`pages/ListeningStatsPage.svelte`（415 行）无引用，建议删除。删除文件属于需要确认的操作，未在本批执行。
