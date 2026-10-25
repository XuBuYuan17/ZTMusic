# 主页 / 资料库模块化：已知限制与后续缺口

D01–D06 拆出模块后，仍然存在以下限制。它们不是 bug，而是**当前没有对应功能**，先明确记录，避免界面暗示不存在的入口。

## 1. 社交预览没有完整列表（缺口）

- `SocialPreview` 只展示**各 8 位**关注 / 粉丝（`loadSocialPreview` 的 `limit = 8`）。
- 仓库里**没有**关注列表页、粉丝列表页，也没有分页接口调用。
- 因此预览卡只有「头像 + 昵称 + 跳到用户主页」这一种能力：
  - 不提供「查看全部」；
  - 不提供「加载更多」；
  - 卡头只显示总数，不暗示可以展开。
- 要做完整列表，需要：新增视图 + 分页（`user/follows`、`user/followeds` 带 offset）+ 路由入口。工作量不小，且属于新功能而非重构。

## 2. 移动端资料库需要两个额外请求（取舍）

资料库概览不加载整份 `UserProfileData`，社交预览由 `SocialPreviewSection` 用 `loadFor` 自己补：

- 请求：`/user/follows`、`/user/followeds` 各一次（**未进 API 缓存**）；
- 只在资料库概览渲染时触发，PC 端不触发；
- 主页不走这条路径（它本来就整份加载 `loadUserProfileData`，预览已在里面）。

若要消除，可把这两个端点纳入 D01 的 5 分钟缓存档，但它们在主页/资料库之间并不重复，先不动。

## 3. 他人主页的周榜仍把失败当空（D04 未覆盖）

`UserProfilePage.svelte` 仍直接读 `profile.weeklyTracks`，所以：

- 请求失败会显示成「本周还没有公开的听歌排行」；
- 没有展开入口（只显示全部）。

`WeeklyListenModule` 已经支持 `tracks / failed / onPlay / onRetry`，迁移成本低；未做是因为它的面板样式属于 `.user-page__*`，直接替换会改变他人主页观感，需要一次视觉确认。

## 4. 发现页横向 rail 没复用共享卡片（D05 范围外）

`Explore.svelte` 的歌单/专辑横滑列表仍用自己的 `mobile-cover-item` 标记：

- 用了 `progressiveCover` 渐进加载 + `onerror` 隐藏；
- 布局是 `grid-auto-columns: 92%` 的横滑卡，与网格里的 `PlaylistCoverCard` 视觉不同。

数据层已经是同一份 `NormalizedPlaylist`，但「同一种卡片」没做到。

## 5. 样式重复（结构限制）

`RecentTracksModule`、`WeeklyListenModule`、`PlaylistSection` 各自带一份 `.profile-home__panel` / `.profile-home__section` 样式。原因是 Svelte 作用域：子组件里的元素拿不到父组件的作用域 hash。要消除需要一个共享的「卡片外壳」组件，属于结构性重构。

## 6. 验证状态

- 全部结论来自源码核对 + 自检脚本（113 个测试文件）；
- **没有**浏览器端到端验证，也没有真机验证：本环境缺 BrowserSkill CLI，本地构建被项目约束禁止；
- 视觉细节（并排→堆叠的断点观感、卡片高度、移动端间距）**均未确认**。
