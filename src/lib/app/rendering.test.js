/**
 * Desktop route rendering regression check.
 * Run: node src/lib/app/rendering.test.js
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../../App.svelte', import.meta.url), 'utf8')
const desktopHost = await readFile(new URL('../components/layout/DesktopPageHost.svelte', import.meta.url), 'utf8')
const lazyModule = await readFile(new URL('./lazy-module.ts', import.meta.url), 'utf8')
const mobileApp = await readFile(new URL('../components/MobileApp.svelte', import.meta.url), 'utf8')
const loginOverlay = await readFile(new URL('../components/LoginOverlay.svelte', import.meta.url), 'utf8')
const authStore = await readFile(new URL('../stores/auth.svelte.ts', import.meta.url), 'utf8')
const windowTitleBar = await readFile(new URL('../components/WindowTitleBar.svelte', import.meta.url), 'utf8')
const shellCss = await readFile(new URL('../../styles/shell.css', import.meta.url), 'utf8')
const mobileCss = await readFile(new URL('../../app-mobile.css', import.meta.url), 'utf8')
const playlistPage = await readFile(new URL('../pages/PlaylistPage.svelte', import.meta.url), 'utf8')
const playlistHero = await readFile(new URL('../components/PlaylistHero.svelte', import.meta.url), 'utf8')
const playlistToolbarComp = await readFile(new URL('../components/PlaylistToolbar.svelte', import.meta.url), 'utf8')
const playlistTableComp = await readFile(new URL('../components/PlaylistTrackTable.svelte', import.meta.url), 'utf8')
const playlistStatusComp = await readFile(new URL('../components/PlaylistStatus.svelte', import.meta.url), 'utf8')
const songRowComp = await readFile(new URL('../components/SongRow.svelte', import.meta.url), 'utf8')
const songListComp = await readFile(new URL('../components/SongList.svelte', import.meta.url), 'utf8')
const songMenuComp = await readFile(new URL('../components/SongContextMenu.svelte', import.meta.url), 'utf8')
const keyboardShortcuts = await readFile(new URL('./keyboard-shortcuts.ts', import.meta.url), 'utf8')
const runtimeHelpers = await readFile(new URL('../utils/runtime.ts', import.meta.url), 'utf8')
const libraryCard = await readFile(new URL('../components/LibraryPlaylistCard.svelte', import.meta.url), 'utf8')
const playerEngine = await readFile(new URL('../player/engine.ts', import.meta.url), 'utf8')
const androidStartup = await readFile(new URL('./android-startup.ts', import.meta.url), 'utf8')
const sidebar = await readFile(new URL('../components/Sidebar.svelte', import.meta.url), 'utf8')
const routerStore = await readFile(new URL('../stores/router.svelte.ts', import.meta.url), 'utf8')
const lyricsCss = await readFile(new URL('../../styles/lyrics.css', import.meta.url), 'utf8')
const searchOverlayCss = await readFile(new URL('../../styles/search-overlay.css', import.meta.url), 'utf8')
const queuePanel = await readFile(new URL('../components/QueuePanel.svelte', import.meta.url), 'utf8')
const homePage = await readFile(new URL('../pages/pc/Home.svelte', import.meta.url), 'utf8')
const librarySource = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')
const recentModule = await readFile(new URL('../components/RecentTracksModule.svelte', import.meta.url), 'utf8')
const weeklyModule = await readFile(new URL('../components/WeeklyListenModule.svelte', import.meta.url), 'utf8')
const explorePage = await readFile(new URL('../pages/pc/Explore.svelte', import.meta.url), 'utf8')
const dailyHistoryPage = await readFile(new URL('../pages/pc/DailyHistory.svelte', import.meta.url), 'utf8')
const wallpaperLayer = await readFile(new URL('../components/WallpaperLayer.svelte', import.meta.url), 'utf8')
const wallpaperCss = await readFile(new URL('../../styles/wallpaper.css', import.meta.url), 'utf8')
const lazyRoutes = [
  'PlaylistPage', 'SearchPage', 'ArtistPage', 'ExplorePage', 'DailyHistoryPage',
  'LibraryPage', 'RecentPage', 'MessagesPage', 'LikedPage', 'SettingsPage', 'AboutPage',
  'LocalMusicPage',
]

assert.ok(desktopHost.includes("{:else if router.activeView === 'library'}"), 'desktop routes should render the unified library')
assert.ok(!desktopHost.includes('<div style:display={router.activeView'), 'inactive desktop pages must not remain mounted')
assert.ok(!desktopHost.includes('{#key router.activeView}'), 'desktop route changes should not add a second forced remount boundary')
assert.ok(app.includes("const loadMobileApp = lazyModule(() => import("), 'mobile application should not be in the desktop startup bundle')
assert.ok(lazyModule.includes('return () => module ?? (promise ??= loader().then'), 'loaded route modules should render synchronously on repeat visits')
assert.ok(mobileApp.includes("mountedViews.includes('explore')"), 'mobile primary pages should mount on first visit')
assert.ok(mobileApp.includes("{:else if page.view === 'messages'}"), 'mobile secondary cache must cover messages')
assert.ok(mobileApp.includes('slice(-6)'), 'mobile secondary cache must remain bounded')
assert.ok(mobileApp.includes('inert={viewKey !== page.key}'), 'inactive cached pages must reject interaction')
assert.ok(mobileApp.includes('scrollPositions'), 'mobile routes should preserve independent scroll positions')
assert.match(loginOverlay, /import\s*\{[^}]*\btick\b[^}]*\}\s*from\s*['"]svelte['"]/, 'login mode focus should import tick')
assert.ok(authStore.includes("finish(rejectPromise, new DOMException('Aborted', 'AbortError'))"), 'canceling QR polling should settle its promise')
assert.ok(!loginOverlay.includes("if (m === 'qr') startQr()"), 'QR mode changes should rely on one reactive start')
assert.ok(mobileApp.includes('onNavigate?.(view, extra, !primaryViews.includes(view))'), 'mobile secondary navigation should preserve its source route')
assert.ok(app.includes('const hasCustomTitlebar = isTauriDesktop()'), 'custom titlebar must be gated to Tauri desktop')
assert.ok(app.includes('{#if hasCustomTitlebar}'), 'custom titlebar must not render in web or mobile runtimes')
assert.ok(windowTitleBar.includes('data-tauri-drag-region="deep"'), 'desktop titlebar should expose a Tauri drag region')
assert.ok(windowTitleBar.includes('appWindow.minimize()'), 'desktop titlebar should minimize the window')
assert.ok(windowTitleBar.includes('appWindow.toggleMaximize()'), 'desktop titlebar should maximize or restore the window')
assert.ok(windowTitleBar.includes('appWindow.close()'), 'desktop titlebar should close the window')
assert.ok(app.includes("document.documentElement.classList.add('desktop-titlebar')"), 'titlebar flag must be set synchronously on <html> so overlays offset on first frame')
assert.ok(shellCss.includes('--titlebar-h: 38px'), 'titlebar height must be one shared variable')
assert.ok(shellCss.includes('html.desktop-titlebar .app-shell'), 'app shell must offset only with the desktop titlebar')
// 内容区顶部/底部安全空间必须只有一个来源：外壳负责，页面条与页面不再自己补
assert.ok(shellCss.includes('--app-top-inset: calc(var(--titlebar-h) + env(safe-area-inset-top'), '顶部安全空间必须由标题栏与安全区合成一个变量')
assert.ok(mobileCss.includes('margin: var(--app-top-inset) 0 0'), '移动外壳必须消费统一的安全空间，Windows 窄窗口才不会被标题栏盖住')
assert.ok(!/\.mobile-page-bar \{[^}]*safe-area-inset-top/.test(mobileCss), '页面条不能重复补顶部安全区')
assert.ok(!mobileCss.includes('var(--mobile-tabs-h) + var(--mobile-dock-gap) + var(--mobile-player-h)'), '底部占位必须由 --mobile-dock-space 统一派生')
// 页面只能通过上下文拿滚动视口，不能按 class 猜外壳
assert.ok(desktopHost.includes('setScrollViewport('), '桌面外壳必须向页面提供滚动视口')
assert.ok(mobileApp.includes('setScrollViewport('), '移动外壳必须向页面提供滚动视口')
assert.ok(playlistPage.includes('getScrollViewport()'), '歌单页必须从上下文取滚动视口')
assert.ok(!playlistPage.includes("'.content-scroll'"), '页面不得按 class 查找桌面滚动容器')
assert.ok(!playlistPage.includes("'.mobile-page-content'"), '页面不得按 class 查找移动滚动容器')
assert.ok(!playlistPage.includes("classList.contains('mobile-runtime')"), '页面不得用布局 class 分支行为')
// 页面操作：页面声明，外壳按 placement 取用；不再查 DOM 派发自定义事件
assert.ok(playlistPage.includes('pageChrome.register('), '歌单页必须向外壳声明标题/返回/操作')
assert.ok(desktopHost.includes('setPageChromeHost(pageChrome)') && mobileApp.includes('setPageChromeHost(pageChrome)'), '两个外壳都必须提供页面操作宿主')
assert.ok(!playlistHero.includes('heroActions'), 'hero 不得再监听 playlist-share / playlist-more 自定义事件')
assert.ok(!mobileApp.includes('dispatchEvent(new Event(action))'), '外壳不得通过查页面 DOM 派发操作事件')
assert.ok(playlistPage.includes('onMore={openMoreMenu}'), '内容区「更多」必须走页面统一入口')
assert.ok(playlistPage.includes('run: shareCurrent') && playlistPage.includes('run: openMoreMenu'), '顶部操作必须与内容区共用同一批函数')
// 能力判定不得由布局决定：键盘是输入方式、返回键/歌单菜单是平台与输入能力
assert.ok(!keyboardShortcuts.includes('isMobile'), '键盘快捷键不得按布局关闭')
assert.ok(runtimeHelpers.includes('export function isAndroidRuntime'), '平台能力必须复用 runtime.ts 的判定')
assert.ok(app.includes('isAndroidRuntime()'), 'Android 返回键必须按平台判定而不是布局')
assert.ok(!app.includes('/Android/i'), 'App 内不得再自己写一套 Android 识别')
assert.ok(!libraryCard.includes("if ($responsive.isMobile) { event.preventDefault()"), '歌单卡右键菜单不得按布局关闭')
assert.ok(!playerEngine.includes('/Android/i') && !androidStartup.includes('/Android/i'), 'Android 识别必须收敛到 runtime.ts 的 isAndroidRuntime()')
// 布局切换：外壳会销毁重建，页面访问状态必须来自组件外；且切换本身不得改动路由
assert.ok(playlistPage.includes('recallPlaylistView') && playlistPage.includes('rememberPlaylistView'), '歌单页搜索/排序必须存放在可跨外壳保留的位置')
const applyLayoutBody = app.match(/function applyLayout\([^)]*\): void \{([\s\S]*?)\n  \}/)?.[1] ?? ''
assert.ok(applyLayoutBody.length > 0, 'applyLayout should stay a single place')
assert.ok(!/handleNav|activeView\s*=/.test(applyLayoutBody), '布局切换不得新增或清空路由历史')
// C01：展示子组件只接收数据，不自己取详情、也不碰路由缓存
for (const [name, source] of [['工具栏', playlistToolbarComp], ['曲目表', playlistTableComp], ['状态块', playlistStatusComp]]) {
  assert.ok(!/from '.*(music\/service|api\/client|stores\/router)/.test(source), `${name}不得自己请求歌单详情`)
}
// C02：hero 的动作语义与展示稳定性
assert.ok(playlistHero.includes('heroPlayback('), '暂停/继续语义必须由可测的纯函数决定')
assert.ok(playlistHero.includes('.playlist-more-btn { display: none; }'), '更多入口常驻声明、由布局显隐，不在 JS 里按外壳分支')
assert.ok(playlistHero.includes('playlist-cover--empty'), '缺封面必须有稳定占位')
assert.ok(playlistHero.includes('-webkit-line-clamp'), '超长描述必须被行数截断')
// C03：工具栏自己管展开与聚焦，页面只转发
assert.ok(playlistToolbarComp.includes('export function open('), '展开行为必须由工具栏拥有')
assert.ok(!playlistToolbarComp.includes('document.'), '聚焦必须用本地元素引用，不查文档')
assert.ok(playlistPage.includes('toolbar?.open()'), '页面只转发展开请求')
assert.ok(!playlistPage.includes('show-mobile-tools'), '展开标记不再由页面打在外壳节点上')
// C04：共享歌曲行
assert.ok(songListComp.includes('withRowKeys('), '重复曲目必须用「id + 第几次出现」做渲染键')
assert.ok(!songListComp.includes('{#each tracks as track, i (track.id)}'), '不能只用歌曲 ID 作为渲染键')
assert.ok((songRowComp.match(/stopPropagation\(\)/g) || []).length >= 3, '歌手/专辑/更多点击不得冒泡成播放')
assert.ok(songRowComp.includes('未知歌手') && songRowComp.includes('track-cover-placeholder'), '缺歌手与缺封面必须有兜底呈现')
// C05：共享列表只管渲染，排序/队列策略在上层
assert.ok(songListComp.includes('{@render header?.()}'), '表头由上层提供，列表不决定排序')
assert.ok(!songListComp.includes('stores/player'), '列表不得直接读播放器或决定队列')
assert.ok(!songListComp.includes('playlist-sort'), '列表不得感知歌单排序键')
// C06：鼠标 / 触摸 / 键盘共用同一套行菜单
assert.ok(songRowComp.includes('rowEl?.focus({ preventScroll: true })'), '打开菜单前先聚焦行，Escape 才能回到触发位置')
assert.ok(songRowComp.includes("event.key === 'ContextMenu'"), '键盘必须能打开行菜单')
assert.ok(!songRowComp.includes('{...rowActions'), '行菜单入口必须收敛到一个函数，不再各自 spread')
assert.ok(songListComp.includes('MOVE_TOLERANCE_PX') && songListComp.includes('onpointercancel'), '触摸位移/取消必须阻止误开菜单')
assert.ok(songListComp.includes('clickBlockedUntil'), '长按开菜单后松手不得再触发播放')
// C07：分页/搜索/排序的边界语义
assert.ok(playlistPage.includes('playlistEmptyText('), '空态文案必须由可测函数决定，区分「歌单为空」与「没有匹配」')
assert.ok(playlistPage.includes('playlistCountLabel('), '计数必须说明是「已加载」范围')
assert.ok(playlistToolbarComp.includes('countLabel'), '计数要带完整语义，不能把局部说成全量')
assert.ok(playlistTableComp.includes('{emptyText}'), '适配层必须把页面的空态语义透传给列表')
// C08：六种状态 + 重试只重试对应过程
assert.ok(playlistPage.includes('playlistDisplayState(') && playlistPage.includes('playlistFooterState('), '展示与底部状态必须由状态机决定')
assert.ok(playlistPage.includes('onRetry={onRetryLoad}') && playlistPage.includes('onRetry={onLoadMore}'), '整页失败与批次失败必须是两个不同的重试入口')
assert.ok(playlistPage.includes('onRetry={onRetryLoad} {onBack}'), '整页失败时返回仍要可用')
assert.ok(desktopHost.includes('onRetryLoad={router.retryDetail}') && mobileApp.includes('onRetryLoad={router.retryDetail}'), '两端都要能重试整页加载')
// C09：详情切换时的过期结果与残留面板
assert.ok(songMenuComp.includes('onOpenArtist?.(artist.id)') && songMenuComp.includes('onClose?.()'), '菜单内跳转后必须立即关闭，不能跟着旧页面残留')
assert.ok(playlistPage.includes('heroMenuOpen = false') && playlistPage.includes('showSortSheet = false'), '换资源时必须重置面板状态')
assert.ok(playlistPage.includes("const key = viewKey") && playlistPage.includes('if (lastViewKey === key) return'), '页面状态必须按资源 key 生效，不能跨资源复用')
// C10：两端一份实现
assert.ok(!playlistTableComp.includes('<table'), '适配层不得自带表格结构，列表只能有一份')
assert.ok(mobileApp.includes("import PlaylistPage from '../pages/PlaylistPage.svelte'"), '窄屏外壳必须复用同一个歌单页')
assert.ok(desktopHost.includes("lazyModule(() => import('../../pages/PlaylistPage.svelte'))"), '宽屏外壳必须复用同一个歌单页')
// D01：账号切换与过期响应
assert.ok(homePage.includes('auth.user?.userId !== uid'), '主页必须按 owner 丢弃过期响应')
assert.ok(librarySource.includes('!== owner'), '资料库必须按 owner 丢弃过期响应')
assert.ok(homePage.includes('userId: auth.user?.userId'), '主页快照必须写当前账号，不能沿用旧 userId')
// D02：资料库组合模块，不再渲染完整主页
assert.ok(!librarySource.includes('Home.svelte'), '资料库不得再渲染整页主页')
assert.ok(!homePage.includes('profileOnly'), '主页不再提供裁切式的 profileOnly 模式')
assert.ok(librarySource.includes('LikedCoverFalls'), '资料库的喜欢入口复用封面瀑布流')
assert.ok(librarySource.includes('library-identity'), '资料库包含个人身份信息')
assert.ok(!homePage.includes('likedPlaylist?.trackCount ?? 0} 首'), '入口文案不得在页面里各自硬编码')
// D03：最近播放模块
assert.ok(homePage.includes('RecentTracksModule') && librarySource.includes('RecentTracksModule'), '两端复用同一个最近播放模块')
assert.ok(weeklyModule.includes('CompactTrackList'), '本周常听复用同一个紧凑列表')
assert.ok(!homePage.includes('profile-home__track-list'), '列表样式不得再留在页面里')
assert.ok(recentModule.includes('player.playQueue(sources as unknown as CompactTrackInput[], index)'), '预览播放必须用原始队列 + 列表索引')
assert.ok(recentModule.includes('local-listening-history-change') && recentModule.includes('LISTENING_CHANGE'), '播放历史变化后模块要刷新')
// D04：本周常听模块（主页独占，资料库不再重复；资料库改用收听统计与历史日推入口）
assert.ok(homePage.includes('WeeklyListenModule'), '主页必须复用本周常听模块')
assert.ok(!librarySource.includes('WeeklyListenModule'), '资料库不再重复渲染本周常听')
assert.ok(weeklyModule.includes('weeklyListenState(') && weeklyModule.includes('weeklyListenCanExpand('), '数据状态与展开能力由可测逻辑决定')
assert.ok(weeklyModule.includes('本周常听加载失败') && weeklyModule.includes('onRetry'), '失败必须显示失败文案并可重试，不能当成没有听歌')
assert.ok(lyricsCss.includes('html.desktop-titlebar:not(.mobile-runtime) .ly-container'), 'fullscreen lyrics top buttons must clear the titlebar')
assert.ok(searchOverlayCss.includes('html.desktop-titlebar:not(.mobile-runtime) .search-overlay'), 'search overlay input must clear the titlebar')
assert.ok(queuePanel.includes(':global(html.desktop-titlebar) .queue-panel'), 'desktop queue panel must start below the titlebar')
assert.ok(!desktopHost.includes('transition:fade'), 'desktop route changes should keep the content surface stable')
assert.ok(desktopHost.includes('class="page-enter"'), 'desktop routes should retain one stable content container')
// 侧边栏导航项即顶层视图，必须与 router 的 TOP_LEVEL_VIEWS 同步，否则顶层页会错误地冒出返回按钮
const topLevel = new Set(routerStore.match(/TOP_LEVEL_VIEWS = new Set\(\[([^\]]*)\]/)?.[1].match(/'([a-zA-Z]+)'/g)?.map(v => v.slice(1, -1)) || [])
assert.ok(topLevel.size > 0, 'router should declare the top-level view list')
for (const [, view] of sidebar.matchAll(/nav\('([a-zA-Z]+)'\)/g)) {
  assert.ok(topLevel.has(view), `sidebar destination "${view}" must be listed in TOP_LEVEL_VIEWS`)
}
// 历史日推是二级页，回退只靠统一返回按钮；handleNav 的通用分支会清空 _routeStack，
// 所以必须在它之前拦下来压栈，否则从资料库进去按返回会掉回首页
const navBody = routerStore.slice(routerStore.indexOf('function handleNav('), routerStore.indexOf('function goBack('))
const dailyHistoryAt = navBody.indexOf("view === 'dailyHistory'")
assert.ok(dailyHistoryAt > -1, 'handleNav should intercept dailyHistory')
assert.ok(dailyHistoryAt < navBody.indexOf('_routeStack = []'), 'dailyHistory must be intercepted before handleNav resets _routeStack')
assert.ok(homePage.includes('homeSnapshot?.userId === userId'), 'home should reuse the current user snapshot before refreshing')
assert.ok(explorePage.includes('exploreSnapshotAt'), 'explore should retain a freshness-bounded snapshot across mounts')
assert.ok(!homePage.includes('transition:slide'), 'home should not stack a page slide over route changes')
assert.ok(dailyHistoryPage.includes('untrack(load)'), 'daily history initial load must not track state written by the request')
assert.ok(app.indexOf('<WallpaperLayer />') < app.indexOf('<main class="app-shell"'), 'wallpaper should cover the full desktop window behind the app shell')
assert.ok(app.includes("classList.toggle('custom-wallpaper', wallpaper.active)"), 'wallpaper state should reach root-level desktop surfaces')
assert.ok(wallpaperLayer.includes('class="wallpaper-layer__backdrop"'), 'image wallpaper should render a blurred fill layer')
assert.ok(wallpaperLayer.includes('class="wallpaper-layer__media"'), 'wallpaper should render a distinct foreground media layer')
assert.equal(wallpaperLayer.match(/<video/g)?.length, 1, 'video wallpaper should use one decoder')
assert.match(wallpaperCss, /html:not\(\.mobile-runtime\) \.wallpaper-layer__media[\s\S]*?object-fit: contain/, 'desktop wallpaper foreground should preserve the complete frame')
assert.match(wallpaperCss, /\.wallpaper-layer__media[\s\S]*?object-fit: cover/, 'mobile wallpaper should retain cover sizing')
assert.ok(wallpaperCss.includes('--bg-surface: rgba(250, 250, 252, 0.48)'), 'desktop wallpaper mode should expose translucent surface tokens')

for (const component of lazyRoutes) {
  assert.ok(desktopHost.includes(`const load${component} = lazyModule(() => import(`), `${component} should be loaded on demand`)
}

console.log(`application rendering self-check: ${lazyRoutes.length + 117} assertions passed`)
