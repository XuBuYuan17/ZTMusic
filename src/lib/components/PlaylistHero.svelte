<script lang="ts">
  import { coverUrl, progressiveCover } from '../utils/image.ts'
  import { flyCover } from '../app/desktop-motion.ts'
  import { responsive } from '../utils/responsive.ts'
  import { player } from '../stores/player.svelte.ts'
  import { tick } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import PlaylistActionSheet, { playlistPortal, type PlaylistAction } from './PlaylistActionSheet.svelte'
  import { heroCreatorName, heroMetaText, heroPlayback } from './playlist-hero-content.ts'
  import Icon from './ui/Icon.svelte'

  interface HeroDetail {
    id?: SongId
    name: string
    coverImgUrl?: string
    picUrl?: string
    creator?: unknown
    description?: string
    trackIds?: unknown[]
    tracks?: unknown[]
  }

  let {
    detail = null,
    loading = false,
    loadingMore = false,
    heroColor = '#141414',
    detailType = '歌单',
    coverIsBundled = false,
    totalCount = 0,
    visibleCount = 0,
    totalDuration = 0,
    showMenu = $bindable(false),
    onBack,
    onPlayAll,
    onShuffle,
    onQueue,
    onNext,
    onMore,
    onShare,
    onTools,
    favorite = false,
    favoriteDisabled = false,
    favoriteLabel = '收藏歌单',
    onFavorite,
  }: {
    detail?: HeroDetail | null
    loading?: boolean
    loadingMore?: boolean
    heroColor?: string
    detailType?: string
    coverIsBundled?: boolean
    totalCount?: number
    visibleCount?: number
    totalDuration?: number
    showMenu?: boolean
    onBack?: () => void
    onPlayAll?: () => void
    onShuffle?: () => void
    onQueue?: () => void
    onNext?: () => void
    /** 由页面统一提供的「更多」入口；顶部栏与内容区都走这里 */
    onMore?: () => void
    /** 由页面统一提供的分享入口 */
    onShare?: () => void
    onTools?: () => void
    favorite?: boolean
    favoriteDisabled?: boolean
    favoriteLabel?: string
    onFavorite?: () => void
  } = $props()

  const cover = $derived(detail?.coverImgUrl || detail?.picUrl || '')
  // 固定推荐封面来自打包资源；API 图片仍使用原来的 URL 校验和渐进加载。
  const resolvedCover = (size: number) => coverIsBundled ? cover : coverUrl(cover, size)
  function loadCover(node: HTMLImageElement, options: { source: string; size: number; bundled: boolean }) {
    let action: ReturnType<typeof progressiveCover> | null = null
    function apply(next: typeof options) {
      action?.destroy(); action = null
      if (next.bundled) node.src = next.source
      else action = progressiveCover(node, next)
    }
    apply(options)
    return { update: apply, destroy() { action?.destroy() } }
  }
  const creator = $derived(rec(detail?.creator))
  const playlistTrackIds = $derived((detail?.trackIds?.length ? detail.trackIds : detail?.tracks || []).map(trackIdOf).filter((id): id is SongId => id !== null))
  const containsCurrentTrack = $derived(player.id != null && player.id !== 0 && playlistTrackIds.some(id => String(id) === String(player.id)))
  // 播放态沿用播放器状态来源；按钮语义（暂停/继续 vs 播放全部）由纯函数决定，见 playlist-hero-content.ts
  const playback = $derived(heroPlayback({
    containsCurrentTrack,
    playing: player.playing,
    visibleCount,
    compact: $responsive.isMobile,
  }))
  let menuClosing = $state(false)
  let pendingAction: (() => void) | null = null
  // 打开由页面驱动（顶部栏和 hero 按钮共用 showMenu），这里只负责清掉上一次的退场标记
  $effect(() => { if (showMenu) menuClosing = false })
  function closeMenu(action: (() => void) | null = null) { pendingAction = action; menuClosing = true }
  function finishMenu() { showMenu = false; const action = pendingAction; pendingAction = null; if (action) void tick().then(action) }
  function toggleHeroPlayback(): void {
    if (playback.mode === 'toggle') player.togglePlay()
    else onPlayAll?.()
  }
  const menuActions = $derived<PlaylistAction[]>([
    { label: playback.menuLabel, icon: playback.icon, disabled: playback.disabled, onSelect: () => closeMenu(toggleHeroPlayback) },
    ...(onShuffle ? [{ label: '随机播放', icon: 'shuffle-lg', disabled: !visibleCount, onSelect: () => closeMenu(onShuffle) }] : []),
    ...(onQueue ? [{ label: '加入播放队列', icon: 'add', disabled: !visibleCount, onSelect: () => closeMenu(onQueue) }] : []),
    ...(onNext ? [{ label: '下一首插播', icon: 'queue', disabled: !visibleCount, onSelect: () => closeMenu(onNext) }] : []),
    ...(onShare ? [{ label: `分享${detailType}`, icon: 'share', disabled: detail?.id == null, onSelect: () => closeMenu(onShare) }] : []),
    ...(onTools ? [{ label: '搜索与排序', icon: 'search', onSelect: () => closeMenu(onTools) }] : []),
    ...(detail?.description ? [{ label: `${detailType}简介`, icon: 'info', onSelect: () => closeMenu(() => descriptionExpanded = true) }] : []),
  ])
  const creatorName = $derived(heroCreatorName(detail?.creator))
  let descriptionExpanded = $state(false)
  let coverFailed = $state(false)
  $effect(() => { detail; descriptionExpanded = false; coverFailed = false })

  function trackIdOf(value: unknown): SongId | null {
    if (typeof value === 'string' || typeof value === 'number') return value
    const record = rec(value)
    return typeof record?.id === 'string' || typeof record?.id === 'number' ? record.id : null
  }

  // 展示用格式化（时长/元信息）见 playlist-hero-content.ts
  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }
</script>

{#if !detail}
  <div class="playlist-detail-hero playlist-detail-hero--loading">
    <div class="playlist-cover skeleton-block"></div>
    <div class="playlist-hero-copy">
      <div class="playlist-hero-topline">
        {#if onBack}<button class="playlist-back-btn" onclick={onBack} aria-label="返回">
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
          <span>返回</span>
        </button>{/if}
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-line medium" style="height:52px;margin-bottom:12px"></div>
      <div class="playlist-meta skeleton-line narrow"></div>
      <div class="playlist-desc skeleton-line"></div>
    </div>
  </div>
{:else}
  <div class="playlist-detail-hero" class:is-syncing={loading} style={`--playlist-hero-color:${heroColor}`}>
    {#if cover}<div class="playlist-hero-backdrop" style={`background-image:url("${resolvedCover(320)}")`} aria-hidden="true"></div>{/if}
    <div class="playlist-hero-wash" aria-hidden="true"></div>
    {#if cover && $responsive.isMobile}
      <div class="playlist-cover-open">
        {#if coverFailed}<span class="playlist-cover playlist-cover--empty"><Icon name="music" size={36} /></span>{:else}<img class="playlist-cover" use:loadCover={{ source: cover, size: 640, bundled: coverIsBundled }} alt={detail.name} referrerpolicy="no-referrer" fetchpriority="high" use:flyCover onerror={() => coverFailed = true} />{/if}
      </div>
    {:else if cover}
      <img class="playlist-cover" use:loadCover={{ source: cover, size: 320, bundled: coverIsBundled }} alt={detail.name} referrerpolicy="no-referrer" fetchpriority="high" use:flyCover />
    {:else}
      <div class="playlist-cover playlist-cover--empty">
        <Icon name="music" size={42} strokeWidth={1.3} />
      </div>
    {/if}
    {#if $responsive.isMobile}
      <div class="playlist-playing-record" class:visible={containsCurrentTrack && player.playing} aria-hidden="true">
        <div class="playlist-playing-record__disc">
          {#if player.cover}<img src={coverUrl(player.cover, 200)} alt="" referrerpolicy="no-referrer" />{/if}
        </div>
      </div>
    {/if}
    <div class="playlist-hero-copy">
      <div class="playlist-hero-topline">
        {#if onBack}<button class="playlist-back-btn" onclick={onBack} aria-label="返回">
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
          <span>返回</span>
        </button>{/if}
        <div class="playlist-kicker">{detailType}</div>
      </div>
      <h1>{detail.name}</h1>
      <div class="playlist-mobile-creator">{creatorName}</div>
      <div class="playlist-meta">
        {#if creator?.avatarUrl}<img class="playlist-meta-avatar" src={coverUrl(creator.avatarUrl as string, 48)} alt="" referrerpolicy="no-referrer" />{/if}
        {heroMetaText({ creatorName, totalCount, loading, totalDuration, loadingMore })}
      </div>
      {#if detail.description && (!$responsive.isMobile || descriptionExpanded)}
        {#if $responsive.isMobile}
          <div class="playlist-desc-wrap"><div class="playlist-desc" class:is-expanded={descriptionExpanded}>{detail.description}</div><button class="playlist-desc-toggle" type="button" aria-label={descriptionExpanded ? '收起简介' : '展开简介'} aria-expanded={descriptionExpanded} onclick={() => descriptionExpanded = !descriptionExpanded}>{descriptionExpanded ? '收起' : '展开'}<Icon name="chevron-down" size={16} /></button></div>
        {:else}
          <div class="playlist-desc" title={detail.description}>{detail.description}</div>
        {/if}
      {/if}
      <div class="playlist-hero-actions">
        <button class="playlist-play-btn" aria-label={playback.pressed ? '暂停播放' : '播放全部'} aria-pressed={playback.pressed} onclick={toggleHeroPlayback} disabled={playback.disabled}>
          <Icon name={playback.icon} size={17} fill="currentColor" />
          <span>{playback.label}</span>
        </button>
        {#if onShuffle}
          <button class="playlist-shuffle-btn" aria-label="随机播放" onclick={onShuffle} disabled={!visibleCount}>
            <Icon name={$responsive.isMobile ? 'shuffle-lg' : 'shuffle'} size={$responsive.isMobile ? 24 : 16} />
            <span>随机播放</span>
          </button>
        {/if}
        {#if onFavorite}<button class="playlist-favorite-btn" type="button" aria-label={favoriteLabel} title={favoriteLabel} aria-pressed={favorite} disabled={favoriteDisabled} onclick={onFavorite}><Icon name={favorite ? 'heart-filled' : 'heart'} size={21} fill={favorite ? 'currentColor' : 'none'} /></button>{/if}
        {#if onMore}<button class="playlist-more-btn" type="button" aria-label={`${detailType}操作`} aria-haspopup="dialog" aria-expanded={showMenu} onclick={() => onMore?.()}><Icon name="more" size={24} /></button>{/if}
      </div>
    </div>
  </div>
{/if}

{#if showMenu && detail}
  <div class="library-options-portal" use:playlistPortal>
  <PlaylistActionSheet show={!menuClosing} title={detail.name} cover={cover} {coverIsBundled} actions={menuActions} label={`${detailType}操作`} bottomOnDesktop
    onPlay={visibleCount || containsCurrentTrack ? () => closeMenu(toggleHeroPlayback) : undefined} onClose={() => closeMenu()} onClosed={finishMenu} />
  </div>
{/if}

<style>
  /* 操作入口常驻声明，显隐交给布局：窄布局（下一段 :global 规则）把它显示出来 */
  .playlist-more-btn { display: none; }
  .playlist-favorite-btn { display: none; }
  .playlist-mobile-creator { display: none; }
  .playlist-detail-hero {
    position: relative;
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr);
    align-items: end;
    gap: 20px;
    margin: -12px -12px 0;
    padding: 20px;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-lg);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--playlist-hero-color, #141414) 16%, transparent), transparent 62%),
      color-mix(in srgb, var(--bg-elevated) 72%, transparent);
    overflow: hidden;
    transform-origin: 24% 0;
    animation: playlistHeroIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    transition: background 0.45s ease, border-color 0.3s ease;
  }

  .playlist-detail-hero::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 30%, color-mix(in srgb, white 7%, transparent) 48%, transparent 66%);
    transform: translateX(-110%);
  }

  .playlist-detail-hero.is-syncing::after,
  .playlist-detail-hero--loading::after {
    animation: playlistHeroScan 1.4s ease-in-out infinite;
  }

  .playlist-detail-hero--loading {
    --playlist-hero-color: var(--accent);
  }

  .playlist-back-btn {
    min-width: 58px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 13px 0 2px;
    border: 0;
    border-right: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--text-tertiary);
    animation: playlistHeroControlIn 0.34s ease-out 0.08s both;
    transition: color 0.18s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .playlist-back-btn:hover {
    color: var(--text);
    transform: translateX(-2px);
  }

  .playlist-back-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 56%, transparent);
    outline-offset: 3px;
  }

  .playlist-back-btn span {
    font-size: 13px;
    font-weight: 500;
  }

  .playlist-cover {
    width: 156px;
    height: 156px;
    display: grid;
    place-items: center;
    object-fit: cover;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-layer) 78%, transparent);
    box-shadow: var(--shadow-lg);
    animation: playlistCoverIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.04s both;
  }

  .playlist-cover--empty {
    color: var(--text-tertiary);
  }

  .playlist-hero-copy {
    min-width: 0;
    display: grid;
    gap: 7px;
    padding-right: 8px;
    animation: playlistHeroCopyIn 0.48s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
  }

  .playlist-hero-topline {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .playlist-hero-topline .skeleton-line {
    width: 72px;
    margin: 0;
  }

  .playlist-kicker {
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .6px;
    text-transform: uppercase;
  }

  .playlist-hero-copy h1 {
    margin: 0;
    max-width: 820px;
    font-size: 30px;
    line-height: 1.12;
    letter-spacing: 0;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .playlist-meta {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .playlist-desc {
    max-width: 760px;
    color: var(--text-tertiary);
    font-size: 13px;
    line-height: 1.45;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .playlist-play-btn {
    width: fit-content;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding: 0 17px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
  }

  .playlist-play-btn:disabled {
    opacity: .48;
    cursor: default;
  }

  @keyframes playlistHeroIn {
    from { opacity: 0; transform: translateY(10px) scale(0.992); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes playlistCoverIn {
    from { opacity: 0; transform: translateY(12px) scale(0.92); filter: saturate(0.7); }
    to { opacity: 1; transform: translateY(0) scale(1); filter: saturate(1); }
  }

  @keyframes playlistHeroCopyIn {
    from { opacity: 0; transform: translateX(12px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes playlistHeroControlIn {
    from { opacity: 0; transform: scale(0.88); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes playlistHeroScan {
    0% { transform: translateX(-110%); }
    62%, 100% { transform: translateX(110%); }
  }

  :global(html.mobile-runtime) .playlist-detail-hero { display: flex; flex-direction: column; align-items: center; gap: 18px; margin: 0; padding: 8px 0 16px; border: 0; border-radius: 0; background: transparent; animation: none; overflow: visible; }
  :global(html.mobile-runtime) .playlist-detail-hero::after { content: none; }
  :global(html.mobile-runtime) .playlist-back-btn { display: none; }
  :global(html.mobile-runtime) .playlist-cover { width: min(64vw, 320px); height: auto; aspect-ratio: 1; border-radius: var(--radius-md); box-shadow: var(--shadow-md); animation: none; transform: none; }
  :global(html.mobile-runtime) .playlist-cover-open { width: min(64vw, 320px); aspect-ratio: 1; height: auto; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; }
  :global(html.mobile-runtime) .playlist-cover-open .playlist-cover { display: grid; }
  :global(html.mobile-runtime) .playlist-hero-copy { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; min-width: 0; padding: 0; animation: none; text-align: center; }
  :global(html.mobile-runtime) .playlist-hero-topline { display: none; }
  :global(html.mobile-runtime) .playlist-hero-copy h1 { min-width: 0; max-width: 100%; margin: 0; font-size: 24px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; line-clamp: 2; -webkit-line-clamp: 2; }
  :global(html.mobile-runtime) .playlist-mobile-creator { display: block; max-width: 100%; font-size: 18px; line-height: 24px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(html.mobile-runtime) .playlist-meta { display: none; }
  :global(html.mobile-runtime) .playlist-desc-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: 8px; width: 100%; min-width: 0; text-align: left; }
  :global(html.mobile-runtime) .playlist-desc { font-size: 14px; }
  :global(html.mobile-runtime) .playlist-desc.is-expanded { display: block; overflow: visible; white-space: pre-line; }
  :global(html.mobile-runtime) .playlist-desc-toggle { min-width: 48px; min-height: 48px; border: 0; color: var(--md-primary); background: transparent; font-size: 13px; }
  :global(html.mobile-runtime) .playlist-desc-toggle[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
  :global(html.mobile-runtime) .playlist-hero-actions { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; gap: 16px; width: 100%; margin-top: 12px; }
  :global(html.mobile-runtime) .playlist-play-btn { grid-column: 2; grid-row: 1; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 52px; padding: 0 12px; border-radius: 999px; font-size: 18px; background: var(--text); color: var(--bg); box-shadow: none; }
  :global(html.mobile-runtime) .playlist-shuffle-btn, :global(html.mobile-runtime) .playlist-more-btn { display: grid; place-items: center; width: 48px; height: 48px; align-self: center; padding: 0; border: 0; border-radius: 999px; background: var(--bg-surface); color: var(--text); }
  :global(html.mobile-runtime) .playlist-play-btn:hover:not(:disabled) { background: var(--text); filter: brightness(.95); }
  :global(html.mobile-runtime) .playlist-shuffle-btn { grid-column: 1; grid-row: 1; }
  :global(html.mobile-runtime) .playlist-shuffle-btn span { display: none; }
  :global(html.mobile-runtime) .playlist-more-btn { grid-column: 3; grid-row: 1; }
  :global(html.mobile-runtime) .playlist-more-btn :global(svg) { rotate: 90deg; }

  @media (max-width: 680px) {
    .playlist-detail-hero {
      grid-template-columns: 108px minmax(0, 1fr);
      gap: 14px;
      padding: 16px;
    }

    .playlist-cover {
      width: 108px;
      height: 108px;
    }

    .playlist-hero-copy h1 {
      font-size: 23px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html.mobile-runtime) .playlist-cover { transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-detail-hero,
    .playlist-back-btn,
    .playlist-cover,
    .playlist-hero-copy,
    .playlist-detail-hero::after {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  .playlist-hero-backdrop,
  .playlist-hero-wash,
  .playlist-meta-avatar,
  .playlist-shuffle-btn {
    display: none;
  }

  /* 桌面保留宽屏并排布局，控件与移动端使用同一层级。 */
  :global(html:not(.mobile-runtime)) .playlist-detail-hero {
    grid-template-columns: 160px minmax(0, 1fr);
    gap: 24px;
    min-height: 0;
    margin: 0;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--text);
    background: var(--bg-surface);
    isolation: isolate;
    animation: playlistHeroFade var(--motion-panel) var(--ease-out) backwards;
  }

  :global(html:not(.mobile-runtime)) .playlist-detail-hero::after {
    display: none;
  }

  :global(html:not(.mobile-runtime)) .playlist-detail-hero--loading {
    color: var(--text);
    background: var(--bg-surface);
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-backdrop {
    position: absolute;
    inset: -24px;
    z-index: -2;
    display: block;
    background-position: center;
    background-size: cover;
    filter: blur(18px) saturate(.9);
    opacity: .12;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-wash {
    position: absolute;
    inset: 0;
    z-index: -1;
    display: block;
    background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
  }

  :global(html:not(.mobile-runtime)) .playlist-cover {
    width: 160px;
    height: 160px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    transform: none;
    opacity: 1;
    animation: none;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-copy {
    gap: 8px;
    padding-right: 0;
    opacity: 1;
    animation: playlistHeroFade var(--motion-panel) var(--ease-out) 60ms backwards;
  }

  :global(html:not(.mobile-runtime)) .playlist-back-btn {
    border-right-color: color-mix(in srgb, currentColor 22%, transparent);
    color: color-mix(in srgb, currentColor 72%, transparent);
    animation: none;
    transition: color var(--motion-release) var(--ease-out), transform var(--motion-release) var(--ease-out);
  }

  :global(html:not(.mobile-runtime)) .playlist-back-btn:hover {
    color: inherit;
  }

  :global(html:not(.mobile-runtime)) .playlist-kicker {
    color: color-mix(in srgb, currentColor 72%, transparent);
    letter-spacing: .1em;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-copy h1 {
    font-size: clamp(24px, 3vw, 36px);
    font-weight: 700;
    line-height: 1.08;
  }

  :global(html:not(.mobile-runtime)) .playlist-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
  }

  :global(html:not(.mobile-runtime)) .playlist-meta-avatar {
    width: 20px;
    height: 20px;
    display: block;
    border-radius: 50%;
    object-fit: cover;
  }

  :global(html:not(.mobile-runtime)) .playlist-desc {
    color: var(--text-secondary);
    line-clamp: 1;
    -webkit-line-clamp: 1;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
    animation: playlistHeroFade var(--motion-panel) var(--ease-out) 120ms backwards;
  }

  :global(html:not(.mobile-runtime)) .playlist-play-btn,
  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0 24px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    transition: filter var(--motion-release) var(--ease-out), background-color var(--motion-release) var(--ease-out);
  }

  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn {
    color: var(--text);
    background: var(--bg-layer);
  }

  :global(html:not(.mobile-runtime)) .playlist-more-btn { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: var(--text); background: var(--bg-layer); }
  :global(html:not(.mobile-runtime)) .playlist-favorite-btn { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: var(--text); background: var(--bg-layer); }
  :global(html:not(.mobile-runtime)) .playlist-favorite-btn[aria-pressed="true"] { color: var(--accent); }
  :global(html:not(.mobile-runtime)) .playlist-favorite-btn:disabled { opacity: .4; cursor: not-allowed; }
  :global(html:not(.mobile-runtime)) .playlist-more-btn :global(svg) { rotate: 90deg; }

  :global(html:not(.mobile-runtime)) .playlist-play-btn:hover:not(:disabled) { filter: brightness(1.08); }
  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn:hover:not(:disabled), :global(html:not(.mobile-runtime)) .playlist-more-btn:hover, :global(html:not(.mobile-runtime)) .playlist-favorite-btn:hover:not(:disabled) { background: var(--bg-hover); }
  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn:disabled { opacity: .48; cursor: default; }

  @media (max-width: 860px) {
    :global(html:not(.mobile-runtime)) .playlist-detail-hero { grid-template-columns: 160px minmax(0, 1fr); gap: 24px; min-height: 0; padding: 24px; }
    :global(html:not(.mobile-runtime)) .playlist-cover { width: 160px; height: 160px; }
  }

  @keyframes playlistHeroFade {
    from { opacity: 0; }
  }
</style>
