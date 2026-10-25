# 本次会话改动总览（供验证）

分支：`codex/mobile-player-motion`（工作目录 `D:\Code\ZTmusic`）
基线：会话开始时的工作区，**无任何提交**。全部改动仍未提交、未删除任何文件、无整文件替换（除注明处）。

## 2026-10-25 复核与修复更新

以下原始批次记录保留作为实施历史；当前验证状态以本节为准。

- 修复了复核确认的 7 项问题：搜索页销毁/异步恢复读取 context、历史页滚动恢复读取 context、移动主页隐藏 dashboard、主页子页导航清空返回来源、边缘返回抢占按钮点击、桌面资料库菜单立即关闭、非歌单共享列表长按未接线。
- 页面初始化时捕获 viewport；移动端滚动恢复由外壳独占，页面不再重复记录共享滚动容器。桌面恢复的下一帧任务随页面清理。
- 长按后的点击屏蔽保持到指针释放，再进入短暂的防误触窗口。
- 版本检查通过；Svelte 检查 0 errors / 0 warnings；自检脚本 129/129 个文件通过。
- 现有 Edge/Playwright + Vite 开发服务下，`scripts/browser/shared-pages-regressions.mjs` 的 7 组回归通过，运行时错误为 0；未安装依赖、未运行构建。
- 浏览器覆盖：主页模块在 320/375/430px、明暗主题下可见且无页面级横向溢出；资料库→主页→最近播放逐级返回；返回按钮左边缘点击与短/长鼠标滑动；历史页滚动隔离及缓存淘汰重建；真实触摸长按及释放不播放；宽屏资料库右键/Shift+F10；真实搜索组件卸载和异步重建。
- 浏览器使用隔离测试数据，播放为替身。宽屏菜单检查在现有 fixture 中让共享资料库进入宽屏模式；没有声称完整桌面外壳或 Android 真机验收通过。
- 全量歌单端到端、Android 系统返回/系统边缘手势、EXE 与视觉全矩阵仍待验证。没有文件删除、提交或推送。
- 原规模表是首次复核快照，仅已跟踪文件计入 `+1117 / −1897`；本次另新增滚动恢复单测和浏览器回归脚本，不能将该数字解释成总体代码量减少。

## 0. 初次实施时未完成的验证（历史记录）

- **没有真机验证，也没有浏览器端到端验证**。本环境缺 BrowserSkill CLI（`bsk` 未安装），本地构建/`verify`/Tauri 开发被项目规则禁止。
- 所有「通过」都指：`svelte-check` 0 error/0 warning + 仓库自检脚本（128 个文件全过）。
- 视觉观感、触摸手势、320px 布局、Android 返回键**均未实测**。请验证时不要把这些当作已验证。

## 1. 改动规模

| 项 | 数量 |
|---|---|
| 修改的已跟踪文件 | 40 |
| 新增文件 | 64 = 9 篇文档 + 25 个测试 + 30 个实现文件（另有 2 个与本会话无关的未跟踪目录） |
| 删除文件 | 0 |
| 净变更 | `+1117 / −1897`（40 个跟踪文件） |
| 测试文件总数 | 128（会话开始 106） |

未跟踪目录 `.commandcode/`、`browser-artifacts/` **不是**本次会话创建的，验证时可忽略（`browser-artifacts` 里有更早的 android-ci 日志）。

## 2. 批次与落点

### A 系列：盘点与文档（无生产代码）
| 批次 | 产出 |
|---|---|
| A01 | `docs/page-inventory.md`：17 个视图 × 入口/能力五分类；发现死页 `pages/ListeningStatsPage.svelte`、死组件 `components/SearchOverlay.svelte` |
| A02 | `docs/capability-matrix.md`：28 处两端差异分组 |
| A03 | `docs/page-state.md`：状态归属、返回来源 R1–R5、持久化键清单 |

### B 系列：外壳与契约
| 批次 | 关键文件 |
|---|---|
| B02 | `src/lib/app/scroll-viewport.ts`（新增，滚动视口契约） |
| B03 | `src/lib/app/page-chrome.svelte.ts`（新增，页面动作注册） |
| B04 | `utils/runtime.ts` 增 `isAndroidRuntime()`；`keyboard-shortcuts.ts` 去掉 `isMobile`；`LibraryPlaylistCard` 的右键/菜单不再由布局门控；`App.svelte` 的 Android 返回按平台而非布局订阅 |
| B05 | `pages/playlist-view-state.ts`（按资源隔离的搜索/排序记忆） |

### C 系列：歌单页试点（拆组件）
| 批次 | 关键文件 |
|---|---|
| C01–C05 | 新增 `PlaylistToolbar` / `PlaylistStatus` / `PlaylistTrackTable` / `SongList` / `SongRow` / `song-row.ts` |
| C02 | `playlist-hero-content.ts`（hero 文案/播放入口可测化） |
| C06 | `SongList` 的长按开菜单（委托到 `<tbody>`，非逐行监听） |
| C07 | `playlist-copy.ts`（空态/计数语义，区分「歌单为空」与「没有匹配」） |
| C08 | `playlist-state.ts`：七种展示状态 + 四种底部状态；`router.retryDetail()` |
| C09 | 过期响应验证（`details-async.test.ts` 新增 A→B 用例） |
| C10 | `docs/playlist-pilot-acceptance.md`：**明确写了未完成端到端验收** |

### D 系列：个人主页与资料库
| 批次 | 关键文件 |
|---|---|
| D01 | `cache-ttl.ts` 给 `/user/detail`、`/user/level` 加 5 分钟缓存（实测网络请求 2→1）；`client-cache.test.ts`；Home/Library 加 owner 守卫、修 `home_snapshot` 的 userId |
| D02 | `profile-quick-entries.ts` + `ProfileQuickEntries.svelte`；删除 Home 的 `profileOnly` |
| D03 | `CompactTrackList.svelte` + `RecentTracksModule.svelte` |
| D04 | `weekly-listen.ts` + `WeeklyListenModule.svelte`；`UserProfileData.weeklyTracksFailed` |
| D05 | `PlaylistCoverCard.svelte` + `PlaylistSection.svelte` |
| D06 | `SocialPreviewSection.svelte` + `services/likes.ts`（后者的广播函数在 F01 使用） |
| D07 | `library-playlist-actions.ts`（权限矩阵 + 命令执行，测试替身） |
| D08 | 移动端恢复完整主页：删除三处 home→library 重定向，Library 概览加「查看个人主页」入口 |

### E 系列：发现页
| 批次 | 关键文件 |
|---|---|
| E01 | 榜单不再按 `mobile` 跳过加载；窄屏补榜单/更多推荐；`docs/explore-modules.md` |
| E02 | `FeaturedContent.svelte`（hero/rail 两种布局，图片失败只隐藏不塌陷） |
| E03 | `PreviewCard.svelte` + `NewSongsModule` / `NewAlbumsModule` / `RecommendedPlaylistsModule` |
| E04 | `ToplistsModule.svelte`；榜单失败只影响自身（不再写页面级 error） |
| E05 | 四态生命周期（initial/cached/refreshing/stale/failed）；**探索页两端合并为一份模板** |

### F 系列：推广与收尾
| 批次 | 关键文件 |
|---|---|
| F01 | `services/likes.ts` + `Liked.svelte` 接 `SongList`；取消喜欢后列表与计数刷新 |
| F02 | `Recent.svelte` / `DailyHistory.svelte` 接 `SongList`；`scroll-viewport.ts` 增滚动记忆 |
| F03 | `SearchPage.svelte` 歌曲结果接 `SongList`；搜索快照不再按平台判断 |
| F04 | `ArtistPage`（歌曲）；`UserProfilePage`（周榜/歌单/社交三处） |
| F05 | `docs/page-audit-f05.md`：每页「已共用/保留独立」结论 |
| F06 | `src/lib/app/back-navigation.ts`：四条返回入口统一，`MobileApp`/`DesktopPageHost`/`App` 接线 |
| F07 | `mobile-interaction.ts` 增边缘返回（复用 `createMobileSwipe`），`MobileApp` 挂载 |
| F08 | 组件样式收权：`app-mobile.css` 删 15 行重复覆盖，`css-ownership.test.js` 守卫 |

## 3. 需要重点复核的判断（有争议或可能改变观感）

1. **删除 `app-mobile.css` 里快捷入口的移动端几何**（F08）：删掉的规则与组件内声明数值不同，最终生效的是组件版本。**可能改变观感，需在浏览器确认**。
2. **发现页两端合并成一份模板**（E05）：窄屏现在也会渲染 `music-discovery-header`（搜索条），默认分辨率下未验证。
3. **`home` 在移动端成为独立页**（D08）：`profile` 别名现在指向 home 而非 library。
4. **Escape 行为扩大**（F06）：桌面上无弹层时按 Esc 会退一级页面。
5. **Android 上边缘返回被禁用**（F07）：逻辑上规避系统手势冲突，但未真机验证。
6. **D01 的缓存策略**：`/user/detail`、`/user/level` 从「不缓存」变成 5 分钟，昵称/头像最多可能旧 5 分钟。

## 4. 验证建议（按顺序）

```bash
cd D:/Code/ZTmusic
node node_modules/svelte-check/bin/svelte-check --threshold warning   # 期望 0 errors, 0 warnings
node scripts/run-tests.mjs                                            # 期望 128/128
```

单点复核：

```bash
node --experimental-strip-types src/lib/components/weekly-listen.test.ts    # 排名/展开/失败态
node --experimental-strip-types src/lib/app/back-navigation.test.ts         # 返回层级
node --experimental-strip-types src/lib/app/edge-back.test.ts               # 边缘手势拒绝条件
node src/lib/app/css-ownership.test.js                                      # 样式所有权
node --experimental-strip-types src/lib/api/client-cache.test.ts            # 缓存去重（真实 client + 打桩 fetch）
node --experimental-strip-types src/lib/components/library-playlist-actions.test.ts  # 权限矩阵（测试替身）
node src/lib/services/details-async.test.ts                                 # 分页/过期响应
```

需要浏览器/真机的验收清单在 `docs/playlist-pilot-acceptance.md` §5（明写"未执行"）。

## 5. 文档索引

| 文档 | 内容 |
|---|---|
| `docs/page-inventory.md` | 全部视图、入口与能力分类 |
| `docs/capability-matrix.md` | 两端能力差异分组 |
| `docs/page-state.md` | 状态归属与返回来源 |
| `docs/playlist-pilot-acceptance.md` | 歌单试点验收记录（含未完成项） |
| `docs/home-library-request-overlap.md` | 主页/资料库请求重叠与实测数字 |
| `docs/profile-modules-gaps.md` | 主页/资料库模块化的已知缺口 |
| `docs/explore-modules.md` | 发现页模块集合与四态 |
| `docs/page-audit-f05.md` | 其余独立页面结论 |

## 6. 未完成清单（按真实原因）

1. 完整端到端、真机与 EXE 验收仍未完成；现有浏览器工具已用于上方列出的针对性回归。
2. `pages/ListeningStatsPage.svelte`（415 行、无引用）建议删除，**未删**——删文件需你确认。
3. 他人主页周榜仍把"请求失败"显示成"未公开"（`weeklyTracksFailed` 已就绪，未接线）。
4. 发现页横向 rail 未复用 `PlaylistCoverCard`（依赖侵入式渐进加载）。
5. `responsive.css`/`library-appearance.css` 仍按页面上下文覆盖快捷入口外观。
6. 全站尺寸矩阵仍未验证；仅个人主页在 320/375/430px 的模块可见性和页面横向溢出已由浏览器检查。
