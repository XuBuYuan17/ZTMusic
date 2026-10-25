# 页面状态清单

批次 A03 的盘点结果。**只记录，不改行为，不新增任何持久化键**。

承接 [页面与入口清单](page-inventory.md)（有哪些页面）与 [两端能力对照表](capability-matrix.md)（能做什么）。这份回答：**进入一个页面后，哪些东西属于「这个资源」，哪些属于「这一次访问」，各自活多久、存在哪。**

记录时间：2026-10-24 · 代码：`dev` 分支工作区

---

## 1. 分层口径

| 层 | 定义 | 判定问句 | 归属 |
| --- | --- | --- | --- |
| **资源数据** | 属于某个 ID 的业务数据，多次访问、多个入口共享 | 「换个入口再进同一个 ID，它应该一样吗？」→ 应该 | 资源 / 缓存 |
| **页面访问状态** | 只对「这一次进入」有意义 | 「换个入口再进同一个 ID，它该重置吗？」→ 该重置 | 这一次访问 |
| **导航状态** | 用户在哪一页、栈有多深 | 「这是路由事实还是页面细节？」→ 路由 | router |
| **播放状态** | 队列、进度、音量 | 独立于页面 | player |

**这条线是本次盘点的主线**：同一份数据在不同页面里被复制成「资源」和「访问状态」时，就是后续要拆的地方。

---

## 2. 状态载体总览

| 载体 | 存放什么 | 生命周期 | 现状 |
| --- | --- | --- | --- |
| `stores/router.svelte.ts` 模块级 `$state` | 当前视图、`selectedId`、路由栈、详情数据、详情 LRU 缓存 | 整个会话（页面刷新即失效） | 单一真相源 |
| 各页 `<script module>` 快照 | 页面数据的跨挂载缓存 | 会话，各页策略不一致（见 §3.4） | **5 份实现，策略不统一** |
| `MobileApp` 组件内存 | 滚动位置、已挂载主视图、详情页实例（≤6）、当前 Tab | MobileApp 存活期间 | 依赖挂载，旋转即丢 |
| `App.svelte` 组件内存 | `sidebarCollapsed`、`showSheet` / `showQueuePanel` / `showMobileDrawer` / `showLogin` / `showFollowDialog` | App 存活期间 | 未持久化 |
| `localStorage` | 设置、播放状态、登录态、`home_snapshot`、消息已读镜像 | 跨会话 | 见 §6 |
| `dbSettings` / IndexedDB | 消息已读、接口缓存、播放历史、本地曲库 | 跨会话 | 见 §6 |

---

## 3. 逐页状态清单

图例：`—` 表示该页没有这类状态。

### 3.1 列表与发现类

| 页面 | 搜索 / 筛选 | 排序 | 选中分类 | 分页 | 滚动位置 | 状态载体 |
| --- | --- | --- | --- | --- | --- | --- |
| **主页** `home` | — | — | — | — | 无显式保存 | module `localStorage home_snapshot`（仅资源）+ 组件 `$state` |
| **发现** `explore` | — | — | — | — | 无显式保存 | module 快照（5 分钟 TTL + 账号隔离，`Explore.svelte:59`） |
| **资料库** `library` | — | — | — | — | 无显式保存 | module 快照（**无 TTL** + 账号隔离，`Library.svelte:44,106`） |
| **搜索** `search` | `keyword` | — | `activeCategory`（all/songs/artists/playlists） | 无分页 | **有**，仅桌面 | module 快照（**仅桌面**、无 TTL、无账号隔离，`SearchPage.svelte:5,31,45-57`） |
| **喜欢** `liked` | — | — | — | 无分页 | 无显式保存 | module 快照（账号隔离，`Liked.svelte:2,35,56`） |
| **最近播放** `recent` | — | — | — | 无分页 | 无显式保存 | module 快照（账号隔离，`Recent.svelte:2,27`） |
| **历史日推** `dailyHistory` | `selectedDailyDate`（日期筛选） | — | 日期 chip | 无分页 | 无显式保存 | module 快照（账号隔离，**但把 `selectedDate` 混在资源快照里**，`DailyHistory.svelte:4,34-42`） |
| **本地音乐** `localMusic` | `query`（本地过滤） | — | — | — | 无显式保存 | 组件 `$state`（`LocalMusicPage.svelte:13`）+ `localMusic` store（持久化） |

### 3.2 详情类

| 页面 | 搜索 / 筛选 | 排序 | 选中分类 | 分页 | 滚动位置 | 状态载体 |
| --- | --- | --- | --- | --- | --- | --- |
| **歌单 / 专辑 / 推荐** `playlist` `album` `recommendation` | `trackSearch`（歌单内搜索） | `trackSort` + `trackSortDir`（4 种键 × 2 方向） | — | **游标在资源里**（`trackLoadCursor` / `tracksPartial` 存于 `router._playlistDetail`） | 桌面进页复位到 0；移动由 `MobileApp` 按 `viewKey` 记录 | 组件 `$state`（切换资源时重置，`PlaylistPage.svelte:87-92,154-163`） |
| **歌手** `artist` | — | — | `showAllSongs`（展开全部热门歌曲） | 无分页 | 无显式保存 | 组件 `$state`（切换艺人时重置，`ArtistPage.svelte:113-116`） |
| **用户主页** `user` | — | — | — | 无分页 | 无显式保存 | 组件 `$state`（每次进入重新拉取） |

### 3.3 其他

| 页面 | 页面状态 | 载体 | 备注 |
| --- | --- | --- | --- |
| **消息** `messages` | `selectedMsg`（打开的对话） | 组件 `$state` | 已读状态 `readState` 持久化（`zheting-message-read-state` + `dbSettings`） |
| **统计** `listeningStats` | `period`（累计/本周/本月） | 组件 `$state`（`ListeningReport.svelte:10`） | 不持久化；重新进入回到「累计」 |
| **设置** `settings` | 分类 | **路由**（`activeView = settings-{id}`） | 分类是导航状态，不是页面状态——这是正确的做法；表单值来自持久化设置 |
| **关于** `about` | — | — | 无状态 |

### 3.4 页面快照策略对比（重要）

5 个页面各自实现了「跨挂载保留数据」，但约束不一致：

| 页面 | 账号隔离 | TTL | 是否含页面状态 | 位置 |
| --- | --- | --- | --- | --- |
| 主页 | ✅ `userId` | ❌ | 否 | `localStorage`（唯一持久化的页面快照） |
| 发现 | ✅ owner | ✅ 5 分钟 | 否 | 内存 |
| 资料库 | ✅ `userId` | ❌ | 否 | 内存 |
| 喜欢 / 最近播放 | ✅ `userId` | ❌ | 否 | 内存 |
| 历史日推 | ✅ `userId` | ❌ | **是**（`selectedDate`） | 内存 |
| 搜索 | ❌ | ❌ | **是**（`keyword` / `activeCategory` / `scrollTop`） | 内存，**仅桌面** |

结论：**「资源缓存」和「访问状态」在快照层已经混在一起**，最明显的是搜索页（快照里既有搜索请求结果，也有滚动位置和分类）和历史日推（快照里塞了选中日期）。

---

## 4. 返回来源专题

### 4.1 现有机制

`router` 用一帧一条的栈记录来源：

```
RouteEntry = { view: string; id: number | null }   // router.svelte.ts:92-95
pushRoute() → _routeStack.push(currentRoute())     // :161-162，在切换前压入
goBack()    → 弹出末帧，按 view 分派回对应 go*()    // :654-667
```

关键点：**栈帧记录的是「来源视图 + 该视图的资源 ID」，不是目标资源 ID。** 目标资源在 `_activeView` / `_selectedId` 里，二者分开。

### 4.2 同一歌单从不同入口打开，返回来源会不会混淆？

**不会。** 依据：

- 从资料库打开：栈帧 `{view:'library', id:null}`
- 从发现打开：栈帧 `{view:'explore', id:null}`
- 从搜索打开：栈帧 `{view:'search', id:null}`

三次的目标都是 `{view:'playlist', id:123}`，但栈帧不同，`goBack()` 分别回到对应视图。资源 ID 相同不影响来源判定。

二级页之间同样成立：从用户主页（`user:456`）打开歌单，帧是 `{view:'user', id:456}`，`goBack()` 命中 `prev.view === 'user'` 分支 → `goUser(456, false)`，回到的是**同一个用户**而不是 user 页的默认态。

### 4.3 但存在 5 个真实风险

| 编号 | 风险 | 证据 | 影响 | 处理方向（供批次 B 决策） |
| --- | --- | --- | --- | --- |
| R1 | **移动端详情页实例 key 不含来源**，`viewKey = view:selectedId:routeStack.length`。同一歌单从 A 入口离开、再从 B 入口进入且栈深相同 → key 相同 → Svelte 复用旧组件实例 → 上一次的排序/搜索/滚动被带进这一次访问 | `MobileApp.svelte:73,94-98,233-235` | 返回目标仍正确，但**访问状态跨入口泄漏**（与「不同入口应是不同一次访问」冲突） | 统一实现：key 里加入单调递增的访问序号（不改资源缓存） |
| R2 | 栈空时 `goBack()` 兜底到 `explore`（移动）/ `home`（桌面），不是真实来源 | `router.svelte.ts:656` | 直接深链/外部入口进入详情后返回落到首页 | 补入口：记录首次进入时的来源 |
| R3 | `_previousView` **只写不读**，无任何消费者 | 全仓 grep 仅 `router.svelte.ts` 命中；getter 在 `:680` | 无法据此判断「上一页是谁」，目前是死状态 | 统一实现：要么接成来源判定，要么删掉 |
| R4 | **布局切换会销毁整个 `MobileApp`/`DesktopPageHost`**，`detailPages`（≤6 个详情页实例）、`scrollPositions`、`mountedViews` 全部丢掉 | `App.svelte:192-198` `applyLayout` + `:359` `{#if isMobile}` 外壳切换 | 旋转/跨阈值后，同一会话内的访问状态不可恢复（资源数据可经快照恢复） | 布局适配：状态上移到壳层或 store |
| R5 | **桌面端没有通用滚动恢复**，只有搜索页显式保存 `scrollTop`；其余页面靠 `.content-scroll` 单例「停在原处」 | `SearchPage.svelte:56`；`DesktopPageHost.svelte:60` 无恢复逻辑 | 返回列表页时滚动位置不确定（取决于内容高度是否被 clamp） | 布局适配：与移动端统一到一处实现 |

另外两处状态被布局判定直接覆盖，记录备查：

- `sidebarCollapsed` 每次布局切换都被重置为 `next.isMobile`（`App.svelte:62,195`），用户手动折叠的偏好丢失；该值本身未持久化。
- 移动端「详情页只保留最近 6 个」（`MobileApp.svelte:97-98`）是显式取舍，超出后更深层返回依赖数据缓存重建，滚动与排序丢失——这是**有意简化**，不算缺陷，但需要与 R1 一起考虑。

---

## 5. 资源数据 vs 访问状态：分界表

| 状态 | 归类 | 当前载体 | 共享范围 |
| --- | --- | --- | --- |
| 歌单详情（曲目、游标、`tracksPartial`） | **资源** | `router._playlistDetail` + LRU 32 / TTL 10 分钟 | 全应用，按 `playlist:{id}` |
| 专辑详情 | **资源** | 同上，按 `album:{id}` | 全应用 |
| 歌手详情（资料/歌曲/专辑/关注态） | **资源** | `router._artistDetail` + `artist:{id}` | 全应用 |
| 推荐歌单（每日/雷达/漫游/心动） | **资源** | `router` 私有缓存，5 分钟 + 账号隔离 | 全应用 |
| 探索数据 / 资料库 / 喜欢 / 最近 / 日推列表 | **资源** | 各页 module 快照 | 该页 |
| 主页资料 / 最近 / 推荐 / 本地统计 | **资源** | `localStorage home_snapshot` + 内存 | 该页，跨会话 |
| 播放队列 / 进度 / 音量 / 模式 | **播放** | `localStorage`（`player_*` / `volume` / `mode`） | 全局 |
| 歌单内搜索词 / 排序键 / 方向 | **访问** | `PlaylistPage` 组件 `$state` | 这一次访问 |
| 搜索词 / 分类 / 结果 / 滚动 | **访问**（结果部分属资源） | `SearchPage` module 快照（桌面） | 这一次会话 |
| 历史日推选中日期 | **访问** | `DailyHistory` module 快照 | 这一次会话 |
| 统计周期 | **访问** | `ListeningReport` 组件 `$state` | 这一次访问 |
| 本地音乐过滤词 | **访问** | `LocalMusicPage` 组件 `$state` | 这一次访问 |
| 滚动位置 | **访问** | `MobileApp` Map（移动）/ 无（桌面） | 这一次会话 |
| 打开的私信对话 | **访问** | `Messages` 组件 `$state` | 这一次访问 |
| 消息已读位点 | 资源（跨会话） | `dbSettings` + localStorage 镜像 | 全局 |
| 当前视图 / 栈 / 选中 ID | **导航** | `router` | 全局 |

---

## 6. 已有持久化清单（**本批不新增任何键**）

| 键 / 存储 | 内容 | 来源 |
| --- | --- | --- |
| `settings_schema_version` | 设置版本 | `utils/settings.ts:4` |
| `default_page` `layout_mode` `accent_theme` `lyrics_blur_effect` `lyrics_text_blur_effect` `wallpaper_video_play` `restore_session` `volume` `mode` `preferred_quality` | 用户设置 | `utils/settings.ts:6-17` |
| `player_id` `player_title` `player_artist` `player_cover` `player_duration` `player_time` `player_qi` `player_queue` `player_shuffle` | 播放状态 | `utils/constants.ts:51-63` |
| `auth_mode` `auth_user` `auth_vip` | 登录态 | 认证模块 |
| `locale` | 界面语言 | i18n |
| `home_snapshot` | 主页快照（**唯一持久化的页面数据**） | `Home.svelte:7` |
| `zheting-theme` `zheting-wallpaper` `zheting-listening` `zheting-local-music` | 主题 / 壁纸 / 听歌记录 / 本地曲库 | 各模块 |
| `zheting-message-read-state` | 消息已读（DB 为主，localStorage 作同步初值） | `services/message-read-state.ts:6` |
| `db_fallback_reason` `native_listening_cursor` | 诊断 / 原生游标 | 各处 |
| IndexedDB（dbSettings / 缓存 / 历史） | 同上层数据的落库形态 | `lib/db/` |

**明确不做的事**：

- 不给「歌单内搜索词 / 排序」「统计周期」「手风琴展开态」加持久化——这些是访问状态，跨会话保留违反直觉。
- 不给「滚动位置」加持久化——移动端已经是会话级内存，桌面端缺失属实现问题，不是持久化问题。
- 不新增 `sessionStorage` 或新 key；若批次 B 需要跨挂载保留访问状态，优先复用已有的 module 快照模式，而不是加存储。

---

## 7. 验收对照

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 同一歌单从不同入口打开，不因资源 ID 相同混淆返回来源 | **成立** | §4.2：栈帧记录来源视图+来源 ID，与目标资源 ID 分离；三类入口分别回到 library / explore / search |
| 区分会话内保留与已持久化 | **成立** | §5 分界表 + §6 持久化清单；会话级状态列明载体与生命周期 |
| 不擅自新增持久化 | **成立** | 本次零新增键；§6 明确列出拒绝新增的三类 |

需要说明的是：**「不混淆返回来源」成立，不等于「访问状态不串」**。R1 表明同一资源从不同入口进入时，页面内的排序/搜索/滚动可能被上一次访问污染。返回目标是对的，访问状态是脏的——这两件事必须分开验收，不能因为返回正确就认为状态正确。

---

## 8. 检查与局限

- **已做**：静态阅读 `router` 全部导航路径、5 个 module 快照、`MobileApp` 的状态与清理逻辑、各页 `$state` 声明、`settings`/`storage`/`constants` 的键定义、`message-read-state`；用全仓 grep 确认 `previousView` 无消费者、确认持久化键清单。
- **未做（按约束）**：没有 build / verify / 单测；没有浏览器或真机操作；没有通过真实导航验证 R1–R5。
- **因此不成立**：R1 的「状态被带进下一次访问」是依据 Svelte `{#each}` 按 key 复用组件实例的机制推断的，**未实际复现**。批次 B 应实测：从资料库进歌单改排序 → 返回 → 从发现进同一歌单，看排序是否残留。
- **待确认项**：
  1. R2 的空栈兜底是否有真实触发路径（本次未找到页面级调用点）
  2. 桌面端 `.content-scroll` 在页面高度变化时是否会被浏览器 clamp 到「看似恢复」的位置
  3. `home_snapshot` 是唯一持久化的页面数据，是否应该保留（它同时含资料与推荐，属资源而非访问状态，语义上是合理的）
