import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { compile } from 'svelte/compiler'
import { getAccentProperties } from '../src/lib/theme/accent.ts'

// Run: node tests/mobile-layout.mjs (requires an existing Playwright installation).
// This check never downloads browsers.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const main = await read('src/main.js')
const styles = await Promise.all([...main.matchAll(/import '\.\/(.+\.css)'/g)].map((match) => read(`src/${match[1]}`)))
for (const file of ['pages/pc/Home', 'pages/pc/Recent', 'pages/pc/DailyHistory', 'pages/pc/Liked', 'pages/pc/ListeningReport', 'pages/pc/Settings', 'pages/SearchPage', 'pages/PlaylistPage', 'components/PlaylistHero', 'components/PlaylistSortSheet', 'components/PlayerBar', 'components/UserProfileHero', 'components/AppleMusicPlayer', 'components/AppleMusicControls', 'components/AppleMusicProgressBar', 'components/LoginOverlay', 'components/ConfirmDialog', 'components/QueuePanel', 'components/PlayerSecondarySheet', 'components/SongContextMenu', 'components/SongPlaylistPanel']) {
  const source = await read(`src/lib/${file}.svelte`)
  styles.push(compile(source, { filename: `${file}.svelte`, cssHash: () => file === 'pages/pc/ListeningReport' ? 'svelte-report-layout-check' : 'svelte-layout-check' }).css?.code || '')
}
const long = '这是用于检查布局的很长的歌曲标题ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3)
const mini = `<div class="player-bar-wrap"><div class="player-bar mobile-mini-player"><button class="mini-player-open"><span class="mini-player-artwork lcd-artwork"></span><span class="mini-player-info"><strong>${long}</strong></span></button><button class="mini-player-play">▶</button><button class="mini-player-queue">☷</button></div></div>`
const choiceSheet = `<div class="mobile-choice-sheet" data-bottom-panel><button class="m-sheet-handle">关闭</button><header><h2>默认音质</h2><button class="mobile-choice-done">完成</button></header><div class="mobile-choice-body">${['无损', '极高', '较高', '标准'].map(label => `<button class="mobile-choice-option active">${label}</button>`).join('')}</div></div>`
const libraryCard = `<div class="library-card"><div class="library-card-cover"></div><div class="library-card-info"><div class="library-card-name">${long}</div></div></div>`
const library = `<div class="library-page"><div class="library-quick-row">${['最近播放', '历史日推', '创建歌单'].map(label => `<button class="library-quick-chip">${label}</button>`).join('')}</div><section class="library-mobile-favorite">${libraryCard}</section><section class="library-mobile-section"><header><h2>我创建的歌单</h2><span>4</span></header><div class="library-grid">${libraryCard.repeat(4)}</div></section></div>`
const libraryOptions = `<div class="mobile-choice-sheet library-options-sheet" data-bottom-panel><button class="m-sheet-handle">关闭</button><header class="library-options-header"><span class="library-options-cover">♫</span><div><h2>${long}</h2><p>我创建的歌单 · 16 首</p></div><button class="mobile-choice-done">关闭</button></header><div class="mobile-choice-body"><button class="mobile-choice-option library-option">打开歌单</button><button class="mobile-choice-option library-option">编辑歌单</button><button class="mobile-choice-option library-option library-option--danger">删除歌单</button></div></div>`
const settings = `<div class="settings-page"><div class="settings-panel"><div class="settings-row"><div><div class="settings-label">清除播放历史</div><div class="settings-desc">删除所有本地播放记录</div></div><button class="settings-secondary-btn">清除</button></div><div class="settings-row"><div><div class="settings-label">布局模式</div><div class="settings-desc">设备横屏时自动切换到 PC 布局</div></div><button class="settings-select mobile-setting-select"><span>PC 布局（大屏推荐）</span></button></div><div class="settings-row"><div><div class="settings-label">记住上次播放</div><div class="settings-desc">恢复上次的播放进度</div></div><button class="switch-control on"><span>开</span></button></div><div class="settings-row settings-row--palette"><div class="settings-label">主题配色</div><div class="accent-picker">${['红色', '蓝色', '跟随封面', '橙色'].map(label => `<button>${label}</button>`).join('')}</div></div></div></div>`
const playlistPanel = `<div class="song-menu panel"><button class="m-sheet-handle">关闭</button><header class="song-menu__header">歌曲信息</header><div class="song-menu__body"><div class="song-menu__playlist-page"><div class="song-menu__panel-head"><button>返回</button><div><strong>添加到歌单</strong><span>${long}</span></div></div><div class="song-menu__playlists">${Array.from({ length: 24 }, () => `<button class="song-menu__playlist"><span class="song-menu__playlist-cover">♫</span><span><strong>${long}</strong><em>16 首</em></span></button>`).join('')}</div></div></div></div>`
const row = `<div class="search-song-row"><div class="search-song-cover"></div><span class="search-song-info"><strong>${long}</strong><em>${long}</em></span><span class="search-song-dur">03:20</span><button class="m-track-more">•••</button></div>`
const hero = `<section class="user-profile-hero"><div class="user-profile-hero__wash"></div><div class="user-profile-hero__content"><div class="user-profile-hero__identity"><span class="user-profile-hero__avatar user-profile-hero__avatar--empty">♫</span><div class="user-profile-hero__copy"><div class="user-profile-hero__label">MY PROFILE</div><div class="user-profile-hero__name-line"><h1>${long}</h1><span class="user-profile-hero__level">Lv.8</span></div><p>${long}</p></div></div><div class="user-profile-hero__stats">${['听歌', '关注', '粉丝', '歌单'].map(label => `<div><strong>128</strong><span>${label}</span></div>`).join('')}</div></div></section>`
const dashboard = `<div class="profile-home__dashboard">${['最近播放', '本周常听'].map((title, i) => `<section class="profile-home__panel"><header><div><span>${i ? 'WEEKLY' : 'CONTINUE'}</span><h2>${title}</h2></div></header><div class="profile-home__track-list ${i ? 'profile-home__track-list--rank' : ''}"><button><span class="${i ? 'profile-home__rank' : 'profile-home__track-empty'}">${i ? '01' : '♫'}</span><span><strong>${long}</strong><em>哲听预览</em></span><span>▶</span></button></div></section>`).join('')}</div>`
const home = `<div class="profile-home">${hero}<div class="profile-home__quick">${['我喜欢的音乐', '本地听歌统计', '最近播放', '历史日推'].map(title => `<button><span class="profile-home__quick-icon">♫</span><span class="profile-home__quick-label">ON THIS DEVICE</span><strong>${title}</strong><em>${long}</em></button>`).join('')}</div>${dashboard}</div>`
const secondarySong = (kind) => `<div class="${kind}-song-row active"><span class="${kind}-song-index">01</span><span class="${kind}-song-cover ${kind}-cover-placeholder">♫</span><span class="${kind}-song-main"><strong>${long}</strong><em><button class="artist-link">哲听预览</button><span class="artist-sep"> / </span><span>${long}</span></em></span>${kind === 'daily' ? '<span class="daily-song-album">专辑</span>' : ''}<button class="m-track-more">•••</button><span class="${kind}-song-dur">03:20</span></div>`
const recent = `<div class="recent-page"><div class="page-header"><h1>最近播放</h1><div class="subtitle">共 24 首歌曲 · 本地记录</div></div><div class="recent-actions"><button class="play-all-btn">播放全部</button></div><table class="track-table"><thead><tr><th class="col-num">#</th><th class="col-cover"></th><th>标题</th><th>歌手</th><th class="col-album">专辑</th><th class="col-dur">时长</th></tr></thead><tbody>${Array.from({ length: 24 }, () => `<tr class="active"><td class="col-num">1</td><td class="col-cover"><div class="track-cover-placeholder">♫</div></td><td class="col-title">${long}<button class="m-track-more">•••</button></td><td class="col-artist artist-links"><button class="artist-link">哲听预览</button><span class="artist-sep"> / </span><span>${long}</span></td><td class="col-album">专辑</td><td class="col-dur">03:20</td></tr>`).join('')}</tbody></table></div>`
const daily = `<div class="daily-page"><section class="daily-hero"><div class="daily-hero-bg"></div><div class="daily-hero-shade"></div><div class="daily-hero-copy"><div class="daily-kicker">Daily Archive</div><h1>历史日推</h1><p>过去的推荐，值得再听一遍。</p><div class="daily-hero-stats"><span>2026-10-01</span><span>24 首歌曲</span></div></div><button class="daily-hero-play">播放全部</button></section><div class="daily-date-scroll">${Array.from({ length: 12 }, (_, i) => `<button class="daily-date-chip ${i ? '' : 'active'}"><span>10月${i + 1}日</span><small>星期四</small></button>`).join('')}</div><section class="daily-song-panel"><div class="daily-section-header"><div><div class="daily-section-eyebrow">Songs</div><h2>10月1日 · 24 首歌曲</h2></div><button>播放这一日</button></div><div class="daily-song-list">${secondarySong('daily').repeat(24)}</div></section></div>`
const liked = `<div class="liked-page"><div class="liked-hero"><div class="liked-hero-art">♥</div><div class="liked-hero-copy"><div class="liked-kicker">资料库 · 歌单</div><h1>我喜欢的音乐</h1><p>你收藏的歌曲都会保存在这里。</p><div class="liked-hero-meta">哲听 · 24 首歌曲</div></div><button class="liked-hero-play">播放</button></div><div class="liked-song-list">${secondarySong('liked').repeat(24)}</div><div class="liked-skeleton"><div class="liked-skeleton-row"><span class="skeleton-line" style="width:32px;height:32px"></span><span class="skeleton-line" style="width:48px;height:48px"></span><span style="flex:1;display:grid;gap:4px"><span class="skeleton-line" style="width:60%"></span><span class="skeleton-line" style="width:40%"></span></span><span class="skeleton-line" style="width:80px"></span></div></div></div>`
const heatFigure = (cols) => `<div class="wall-figure" role="img" aria-label="聆听分布"><div class="wall-months" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${Array.from({ length: Math.ceil(cols / 4) }, (_, i) => `<span style="grid-column:${i * 4 + 1}/span ${Math.min(4, cols - i * 4)}">${i % 12 + 1} 月</span>`).join('')}</div><div class="wall-weekdays">${['一', '', '三', '', '五', '', '日'].map(label => `<span>${label}</span>`).join('')}</div><div class="wall-grid wall-grid-heat" style="aspect-ratio:${cols}/7">${Array.from({ length: cols * 7 }, () => '<span class="wall-cell" style="--fill:36%"></span>').join('')}</div></div>`
const stripFigure = (count) => `<div class="wall-figure wall-figure-strip" role="img" aria-label="时段分布"><div class="wall-grid wall-grid-strip">${Array.from({ length: count }, () => '<span class="wall-cell" style="--fill:36%"></span>').join('')}</div><div class="wall-axis" style="grid-template-columns:repeat(${count},minmax(0,1fr))">${Array.from({ length: count }, (_, i) => `<span>${i % 3 ? '' : i}</span>`).join('')}</div></div>`
const report = (cols = 53) => `<div class="listening-report"><header class="report-header"><div><span class="eyebrow">YOUR LISTENING JOURNAL</span><h1>音乐，留下了足迹。</h1><p>本地听歌统计 · 从 2026/10/1 开始记录</p></div><nav>${['累计', '本周', '本月'].map((label, i) => `<button class="${i ? '' : 'active'}">${label}</button>`).join('')}</nav></header><section class="report-hero"><div class="hero-copy"><span class="eyebrow">累计 · 与音乐相伴</span><h2>139 小时 50 分</h2><p>在 365 个日子里，与 1234 首歌相遇。</p><div class="report-numbers">${['有效播放', '听过歌曲', '活跃天数'].map(label => `<div><strong>12345</strong><span>${label}</span></div>`).join('')}</div></div><div class="report-covers"><img alt=""></div></section><section class="report-rhythm"><div class="section-heading"><div><span class="eyebrow">DAILY RHYTHM</span><h2>聆听的日常</h2></div><span>最近 53 周 · 一格一天</span></div>${heatFigure(cols)}</section><div class="report-clocks">${[24, 7].map(count => `<section class="report-rhythm"><div class="section-heading"><div><h2>聆听的时钟</h2></div><span>一格一小时</span></div>${stripFigure(count)}</section>`).join('')}</div><div class="report-rankings report-facts"><section><div class="section-heading"><h2>习惯</h2></div><dl class="fact-list"><div><dt>单曲循环最多<small>123 次有效播放</small></dt><dd>${long}</dd></div></dl></section><section><div class="section-heading"><h2>发现</h2></div><p>还有更多好音乐。</p></section></div><div class="report-rankings"><section><div class="section-heading"><h2>反复相遇的歌</h2></div><ol class="track-ranking"><li><span class="rank-number">01</span><span class="rank-placeholder">♫</span><div class="rank-copy"><strong>${long}</strong><small>${long}</small></div><div class="rank-time"><span>23 小时 45 分</span><small>999 次有效播放</small></div></li></ol></section><section><div class="section-heading"><h2>熟悉的声音</h2></div><ol class="artist-ranking"><li><span class="artist-initial">哲</span><div><strong>${long}</strong><small>23 小时 45 分 · 999 次有效播放</small><span class="artist-meter"><i style="width:100%"></i></span></div><span class="rank-number">1</span></li></ol></section></div><footer><p>记录仅保存在本机。</p></footer></div>`
const libraryModal = '<div class="library-modal-backdrop"><div class="library-modal"><input class="library-modal-input" placeholder="歌单名称"><div class="library-modal-actions"><button class="library-modal-btn library-modal-btn-confirm">创建</button></div></div></div>'
const searchTabs = `<div class="search-category-tabs">${['综合', '歌曲', '歌手', '歌单'].map((label, i) => `<button class="${i === 0 ? 'active' : ''}">${label}<em>999</em></button>`).join('')}</div>`
const searchToolbar = `<form class="search-toolbar"><label class="search-input-wrap"><span>⌕</span><input class="search-input" type="search" value="${long}"><button class="search-clear">×</button></label><button class="search-submit">搜索</button></form>`
const songMenu = '<div class="song-menu"><button class="m-sheet-handle">关闭</button><header class="song-menu__header">歌曲信息</header><div class="song-menu__body"><div class="song-menu__panel-head"><button>返回</button><strong>添加到歌单</strong></div>' + '<button class="song-menu__item primary">喜欢</button>'.repeat(20) + '</div></div>'
const playlist = `<div class="playlist-detail-page"><table class="track-table playlist-track-table"><tbody><tr class="active"><td class="col-cover"><div class="track-cover-placeholder">♫</div></td><td class="col-title">${long}<button class="m-track-more">•••</button></td><td class="col-artist artist-links">歌手名称</td><td class="col-album">专辑</td><td class="col-added">2026-10-01</td><td class="col-dur">03:20</td></tr></tbody></table></div>`
const playlistHero = `<div class="playlist-detail-hero"><div class="playlist-cover"></div><div class="playlist-hero-copy"><div class="playlist-hero-topline">歌单</div><h1>${long}</h1><div class="playlist-meta">创建者 · 216 首 · 13 小时 5 分钟</div><div class="playlist-hero-actions"><button class="playlist-play-btn">播放全部</button><button class="playlist-shuffle-btn">随机播放</button></div></div></div>`
const shell = `<div class="app-shell"><aside class="sidebar in-drawer open"><nav class="sidebar-nav"><button class="nav-item active">导航</button></nav></aside><div class="main-area"><div class="mobile-app"><header class="mobile-page-bar"><h1>主页</h1></header><main class="mobile-page-content"><div class="mobile-page-content__inner">${home}${row.repeat(24)}</div></main><nav class="mobile-tab-bar">${['主页', '发现', '我的收藏'].map((label, i) => `<button class="mobile-tab ${i === 0 ? 'active' : ''}"><span class="mobile-tab__icon">♫</span><span class="mobile-tab__label">${label}</span></button>`).join('')}</nav></div></div></div><div class="player-bar-wrap"><div class="player-bar compact with-lyrics"><div class="player-bar__lcd"><div class="lcd-artwork"></div><div class="lcd-meta"><strong class="lcd-meta__title">${long}</strong></div></div><div class="player-bar__controls"><button class="ctrl-btn--play">▶</button></div><div class="player-bar__actions"><button class="action-btn action-btn--queue">☰</button></div></div></div>`
const pageShell = (content) => shell.replace(home + row.repeat(24), content)
const player = `<div class="ly-fullscreen"><div class="ly-container"><div class="apple-music-player"><div class="am-flying-cover"><img class="am-flying-cover-img" alt=""></div><div class="am-track-info"><div class="am-track-title">${long}</div><div class="am-track-artist">${long}</div></div><div class="am-bottom-controls"><div class="am-progress-container"><div class="am-progress-bar"></div><div class="am-progress-time"><span>0:00</span><span>3:20</span></div></div><div class="am-play-row">${['模式', '上一首', '播放', '下一首', '队列'].map((label, i) => `<button class="${i === 2 ? 'am-play-btn' : 'am-ctrl-btn'}">${label}</button>`).join('')}</div></div><div class="am-corner-info"><div class="am-corner-title">${long}</div><div class="am-corner-artist">${long}</div></div><div class="am-lyrics-area">歌词</div></div></div></div>`
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER || 'msedge' })
try {
  const page = await browser.newPage()
  async function render(html, mobile, safe = false, theme = 'dark', accent = '#ff453a') {
    html = html.replace('<div class="lcd-meta">', `<div class="lcd-meta show-lyric"><div class="lcd-meta__mobile-title">${long}</div><div class="lcd-meta__mobile-secondary">${long}</div>`)
    // Simulate notch insets separately from browser emulation, which reports zero.
    const css = styles.join('\n').replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, (_, side) => safe ? ({ top: '44px', bottom: '34px', left: '0px', right: '0px' }[side]) : '0px')
    await page.setContent(`<html class="${mobile ? 'mobile-runtime' : ''}" data-theme="${theme}" style="--accent:${accent}"><head><style>${css}</style></head><body>${html}</body></html>`)
    await page.evaluate(theme => {
      document.querySelectorAll('body *').forEach(el => el.classList.add('svelte-layout-check'))
      document.querySelectorAll('.listening-report, .listening-report *').forEach(el => el.classList.add('svelte-report-layout-check'))
      document.querySelector('.app-shell')?.setAttribute('data-theme', theme)
    }, theme)
  }
  async function rect(selector) {
    return page.locator(selector).first().evaluate(el => {
      const { x, y, width, height, right, bottom } = el.getBoundingClientRect()
      return { x, y, width, height, right, bottom }
    })
  }
  async function within(selector, container) {
    const outer = await rect(container)
    for (const box of await page.locator(selector).evaluateAll(elements => elements.map(el => {
      const { left, top, right, bottom } = el.getBoundingClientRect()
      return { left, top, right, bottom }
    }))) {
      assert.ok(box.left >= outer.x - 1 && box.right <= outer.right + 1 && box.top >= outer.y - 1 && box.bottom <= outer.bottom + 1, `${selector} escapes ${container}: ${JSON.stringify(box)}`)
    }
  }
  async function compactSongs(rowSelector, coverSelector, titleSelector) {
    const song = await rect(rowSelector)
    const cells = song.height >= 64 && song.height <= 80 ? [] : await page.locator(rowSelector).first().evaluate(el => [...el.children].map(child => ({ className: child.className, height: child.getBoundingClientRect().height, width: child.getBoundingClientRect().width, display: getComputedStyle(child).display, whiteSpace: getComputedStyle(child).whiteSpace })))
    assert.ok(song.height >= 64 && song.height <= 80, `${rowSelector} must keep a compact 64–80px song row: ${song.height}; cells: ${JSON.stringify(cells)}`)
    assert.equal((await rect(coverSelector)).width, 48)
    assert.equal((await rect(coverSelector)).height, 48)
    const more = await rect(`${rowSelector} .m-track-more`)
    assert.equal(more.width, 48)
    assert.equal(more.height, 48)
    assert.ok(more.x >= song.x && more.right <= song.right && more.y >= song.y && more.bottom <= song.bottom, `${rowSelector} more button escapes its row`)
    assert.equal(await page.locator(titleSelector).first().evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis', `${titleSelector} must truncate long titles`)
    await page.locator(rowSelector).last().evaluate(el => el.scrollIntoView({ block: 'end' }))
    const last = await page.locator(rowSelector).last().boundingBox()
    assert.ok(last.y + last.height <= (await rect('.player-bar')).y, `${rowSelector} last song must clear the player`)
  }
  for (const [width, height] of [[320, 480], [320, 568], [375, 667], [390, 844], [430, 932], [720, 1024], [900, 1440]]) {
    await page.setViewportSize({ width, height })
    for (const safe of [false, true]) {
      await render(mini, true, safe)
      await within('.mini-player-open, .mini-player-play, .mini-player-queue, .mini-player-info', '.mobile-mini-player')
      assert.equal((await rect('.mobile-mini-player')).height, 64)
      assert.equal((await rect('.mini-player-artwork')).width, 44)
      assert.equal((await rect('.mini-player-play')).width, 48)
      assert.equal((await rect('.mini-player-queue')).height, 48)
      assert.equal(await page.locator('.mini-player-info strong').evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis')
      await render(choiceSheet, true, safe)
      await within('.mobile-choice-sheet header, .mobile-choice-body', '.mobile-choice-sheet')
      assert.ok((await rect('.mobile-choice-option')).height >= 48)
      assert.ok((await rect('.mobile-choice-sheet')).y >= (safe ? 44 : 24))
      await render(`<main class="mobile-page-content"><div class="mobile-page-content__inner">${library}</div></main>`, true, safe)
      await within('.library-quick-chip', '.library-quick-row')
      await within('.library-grid .library-card', '.library-grid')
      await within('.library-mobile-favorite :is(.library-card-cover, .library-card-info)', '.library-mobile-favorite .library-card')
      assert.equal(await page.locator('.library-card-more').count(), 0)
      assert.equal(await page.locator('.library-page').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'library cards must fit phone widths')
      await render(libraryOptions, true, safe)
      await within('.library-options-header, .mobile-choice-body', '.library-options-sheet')
      assert.ok((await rect('.library-options-sheet')).y >= (safe ? 44 : 24))
      assert.ok((await rect('.library-option')).height >= 48)
      await render(`<main class="mobile-page-content"><div class="mobile-page-content__inner">${settings}</div></main>`, true, safe)
      await within('.settings-row, .settings-row button', '.settings-panel')
      for (const selector of ['.switch-control', '.accent-picker button', '.settings-secondary-btn', '.mobile-setting-select']) assert.ok((await rect(selector)).height >= 48, `${selector} must have a 48px touch target`)
      assert.ok((await rect('.settings-row > div')).width >= 100, 'settings descriptions must retain readable width')
      assert.equal(await page.locator('.settings-panel').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'settings must not overflow horizontally')
      await render(playlistPanel, true, safe)
      await within('.song-menu__panel-head, .song-menu__playlists', '.song-menu')
      const playlistHeader = await rect('.song-menu__panel-head')
      await page.locator('.song-menu__playlists').evaluate(el => el.scrollTop = el.scrollHeight)
      assert.equal((await rect('.song-menu__panel-head')).y, playlistHeader.y, 'playlist return header must stay fixed while scrolling')
      assert.equal(await page.locator('.song-menu__body').evaluate(el => getComputedStyle(el).overflowY), 'hidden', 'playlist page must have only one scroll container')
      assert.ok(await page.locator('.song-menu__playlists').evaluate(el => el.scrollHeight > el.clientHeight), 'long playlist choices must scroll internally')
      assert.ok((await rect('.song-menu__playlist')).height >= 64)
      await render(shell + '<div class="toast">提示</div>', true, safe)
      assert.equal(await page.locator('.toast').evaluate(el => getComputedStyle(el).bottom), `${safe ? 166 : 132}px`)
      await within('.profile-home__quick button', '.mobile-page-content__inner')
      const quickTitle = await rect('.profile-home__quick button:nth-child(2) strong')
      assert.ok(quickTitle.width >= 70, `quick card title is too narrow at ${width}px: ${quickTitle.width}`)
      assert.equal((await rect('.profile-home__quick button')).height, 104)
      assert.equal(await page.locator('.profile-home__quick button').count(), 4, 'mobile home must retain all quick entries')
      assert.equal(await page.locator('.profile-home__quick-label').first().evaluate(el => getComputedStyle(el).display), 'none')
      assert.equal(await page.locator('.profile-home__dashboard').evaluate(el => getComputedStyle(el).display), 'none', 'mobile home must hide recent and weekly modules')
      assert.notEqual(await page.locator('.profile-home .user-profile-hero__level').evaluate(el => getComputedStyle(el).display), 'none', 'mobile library must retain the level badge')
      assert.equal((await rect('.user-profile-hero__avatar')).width, 76)
      assert.equal(await page.locator('.user-profile-hero__stats > div').count(), 4)
      assert.ok((await rect('.user-profile-hero')).height < 180, 'home profile must leave room for quick entries')
      await within('.user-profile-hero__avatar, .user-profile-hero h1, .user-profile-hero__stats', '.user-profile-hero')
      await within('.ctrl-btn--play, .action-btn--queue, .lcd-artwork', '.player-bar')
      await within('.lcd-meta__mobile-title, .lcd-meta__mobile-secondary', '.player-bar')
      assert.equal(await page.locator('.lcd-meta__mobile-secondary').evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis')
      assert.equal((await rect('.lcd-artwork')).width, 44)
      assert.equal((await rect('.ctrl-btn--play')).width, 48)
      assert.equal((await rect('.player-bar')).height, 64)
      assert.equal((await rect('.mobile-tab-bar')).height, safe ? 90 : 56)
      assert.equal((await rect('.mobile-tab-bar')).y - (await rect('.player-bar')).bottom, 0)
      assert.equal((await rect('.mobile-tab__icon')).height, 24)
      assert.equal(await page.locator('.mobile-tab.active').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)')
      await within('.mobile-tab__icon, .mobile-tab__label', '.mobile-tab-bar')
      assert.equal((await rect('.m-track-more')).width, 48)
      assert.equal((await rect('.nav-item')).height, 48)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(() => document.documentElement.classList.add('mobile-chrome-hidden'))
      await page.waitForFunction(expected => Math.abs(innerHeight - document.querySelector('.player-bar-wrap').getBoundingClientRect().bottom - expected) < 1, safe ? 90 : 56)
      await page.locator('.mobile-tab-bar').evaluate(el => el.getBoundingClientRect())
      assert.equal(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).pointerEvents), 'auto')
      const dock = await rect('.player-bar-wrap')
      assert.equal(await page.locator('.toast').evaluate(el => getComputedStyle(el).bottom), `${safe ? 166 : 132}px`)
      assert.ok(Math.abs(height - dock.bottom - (safe ? 90 : 56)) < 1, 'navigation stays visible and player remains above it')
      await page.evaluate(() => document.documentElement.classList.remove('mobile-chrome-hidden'))
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.player-bar-wrap')).transform === 'none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      assert.equal(await page.locator('.search-song-dur').first().evaluate(el => getComputedStyle(el).display), 'none')
      assert.equal(await page.locator('.search-song-row').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2)
      await page.locator('.search-song-row').last().evaluate(el => el.scrollIntoView({ block: 'end' }))
      assert.ok((await page.locator('.search-song-row').last().boundingBox()).y + (await page.locator('.search-song-row').last().boundingBox()).height <= (await rect('.player-bar')).y, 'scrollIntoView must clear the player')
      await page.evaluate(() => { document.documentElement.classList.add('mobile-keyboard-open'); document.documentElement.style.setProperty('--mobile-viewport-height', '280px') })
      assert.equal(await page.locator('.player-bar-wrap').evaluate(el => getComputedStyle(el).visibility), 'hidden')
      assert.equal(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).visibility), 'hidden')
      assert.equal(await page.locator('.toast').evaluate(el => getComputedStyle(el).bottom), `${safe ? 46 : 12}px`)
      assert.equal(await page.locator('.mobile-page-content').evaluate(el => getComputedStyle(el).scrollPaddingBottom), `${safe ? 58 : 24}px`)
      await render(shell.replace(home, searchToolbar + searchTabs), true, safe)
      await within('.search-clear', '.search-input-wrap')
      assert.equal((await rect('.search-clear')).width, 48)
      await page.locator('.search-input').focus()
      assert.equal(await page.locator('.search-input-wrap').evaluate(el => getComputedStyle(el).outlineWidth), '2px', 'search focus must remain visible around the whole field')
      await within('.search-category-tabs button', '.search-category-tabs')
      assert.equal(await page.locator('.search-category-tabs').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'all four search categories must fit without horizontal clipping')
      assert.equal((await rect('.search-category-tabs button')).height, 48)
      for (const wallpaper of [false, true]) {
        await render(shell.replace(home, home + libraryModal), true, safe)
        if (wallpaper) await page.locator('.app-shell').evaluate(el => el.classList.add('has-wallpaper'))
        const bar = await rect('.player-bar')
        const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return { covered: !!el?.closest('.library-modal-backdrop'), hit: el?.className, modal: document.querySelector('.library-modal-backdrop').getBoundingClientRect().toJSON(), main: getComputedStyle(document.querySelector('.main-area')).backdropFilter } }, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 })
        assert.ok(hit.covered, `library modal must cover and block the player (wallpaper ${wallpaper}): ${JSON.stringify(hit)}`)
      }
      await render(songMenu, true, safe)
      await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'))
      assert.ok((await rect('.song-menu')).y >= (safe ? 44 : 24) - 1, 'tall song menus must clear the top safe area')
      assert.equal((await rect('.song-menu__panel-head button')).width, 48)
      assert.equal(await page.locator('.song-menu__body').evaluate(el => getComputedStyle(el).overflowY), 'auto')
      assert.ok((await rect('.song-menu')).height <= height * .85 + 1)
      await render(player, true, safe)
      await within('.am-flying-cover, .am-track-info, .am-bottom-controls', '.apple-music-player')
      await within('.am-play-row button:visible', '.am-play-row')
      assert.ok((await rect('.am-progress-bar')).height >= 48)
      assert.equal((await rect('.am-play-btn')).width, 72)
      assert.equal((await rect('.am-ctrl-btn:visible')).width, 48)
      await page.locator('.apple-music-player').evaluate(el => el.classList.add('lyrics-mode'))
      await within('.am-flying-cover, .am-corner-info, .am-lyrics-area', '.apple-music-player')
      await render(`<div class="login-overlay"><div class="login-card">${'<p>登录表单</p>'.repeat(40)}</div></div>`, true, safe)
      const modal = await rect('.login-card')
      assert.ok(modal.y >= (safe ? 44 : 16) - 1 && modal.bottom <= height - (safe ? 34 : 16) + 1, 'login must clear safe areas')
      await page.evaluate(() => { document.documentElement.classList.add('mobile-keyboard-open'); document.documentElement.style.setProperty('--mobile-viewport-height', '280px') })
      assert.ok((await rect('.login-card')).bottom <= 280 - (safe ? 34 : 16) + 1, 'login must fit above keyboard')
      await render(`${pageShell(playlist)}`, true, safe)
      const title = await rect('.col-title')
      const songRow = await rect('.track-table tr')
      assert.ok(title.width >= songRow.width - 121, `playlist title must fill its grid column at ${width}px: ${JSON.stringify({ title, songRow })}`)
      assert.ok((await rect('.track-table tr')).height <= 80.1, `desktop cell heights must not double mobile song rows: ${JSON.stringify(await page.locator('.track-table tr').evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), css: [getComputedStyle(el).height, getComputedStyle(el).minHeight, getComputedStyle(el).padding, getComputedStyle(el).boxSizing, getComputedStyle(el).transform].join(";"), template: getComputedStyle(el).gridTemplateRows, cols: [...el.children].map(child => ({ name: child.className, height: child.getBoundingClientRect().height, row: getComputedStyle(child).gridRow, area: getComputedStyle(child).gridArea })) })))}`)
      await within('.m-track-more', '.track-table tr')
      await render(`${pageShell(playlistHero + playlist)}`, true, safe)
      await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'))
      await within('.playlist-cover, .playlist-hero-copy h1, .playlist-hero-actions', '.playlist-detail-hero')
      assert.ok((await rect('.playlist-detail-hero')).height <= (await rect('.playlist-cover')).height + 230, 'large playlist header keeps bounded metadata below its cover')
      assert.equal((await rect('.playlist-shuffle-btn')).height, 48)
      assert.equal(await page.locator('.track-table tr').evaluate(el => getComputedStyle(el).borderBottomWidth), '0px', 'mobile song rows must not retain desktop table dividers')
      for (const theme of ['light', 'dark']) {
        await render(pageShell(recent), true, safe, theme)
        await within('.recent-actions', '.recent-page .page-header')
        assert.equal((await rect('.play-all-btn')).height, 48)
        assert.equal(await page.locator('.recent-page').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'recent songs must not overflow horizontally')
        await compactSongs('.recent-page tbody tr', '.recent-page .track-cover-placeholder', '.recent-page .col-title')
        for (const [content, kind] of [[daily, 'daily'], [liked, 'liked']]) {
          await render(pageShell(content), true, safe, theme)
          await within(`.${kind}-hero-play`, `.${kind}-hero`)
          assert.equal((await rect(`.${kind}-hero-play`)).height, 48)
          assert.equal(await page.locator(`.${kind}-page`).evaluate(el => el.scrollWidth <= el.clientWidth), true, `${kind} page must not overflow horizontally`)
          assert.equal(await page.locator(`.${kind}-hero`).evaluate(el => getComputedStyle(el).boxShadow), 'none')
          await compactSongs(`.${kind}-song-row`, `.${kind}-song-cover`, `.${kind}-song-main strong`)
          if (kind === 'daily') {
            assert.ok((await rect('.daily-date-chip')).height >= 64)
            assert.equal(await page.locator('.daily-date-scroll').evaluate(el => el.scrollWidth > el.clientWidth), true, 'many daily dates must scroll inside their strip')
            assert.equal(await page.locator('.daily-hero h1').evaluate(el => getComputedStyle(el).display), 'none', 'daily page must use the shell heading')
          } else {
            assert.equal(await page.locator('.liked-hero-art').evaluate(el => getComputedStyle(el).display), 'none')
            assert.equal((await rect('.liked-skeleton-row > :nth-child(2)')).width, 44)
            assert.ok((await rect('.liked-skeleton-row')).height >= 64)
            assert.equal(await page.locator('.liked-skeleton-row').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'liked loading rows must fit phones')
          }
        }
        for (const cols of [53, 5, 2]) {
          await render(pageShell(report(cols)), true, safe, theme)
          assert.equal(await page.locator('.listening-report').evaluate(el => el.scrollWidth <= el.clientWidth), true, `report ${cols} columns must not overflow its page`)
          assert.equal((await rect('.report-header nav button')).height, 48)
          assert.equal((await rect('.wall-grid-heat .wall-cell')).width, 12)
          assert.equal((await rect('.wall-grid-heat .wall-cell')).height, 12)
          assert.equal((await rect('.wall-months')).width, (await rect('.wall-grid-heat')).width, 'month markers must align with day columns without adding empty chart space')
          const heatScroll = await page.locator('.wall-figure:not(.wall-figure-strip)').evaluate(el => el.scrollWidth > el.clientWidth)
          assert.equal(heatScroll, cols === 53 && (await rect('.wall-figure:not(.wall-figure-strip)')).width < 820, `report ${cols} columns must only scroll when the readable heatmap exceeds the viewport`)
          assert.equal((await rect('.track-ranking .rank-placeholder')).width, 44)
          assert.equal(await page.locator('.rank-copy strong').evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis')
          assert.equal(await page.locator('.report-header h1').evaluate(el => getComputedStyle(el).display), 'none', 'report must use the shell heading')
          await within('.report-header nav button', '.report-header nav')
          await within('.rank-copy, .rank-time', '.track-ranking li')
          for (const selector of ['.report-rhythm', '.report-rankings > section']) assert.equal(await page.locator(selector).first().evaluate(el => getComputedStyle(el).boxShadow), 'none')
        }
      }
    }
    console.log(`mobile layout: ${width}×${height} passed (plain + safe area, keyboard, lyrics, recent/daily/liked/report light + dark)`)
  }
  const colorFailures = []
  for (const theme of ['light', 'dark']) {
    for (const name of ['red', 'berry', 'violet', 'blue', 'teal', 'orange', 'cover']) {
      const accent = getAccentProperties(name, theme, { r: 36, g: 152, b: 91 })['--accent']
      await render(pageShell(home + searchTabs + recent + daily + liked + playlistHero + playlist + report()) + libraryModal + songMenu + '<div class="queue-panel queue-panel-mobile-visible"><button class="queue-clear-btn">清除</button><div class="queue-item active"><div class="queue-item-title">当前歌曲</div></div></div>' + mini + choiceSheet + libraryOptions, true, false, theme, accent)
      const ratios = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')
        function luminance(color) {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = color
          ctx.fillRect(0, 0, 1, 1)
          const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255)
          const linear = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
        }
        const pairs = [
          ['.library-option--danger', '.library-options-sheet'],
          ['.mini-player-info strong', '.mobile-mini-player'],
          ['.mini-player-play', '.mini-player-play'],
          ['.mobile-choice-option.active', '.mobile-choice-option.active'],
          ['.lcd-meta__mobile-title', '.player-bar'],
          ['.lcd-meta__mobile-secondary', '.player-bar'],
          ['.action-btn--queue', '.player-bar'],
          ['.ctrl-btn--play', '.ctrl-btn--play'],
          ['.playlist-play-btn', '.playlist-play-btn'],
          ['.playlist-shuffle-btn', '.playlist-shuffle-btn'],
          ['.playlist-meta', '.main-area'],
          ['.profile-home__quick strong', '.profile-home__quick button'],
          ['.profile-home__quick em', '.profile-home__quick button'],
          ['.mobile-tab.active', '.mobile-tab.active'],
          ['.nav-item', '.nav-item'],
          ['.user-profile-hero h1', '.user-profile-hero'],
          ['.user-profile-hero p', '.user-profile-hero'],
          ['.user-profile-hero__stats span', '.user-profile-hero'],
          ['.recent-page .subtitle', '.main-area'],
          ['.recent-page .play-all-btn', '.recent-page .play-all-btn'],
          ['.recent-page .col-artist', '.recent-page tbody tr'],
          ['.daily-hero p', '.daily-hero'],
          ['.daily-hero-stats span', '.daily-hero-stats span'],
          ['.daily-hero-play', '.daily-hero-play'],
          ['.daily-date-chip small', '.daily-date-chip'],
          ['.daily-song-main em', '.daily-song-row'],
          ['.daily-song-main .artist-link', '.daily-song-row'],
          ['.liked-hero p', '.liked-hero'],
          ['.liked-hero-meta', '.liked-hero'],
          ['.liked-hero-play', '.liked-hero-play'],
          ['.liked-song-main em', '.liked-song-row'],
          ['.liked-song-main .artist-link', '.liked-song-row'],
          ['.report-header p', '.main-area'],
          ['.hero-copy p', '.report-hero'],
          ['.report-numbers span', '.report-hero'],
          ['.report-header nav button.active', '.report-header nav button.active'],
          ['.report-header nav button:not(.active)', '.report-header nav'],
          ['.rank-copy small', '.report-rankings:not(.report-facts) > section'],
          ['.queue-item-title', '.queue-item.active'],
          ['.queue-clear-btn', '.queue-panel'],
          ['.library-modal-btn-confirm', '.library-modal-btn-confirm'],
          ['.search-category-tabs button.active', '.search-category-tabs button.active'],
          ['.song-menu__item.primary', '.song-menu'],
        ]
        return pairs.map(([text, surface]) => {
          const fg = luminance(getComputedStyle(document.querySelector(text)).color)
          const layers = []
          for (let node = document.querySelector(surface); node; node = node.parentElement) layers.unshift(getComputedStyle(node).backgroundColor)
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, 1, 1)
          for (const color of layers) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1) }
          const background = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
          const bg = luminance('rgb(' + background.join(',') + ')')
          return { text, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) }
        })
      })
      for (const { text, ratio } of ratios) if (ratio < 4.5) colorFailures.push(`${theme}/${name} ${text} contrast ${ratio.toFixed(2)} < 4.5`)
    }
  }
  assert.deepEqual(colorFailures, [], 'all accent themes must keep readable text')
  console.log('mobile color: all 7 accents in light/dark meet 4.5:1 text contrast')
  await page.setViewportSize({ width: 320, height: 480 })
  for (const theme of ['light', 'dark']) {
    await render('<div class="am-secondary-sheet"><div class="am-secondary-header"><strong class="am-secondary-title">播放器主题</strong><button class="am-secondary-close">关闭</button></div><button class="am-secondary-row active">卡片封面</button><button class="am-secondary-row">黑胶唱片</button></div>', true, true, theme)
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'))
    await within('.am-secondary-header, .am-secondary-row', '.am-secondary-sheet')
    assert.equal((await rect('.am-secondary-close')).height, 48)
    assert.ok((await rect('.am-secondary-row')).height >= 48)
    await render('<div class="queue-panel queue-panel-mobile-visible"><button class="queue-close-btn">关闭</button><div class="queue-list"><div class="queue-item">播放队列</div></div></div>', true, true, theme)
    await within('.queue-list, .queue-close-btn', '.queue-panel')
    assert.equal((await rect('.queue-close-btn')).height, 48)
    await render('<div class="confirm-overlay"><div class="confirm-card"><div class="confirm-title">确认操作</div><div class="confirm-actions"><button class="confirm-btn confirm-btn-cancel">取消</button><button class="confirm-btn confirm-btn-confirm">确定</button></div></div></div>', true, true, theme)
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'))
    await within('.confirm-btn', '.confirm-card')
    assert.equal((await rect('.confirm-btn')).height, 48)
  }
  console.log('mobile panels: settings, queue and confirmation passed in light/dark')
  await render('<div class="am-secondary-sheet compact" data-bottom-panel><div class="am-secondary-list"><button class="am-secondary-row active">无损</button></div></div>', true, true)
  assert.equal(await page.locator('.am-secondary-list').evaluate(el => getComputedStyle(el).paddingBottom), '8px', 'safe area belongs to the outer sheet only')
  const selected = await page.locator('.am-secondary-row.active').evaluate(el => getComputedStyle(el).backgroundColor)
  await page.locator('.am-secondary-row.active').hover()
  assert.equal(await page.locator('.am-secondary-row.active').evaluate(el => getComputedStyle(el).backgroundColor), selected, 'selected tone must persist when hovered')
  for (const [width, height] of [[320, 480], [390, 844], [900, 1440]]) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark']) {
      await render(`<div class="sort-sheet"><button class="m-sheet-handle">关闭</button><header><h2>歌曲排序</h2><button class="sort-sheet-done">完成</button></header><div class="sort-sheet-body"><div class="sort-sheet-options">${['加入时间', '歌曲', '歌手', '时长'].map(label => `<button class="sort-sheet-option active">${label}</button>`).join('')}</div><div class="sort-sheet-direction"><button class="active">升序</button><button>降序</button></div></div></div>`, true, true, theme)
      await within('.sort-sheet header, .sort-sheet-body, .sort-sheet-direction button', '.sort-sheet')
      assert.ok((await rect('.sort-sheet')).height <= height * .85 + 1)
      assert.ok((await rect('.sort-sheet-option')).height >= 48)
      assert.ok((await rect('.sort-sheet-direction button')).height >= 48)
      await render(shell, true, true, theme)
      const pageWidth = (await rect('.mobile-page-content')).width
      const pageOverflow = await page.locator('.mobile-page-content').evaluate(el => getComputedStyle(el).overflowY)
      await page.evaluate(() => document.documentElement.classList.add('mobile-panel-open'))
      assert.equal(await page.locator('.mobile-page-content').evaluate(el => getComputedStyle(el).overflowY), pageOverflow, 'panels must preserve the scroll container width')
      assert.equal((await rect('.mobile-page-content')).width, pageWidth, 'panels must not resize the background page')
    }
  }
  const ts = require('typescript')
  const chromeSource = ts.transpileModule(await read('src/lib/app/scroll-chrome.ts'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
  await render(shell, true)
  await page.evaluate(async source => {
    const { scrollChrome } = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`)
    const root = document.documentElement
    const scroller = document.querySelector('.mobile-page-content')
    const action = scrollChrome(scroller)
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    scroller.dispatchEvent(new WheelEvent('wheel'))
    scroller.scrollTop = 100
    await wait(120)
    if (!root.classList.contains('mobile-chrome-hidden')) throw new Error('first wheel must hide navigation after scroll')
    root.classList.add('mobile-panel-open')
    await wait(1100)
    if (!root.classList.contains('mobile-chrome-hidden')) throw new Error('panel must suspend navigation restore')
    root.classList.remove('mobile-panel-open')
    await wait(1100)
    if (root.classList.contains('mobile-chrome-hidden')) throw new Error('navigation must restore after panel closes')
    scroller.scrollTop = 200
    await wait(30)
    if (root.classList.contains('mobile-chrome-hidden')) throw new Error('programmatic scroll must not hide navigation')
    scroller.dispatchEvent(new WheelEvent('wheel'))
    scroller.scrollTop = 300
    await wait(120)
    root.classList.add('mobile-panel-open')
    await Promise.resolve()
    scroller.dispatchEvent(new Event('mobile-view-change'))
    if (!root.classList.contains('mobile-chrome-hidden')) throw new Error('navigation reset must wait for panel exit')
    root.classList.remove('mobile-panel-open')
    await Promise.resolve()
    if (root.classList.contains('mobile-chrome-hidden')) throw new Error('pending view reset must restore navigation after panel exit')
    action.destroy()
  }, chromeSource)
  const feedbackSource = ts.transpileModule(await read('src/lib/app/mobile-feedback.ts'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
  await render(mini, true)
  await page.evaluate(async source => {
    const { mobileFeedback } = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`)
    window.feedbackCheck = mobileFeedback(document.body)
  }, feedbackSource)
  const play = await rect('.mini-player-play')
  await page.mouse.move(play.x + 24, play.y + 24)
  await page.mouse.down()
  assert.equal(await page.locator('.mini-player-play').getAttribute('data-mobile-pressed'), 'control')
  await page.mouse.move(play.x + 24, play.y + 40)
  assert.equal(await page.locator('.mini-player-play').getAttribute('data-mobile-pressed'), null, 'scroll movement must cancel feedback')
  await page.mouse.up()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(play.x + 24, play.y + 24)
  await page.mouse.down()
  assert.equal(await page.locator('.mini-player-play').evaluate(el => getComputedStyle(el).scale), '1', 'reduced motion must not scale pressed controls')
  await page.mouse.up()
  await page.evaluate(() => window.feedbackCheck.destroy())
  await render('<button class="music-cover-card">歌单</button>', true)
  await page.evaluate(async source => {
    const { mobileFeedback } = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`)
    window.feedbackCheck = mobileFeedback(document.body)
  }, feedbackSource)
  await page.locator('.music-cover-card').hover()
  await page.mouse.down()
  assert.equal(await page.locator('.music-cover-card').evaluate(el => getComputedStyle(el).transform), 'none', 'cards must not stack transform and scale feedback')
  await page.mouse.move(20, 100)
  assert.equal(await page.locator('.music-cover-card').getAttribute('data-mobile-pressed'), null)
  assert.equal(await page.locator('.music-cover-card').evaluate(el => getComputedStyle(el).transform), 'none', 'cancelled presses must not leave an active transform')
  await page.mouse.up()
  await page.evaluate(() => window.feedbackCheck.destroy())
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const motionSource = ts.transpileModule(await read('src/lib/app/desktop-motion.ts'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*mobile-interaction.*\r?\n/m, '')
  await render(shell, true)
  await page.evaluate(async source => {
    const { dialogFocus } = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`)
    const app = document.querySelector('.app-shell')
    const previous = document.querySelector('.mobile-tab')
    previous.focus()
    function panel(className) {
      const el = document.createElement('div')
      el.className = className
      el.innerHTML = '<button>关闭</button>'
      document.body.append(el)
      return el
    }
    const first = panel('song-menu')
    let closed = 0
    const one = dialogFocus(first, () => closed++)
    await Promise.resolve()
    if (!app.inert) throw new Error('menu must isolate background')
    const second = panel('sort-sheet')
    const two = dialogFocus(second, () => {})
    await Promise.resolve()
    if (closed !== 1 || !first.hidden) throw new Error('new bottom panel must replace the previous one')
    one.destroy()
    first.remove()
    if (!app.inert || !document.documentElement.classList.contains('mobile-panel-open')) throw new Error('previous exit must not unlock the new panel')
    two.destroy()
    second.remove()
    await Promise.resolve()
    if (app.inert || document.documentElement.classList.contains('mobile-panel-open')) throw new Error('last panel must release background')
  }, motionSource)
  console.log('mobile sheets: sort geometry, background locks and overlapping exit cleanup passed')
  await page.setViewportSize({ width: 1280, height: 800 })
  await render(shell, false)
  assert.equal(await page.locator('.profile-home__quick').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 4)
  assert.notEqual(await page.locator('.profile-home__dashboard').evaluate(el => getComputedStyle(el).display), 'none', 'PC must retain recent and weekly modules')
  assert.ok((await rect('.profile-home__dashboard')).height > 0)
  assert.notEqual(await page.locator('.profile-home .user-profile-hero__level').evaluate(el => getComputedStyle(el).display), 'none', 'PC must retain the level badge')
  assert.equal((await rect('.lcd-artwork')).width, 48)
  await page.setViewportSize({ width: 900, height: 1440 })
  assert.equal(await page.locator('.search-song-row').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3)
  console.log('desktop layout: original card, artwork and song columns passed')
} finally {
  await browser.close()
}
