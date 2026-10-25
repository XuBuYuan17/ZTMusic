# 页面与入口清单

批次 A01 的盘点结果。**本文件只记录现状，不代表期望状态**，也没有改动任何页面行为。

记录时间：2026-10-24 · 对应代码：`dev` 分支工作区（未提交改动保持原样）

---

## 1. 记录口径

盘点时必须把下面五件事分开，不能合并写成「移动端没有」：

| 判定 | 含义 | 本次是否出现 |
| --- | --- | --- |
| **有入口** | 用户能直接点到该页 | — |
| **入口被重写** | 入口控件存在，但导航层把目标改成了别的视图 | 是（主页 → 资料库） |
| **没有入口** | 有组件、有渲染分支，但正常路径点不到 | 是（喜欢） |
| **没有内容** | 页面能进，但某个业务模块在某一端不渲染 | 是（发现页榜单） |
| **平台不支持** | 该能力在当前运行平台确实无法执行 | 否（本次 16 个页面里没有一项属于此类） |

「平台不支持」只有一处真实存在，且不在页面级：用户点名的 16 个页面里没有一项属于此类。唯一的平台门控是设置里的 `android` 分类，由 `engine.native === true` 控制（`src/lib/pages/mobile/Settings.svelte:64,185`），非原生引擎下不显示。这属于能力判定，写法是对的。

判定依据（本清单的单一真相源）：

- 视图集合：`src/lib/stores/router.svelte.ts:111` 的 `TOP_LEVEL_VIEWS`，其余视图按二级页处理
- 外壳分支：`src/lib/components/layout/DesktopPageHost.svelte:62-174`（PC）、`src/lib/components/MobileApp.svelte:204-266`（移动）
- 入口：`src/lib/components/Sidebar.svelte`（PC 侧栏，移动端作为抽屉复用同一组件）、`src/lib/components/MobileApp.svelte:271`（底部 Tab）
- 落点：`src/App.svelte:324-329`、`src/lib/stores/router.svelte.ts:637-652`

---

## 2. 总表

| # | 页面 | 路由标识 | 实际组件 | PC 入口 | 移动入口 | 是否共用实现 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 主页（个人音乐主页） | `home` | `pages/pc/Home.svelte` | 侧栏「主页」、启动默认页 | **入口被重写** → 资料库 | 部分共用（`profileOnly` 裁剪） |
| 2 | 发现 | `explore` | `pages/pc/Explore.svelte` | 侧栏「发现」、启动默认页、主页「更多推荐」 | Tab「发现」（移动端默认落点） | 是（同组件 + `mobile` prop） |
| 3 | 资料库 | `library` | `pages/pc/Library.svelte` | 侧栏「我的收藏」、启动默认页、主页「全部歌单」 | Tab「资料库」、抽屉「我的收藏」、主页重写落点 | 是（内部 `$responsive.isMobile` 分支） |
| 4 | 歌单 | `playlist` + `selectedId` | `pages/PlaylistPage.svelte` | 任意歌单卡片 | 任意歌单卡片 | 是 |
| 5 | 专辑 | `album` + `selectedId` | `pages/PlaylistPage.svelte`（`detailType="专辑"`） | 专辑卡片 | 专辑卡片 | 是 |
| 6 | 推荐歌单（每日推荐/私人雷达/漫游/心动） | `recommendation` | `pages/PlaylistPage.svelte`（`recommendation`） | 发现页推荐歌单区 | 发现页推荐歌单区 | 是 |
| 7 | 搜索 | `search` | `pages/SearchPage.svelte` | 侧栏「搜索」、发现页搜索框 | Tab「搜索」、发现页搜索框 | 是 |
| 8 | 喜欢 | `liked` | `pages/pc/Liked.svelte` | **没有入口**（仅兜底） | **没有入口**（仅兜底） | 是 |
| 9 | 最近播放 | `recent` | `pages/pc/Recent.svelte` | 侧栏、资料库快捷胶囊、主页 CONTINUE 卡/面板 | 抽屉、资料库内主页快捷卡 | 是 |
| 10 | 歌手 | `artist` + `selectedId` | `pages/ArtistPage.svelte` | 各处歌手链接 | 各处歌手链接 | 是 |
| 11 | 用户主页 | `user` + `selectedId` | `pages/UserProfilePage.svelte` | 关注/粉丝预览、评论、私信 | 同左 | 是 |
| 12 | 历史日推 | `dailyHistory` | `pages/pc/DailyHistory.svelte` | 主页 DAILY 卡、资料库快捷胶囊 | 资料库内主页 DAILY 卡 | 是 |
| 13 | 统计 | `listeningStats` | `pages/pc/ListeningReport.svelte` | 主页「本地听歌统计」卡 | 资料库内同一张卡 | 是 |
| 14 | 消息 | `messages` | `pages/pc/Messages.svelte` | 侧栏「提醒」（未读红点） | 抽屉「提醒」 | 是 |
| 15 | 本地音乐 | `localMusic` | `pages/LocalMusicPage.svelte` | 侧栏「本地音乐」 | 抽屉「本地音乐」 | 是 |
| 16 | 设置 | `settings`、`settings-*` | `pages/pc/Settings.svelte` / `pages/mobile/Settings.svelte` | 侧栏「设置」 | Tab「设置」、抽屉「设置」 | **否**（两套视图，共用数据层） |
| 17 | 关于 | `about` | `pages/AboutPage.svelte`（另有设置内 `about` 分类） | 侧栏「关于」 | 抽屉「关于」、设置内「关于」分类 | 是 |

合计 17 个视图（用户点名的 16 个 + `recommendation`，后者是独立路由但不是独立页面组件）。

### `pages/pc/` 下的 9 个文件，谁在复用

| 文件 | MobileApp | DesktopPageHost | 结论 |
| --- | --- | --- | --- |
| `Home.svelte` | 间接（经 Library 的 `profileOnly`） | 直接 | 两端都会渲染，移动端无独立入口 |
| `Settings.svelte` | ✗ | 直接 | PC 专用 |
| `Explore.svelte` | 直接 | 直接 | 共用 |
| `Library.svelte` | 直接 | 直接 | 共用 |
| `Liked.svelte` | 直接 | 直接 | 共用 |
| `Recent.svelte` | 直接 | 直接 | 共用 |
| `DailyHistory.svelte` | 直接 | 直接 | 共用 |
| `Messages.svelte` | 直接 | 直接 | 共用 |
| `ListeningReport.svelte` | 直接 | 直接 | 共用 |

`pc/` 这个目录名现在只对 `Settings.svelte` 成立。这是命名与事实的偏差，不是功能问题，但会持续误导后续拆分。

---

## 3. 逐页明细

### 1. 主页 `home` —— 个人音乐主页

- **组件**：`src/lib/pages/pc/Home.svelte`
- **PC 入口**：侧栏「主页」（`Sidebar.svelte:82`）→ `nav('home')`；启动默认页 `default_page = home`（默认值，`utils/settings.ts:8`）
- **移动入口**：**没有独立入口，且入口被重写**。三层都在重写：
  - `router.svelte.ts:640` `if (isMobileDevice() && view === 'home') view = 'library'`
  - `MobileApp.svelte:169` `if (view === 'home' || view === 'profile') view = 'library'`
  - `App.svelte:325` `if (isMobileRuntime()) { router.handleNav('explore') }`
  - 所以抽屉里点「主页」在移动端落在资料库。
- **共用情况**：**部分共用**。`Library.svelte:301` 在移动布局渲染 `<HomePage profileOnly>`，因此移动端能看到主页的英雄区 + 4 张快捷卡；`dashboard`（最近播放/本周常听）、创建的歌单、为你推荐、社交预览被 `{#if !profileOnly}`（`Home.svelte:129`）整体隐藏。
- **内容差异说明**：这属于「移动端不展示部分模块」，不属于「移动端没有主页」。主页的组件本身在两端都会执行。

### 2. 发现 `explore`

- **组件**：`src/lib/pages/pc/Explore.svelte`（406 行，单文件双分支）
- **PC 入口**：侧栏「发现」（`Sidebar.svelte:91`）；启动默认页 `explore`；主页「为你推荐 → 更多推荐」（`Home.svelte:170`）
- **移动入口**：底部 Tab 第 1 项「发现」（`MobileApp.svelte:271`）；移动端启动落点（`App.svelte:325`）
- **共用情况**：**是**，同一组件靠 `mobile` prop 切换分支（`Explore.svelte:133` 移动分支 / `:210` 桌面分支）
- **内容差异（明确记录，不混写）**：
  - 移动分支模块：精选推荐（横幅横滑）、新歌精选、推荐歌单、新专辑
  - 桌面分支模块：精选推荐、本周新发行、推荐歌单（主/次两块）、新歌、**榜单**
  - 榜单在移动端属于「没有内容」：渲染块 `Explore.svelte:358` 位于桌面分支内，且数据加载被 `if (!mobile && ...)` 门控（`:107`）
  - 这是**移动端缺模块**，不是平台能力问题、也不是入口问题

### 3. 资料库 `library`

- **组件**：`src/lib/pages/pc/Library.svelte`
- **PC 入口**：侧栏「我的收藏」（`Sidebar.svelte:105`，标签写「我的收藏」但目标是 `library`）；启动默认页 `library`；主页「全部歌单」
- **移动入口**：Tab「资料库」、抽屉「我的收藏」、`home` 的重写落点
- **共用情况**：**是**，但组件内部第二次读布局：`Library.svelte:301` 起用 `$responsive.isMobile` 分叉
  - 移动：`HomePage profileOnly` + 「点按打开，长按管理」+ 创建歌单按钮 + 列表式歌单
  - 桌面：页头统计 + 快捷胶囊行（最近播放/历史日推/创建歌单）+ 网格
- **注意**：桌面快捷胶囊行在 `{:else}` 内（`Library.svelte:322-343`），移动端拿不到；移动端的对应入口来自内嵌的 `HomePage` 快捷卡。

### 4. 歌单 `playlist` / 5. 专辑 `album` / 6. 推荐歌单 `recommendation`

- **组件**：三者都是 `src/lib/pages/PlaylistPage.svelte`，靠 props 区分（`detailType` / `recommendation`）
- **路由**：`router.goPlaylist` / `goAlbum` / `goRecommendation`，都会压栈，二级页
- **入口**：发现页、资料库、搜索、喜欢、用户主页里任意歌单/专辑卡片；推荐歌单只从发现页 `DiscoveryPlaylists` 进入，且要求登录态（`router.svelte.ts:377`）
- **共用情况**：**是**，同一组件被两个外壳直接引用
- **详情数据**：共享在 `router` store（`_playlistDetail`），两端读同一份缓存，缓存键 `playlist:{id}` / `album:{id}`，TTL 10 分钟

### 7. 搜索 `search`

- **组件**：`src/lib/pages/SearchPage.svelte`
- **PC 入口**：侧栏「搜索」、发现页顶部搜索框（`Explore.svelte` 桌面分支）
- **移动入口**：Tab「搜索」、发现页搜索框（`Explore.svelte` 移动分支）
- **共用情况**：**是**
- **旁证（不计入页面清单）**：`src/lib/components/SearchOverlay.svelte` 没有任何组件引用它（只有 `music/provider-boundary.test.js` 的文件清单和 `docs/ui-design.md` 还提到）。文档里「搜索有两种入口」的描述已经与代码不符。

### 8. 喜欢 `liked` —— 没有入口

- **组件**：`src/lib/pages/pc/Liked.svelte`
- **渲染分支**：两端都写了（`DesktopPageHost.svelte:161`、`MobileApp.svelte:240`）
- **入口**：**没有稳定入口**。唯一能触达的路径是 `Home.svelte:94` 的兜底分支：
  `profile?.likedPlaylist ? onOpenPlaylist(profile.likedPlaylist.id, true, ...) : onNavigate?.('liked')`
  当 `profile.likedPlaylist` 非空时，快捷卡直接打开歌单详情（不是 `liked` 视图）；资料库的喜欢卡片同理走 `onOpen`。只有它为 `null` 时才会回落到 `liked` 视图。
  `likedPlaylist` 来自 `services/user-profile.ts:132` 对 `rawPlaylists` 的查找，可能为 `null`，因此**「该视图实际几乎不会被打开」是推断，未在真实账号下验证**（见 §5 待确认 1）。
- **共用情况**：是
- **结论**：「有实现、有渲染分支、缺入口」。既不是平台不支持，也不是移动端没有。

### 9. 最近播放 `recent`

- **组件**：`src/lib/pages/pc/Recent.svelte`
- **PC 入口**：侧栏「最近播放」（`Sidebar.svelte:112`）、资料库快捷胶囊、主页 CONTINUE 快捷卡 + 面板「查看全部」
- **移动入口**：抽屉「最近播放」、资料库内主页快捷卡
- **共用情况**：是

### 10. 歌手 `artist` / 11. 用户主页 `user`

- **组件**：`pages/ArtistPage.svelte` / `pages/UserProfilePage.svelte`
- **入口**：全站通用——卡片、歌曲行、评论、关注/粉丝预览。统一收口在 `app/nav-refs.ts` 的 `openArtistRef` / `openUserRef`，两端传入同一组回调
- **共用情况**：是
- **数据**：`artist` 详情共享在 router 缓存（`artist:{id}`）；`user` 只存 `selectedId`，页面自己拉数据

### 12. 历史日推 `dailyHistory`

- **组件**：`src/lib/pages/pc/DailyHistory.svelte`
- **PC 入口**：主页 DAILY 快捷卡（`Home.svelte:97`）、资料库快捷胶囊
- **移动入口**：资料库内嵌主页的 DAILY 快捷卡
- **共用情况**：是
- **路由特殊处理**：`router.goDailyHistory`（`router.svelte.ts:495`）单独实现，因为它需要压栈但不能清空栈；若走 `handleNav` 通用分支，从资料库进入后返回会掉回首页。

### 13. 统计 `listeningStats`

- **实际组件**：`src/lib/pages/pc/ListeningReport.svelte`
- **PC 入口**：主页「本地听歌统计」快捷卡（`Home.svelte:95`）
- **移动入口**：资料库内嵌主页的同一张快捷卡
- **共用情况**：是
- **注意（孤儿文件）**：`src/lib/pages/ListeningStatsPage.svelte` 存在但**没有任何文件引用**（两个外壳都指向 `pc/ListeningReport.svelte`）。它是独立实现（读 `dbHistory` + `summarizeLocalListening`），与在用的 `ListeningReport` 不是同一份代码。是否删除待批次 C 决定，本批次只记录。

### 14. 消息 `messages`

- **组件**：`src/lib/pages/pc/Messages.svelte`
- **PC 入口**：侧栏「提醒」（`Sidebar.svelte:126`，带未读角标）
- **移动入口**：抽屉「提醒」
- **共用情况**：是
- **其他入口**：`FollowDialog` → 私信（`App.svelte:319` `router.handleNav('messages', undefined, isMobile)`），此时是二级页行为

### 15. 本地音乐 `localMusic`

- **组件**：`src/lib/pages/LocalMusicPage.svelte`
- **PC 入口**：侧栏「本地音乐」（`Sidebar.svelte:119`）
- **移动入口**：抽屉「本地音乐」
- **共用情况**：是
- **平台能力**：**不依赖 Tauri 原生 API**。导入走 `<input type="file">` / 目录选择（`LocalMusicPage.svelte`）+ WebDAV（`stores/local-music.svelte.ts` 引用 `local-music/webdav.ts`）。所以它是「全平台可执行」，不属于「平台不支持」。
- **已知环境限制**：Web 端 WebDAV 会受浏览器 CORS 约束，这是运行环境限制，不是缺页面，也不该记成「移动端没有」。

### 16. 设置 `settings` —— 唯一两套实现

| 项目 | PC | 移动 |
| --- | --- | --- |
| 组件 | `pages/pc/Settings.svelte`（756 行） | `pages/mobile/Settings.svelte`（353 行） |
| 形态 | 单页分组滚动 | 分类列表 → 分类详情 |
| 入口 | 侧栏「设置」 | Tab「设置」、抽屉「设置」 |
| 分类来源 | 无（不用分类） | `pages/mobile/settings-navigation.ts` |
| 共用 | `composables/useSettings.svelte.ts`（224 行，数据与操作） | 同左 |

- **共用情况**：**否**。数据层共用，视图层是两份完整实现。
- **分类**：`appearance / playback / sources / android / general / data / advanced / about`（`settings-navigation.ts:1`）。`settings-*` 视图只有移动端会导航过去（`MobileApp.svelte:236-237`）。
- **两端行为不一致**：`DesktopPageHost.svelte:168` 也会为 `settings-*` 渲染 `pc/Settings.svelte`，但该组件没有 `category` prop，收到分类视图时仍渲染整页。目前没有 PC 路径会导航到 `settings-*`，所以是潜在分叉而非现网 bug。
- **`android` 分类**：`settings-navigation.ts:18` 的 `settingsCategories(android)` + `Settings.svelte:64,185` 双重门控，按 `engine.native` 判定。这是正确的平台能力判定。

### 17. 关于 `about`

- **组件**：`pages/AboutPage.svelte`（被两端直接引用）
- **PC 入口**：侧栏「关于」（`Sidebar.svelte:153`）
- **移动入口**：抽屉「关于」
- **共用情况**：是
- **注意**：设置里还有一个「关于」分类（`settings-about`，`mobile/Settings.svelte:287`），内容和 `AboutPage` 不是同一份。也就是说「关于」有两处内容实现、三条入口，这一点在两端是一致的。

---

## 4. 与总体目标的偏差（本批次只记录，不修）

按「一个 `mobile` 布尔不能同时决定页面内容/可用空间/输入方式/平台能力/页面状态」的标准，现状里这几处是硬耦合：

1. **导航层直接读布局**：`router.svelte.ts:640`、`:656` 用 `isMobileDevice()` 决定 `home` 落点与返回兜底。导航是业务事实，不该由屏幕形状决定。
2. **页面组件内部第二次判布局**：`Library.svelte:301/320`、`Explore.svelte:133`、`pc/Settings.svelte:52,154` 都在组件里读 `$responsive.isMobile`。它们与外壳同源，暂时不会打架，但一旦外壳支持「窄窗口 PC」，这些内部分支会立刻错判。
3. **`pc/Settings.svelte` 内残留的移动分支不可达**：该组件只由 PC 外壳渲染，`:52`、`:154` 的 `$responsive.isMobile` 分支在这条路径上永远为 false。
4. **CSS 仍在用同一个 class 兼管布局与能力**：`main.js:106` 打 `mobile-runtime`，`app-mobile.css:354` 用它来 `display: none` 掉 `shuffle/prev/next/repeat/volume`。这是把「能力」当「布局」隐藏的实例，与窄窗口 Windows 的预期直接冲突。
5. **移动端「启动默认页面」设置无效**：`App.svelte:325` 在移动布局下无条件 `handleNav('explore')`，`default_page` 被忽略；而 `mobile/Settings.svelte:37-38` 仍然让用户选 `explore`/`library`。用户能改设置但看不到效果。

以上都不是本批次要改的内容，仅作为批次 B/C 的输入。

---

## 5. 本批次的检查与局限

- **已做**：源码静态阅读（路由、两个外壳、侧栏、Tab 栏、17 个页面组件的 import 关系、关键分支行）。用 `grep` 核对了每个视图标识符的实际引用位置，用 import 扫描确认组件归属，用孤儿扫描确认无引用文件。
- **未做（按约束）**：没有本地 build / verify / tauri dev / 单元测试；没有启动浏览器或真机。
- **因此不成立的说法**：本清单**没有**经过真机或浏览器验证，所有「入口」「内容差异」结论都来自源码路径推断。若需确认，批次 B 应逐条在 `?mobile` 与宽/窄窗口下实际点一遍。
- **待确认项**：
  1. `liked` 视图在真实账号下是否真的从不被打开（取决于 `loadUserProfileData` 是否总返回 `likedPlaylist`）
  2. 移动端「启动默认页面」设置无效是否为已知取舍（`App.svelte:325` 无注释说明）
  3. `pages/ListeningStatsPage.svelte` 是否还有保留理由
