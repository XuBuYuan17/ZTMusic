<script lang="ts">
  import { coverUrl } from '../utils/image.ts'
  import { flyCover } from '../app/desktop-motion.ts'
  import Icon from './ui/Icon.svelte'

  interface HeroDetail {
    name: string
    coverImgUrl?: string
    picUrl?: string
    creator?: unknown
    description?: string
  }

  let {
    detail = null,
    loading = false,
    loadingMore = false,
    heroColor = '#141414',
    detailType = '歌单',
    totalCount = 0,
    visibleCount = 0,
    totalDuration = 0,
    onBack,
    onPlayAll,
    onShuffle,
  }: {
    detail?: HeroDetail | null
    loading?: boolean
    loadingMore?: boolean
    heroColor?: string
    detailType?: string
    totalCount?: number
    visibleCount?: number
    totalDuration?: number
    onBack?: () => void
    onPlayAll?: () => void
    onShuffle?: () => void
  } = $props()

  const cover = $derived(detail?.coverImgUrl || detail?.picUrl || '')
  const creator = $derived(rec(detail?.creator))

  function durationText(ms: number): string {
    const minutes = Math.round(ms / 60000)
    return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`
  }

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }
</script>

{#if !detail}
  <div class="playlist-detail-hero playlist-detail-hero--loading">
    <div class="playlist-cover skeleton-block"></div>
    <div class="playlist-hero-copy">
      <div class="playlist-hero-topline">
        <button class="playlist-back-btn" onclick={onBack} aria-label="返回">
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
          <span>返回</span>
        </button>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-line medium" style="height:52px;margin-bottom:12px"></div>
      <div class="playlist-meta skeleton-line narrow"></div>
      <div class="playlist-desc skeleton-line"></div>
    </div>
  </div>
{:else}
  <div class="playlist-detail-hero" class:is-syncing={loading} style={`--playlist-hero-color:${heroColor}`}>
    {#if cover}<div class="playlist-hero-backdrop" style={`background-image:url("${coverUrl(cover, 320)}")`} aria-hidden="true"></div>{/if}
    <div class="playlist-hero-wash" aria-hidden="true"></div>
    {#if cover}
      <img class="playlist-cover" src={coverUrl(cover, 320)} alt={detail.name} referrerpolicy="no-referrer" fetchpriority="high" use:flyCover />
    {:else}
      <div class="playlist-cover playlist-cover--empty">
        <Icon name="music" size={42} strokeWidth={1.3} />
      </div>
    {/if}
    <div class="playlist-hero-copy">
      <div class="playlist-hero-topline">
        <button class="playlist-back-btn" onclick={onBack} aria-label="返回">
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
          <span>返回</span>
        </button>
        <div class="playlist-kicker">{detailType}</div>
      </div>
      <h1>{detail.name}</h1>
      <div class="playlist-meta">
        {#if creator?.avatarUrl}<img class="playlist-meta-avatar" src={coverUrl(creator.avatarUrl as string, 48)} alt="" referrerpolicy="no-referrer" />{/if}
        {creator?.nickname ?? ''}{#if totalCount} · {totalCount} 首{:else if loading} · 正在加载歌曲{/if}{#if totalDuration} · {durationText(totalDuration)}{/if}{#if loadingMore} · 正在补全{/if}
      </div>
      {#if detail.description}
        <div class="playlist-desc" title={detail.description}>{detail.description}</div>
      {/if}
      <div class="playlist-hero-actions">
        <button class="playlist-play-btn" onclick={() => onPlayAll?.()} disabled={!visibleCount}>
          <Icon name="play" size={17} fill="currentColor" />
          播放全部
        </button>
        {#if onShuffle}
          <button class="playlist-shuffle-btn" onclick={onShuffle} disabled={!visibleCount}>
            <Icon name="shuffle" size={16} />
            随机播放
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
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

  :global(html.mobile-runtime) .playlist-detail-hero { grid-template-columns: minmax(0, 1fr); align-items: start; gap: 20px; margin: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  :global(html.mobile-runtime) .playlist-back-btn { display: none; }
  :global(html.mobile-runtime) .playlist-cover { justify-self: center; width: min(56vw, 240px); height: auto; aspect-ratio: 1; border-radius: var(--radius-lg); }
  :global(html.mobile-runtime) .playlist-hero-copy { width: 100%; min-width: 0; gap: 8px; padding: 0; }
  :global(html.mobile-runtime) .playlist-kicker { font-size: 11px; color: var(--text-secondary); }
  :global(html.mobile-runtime) .playlist-hero-copy h1 { font-size: 26px; line-height: 1.25; line-clamp: 3; -webkit-line-clamp: 3; }
  :global(html.mobile-runtime) .playlist-meta { min-width: 0; flex-wrap: wrap; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  :global(html.mobile-runtime) .playlist-desc { display: -webkit-box; line-clamp: 3; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; }
  :global(html.mobile-runtime) .playlist-hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  :global(html.mobile-runtime) .playlist-play-btn, :global(html.mobile-runtime) .playlist-shuffle-btn { min-height: 44px; justify-content: center; padding: 0 16px; border-radius: var(--radius-md); font-size: 13px; }
  :global(html.mobile-runtime) .playlist-shuffle-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--bg-elevated); color: var(--text); }

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

  /* 桌面：沉浸式模糊封面背景；--hero-p（0→1）由 PlaylistPage 按滚动写入，驱动视差与收缩 */
  :global(html:not(.mobile-runtime)) .playlist-detail-hero {
    grid-template-columns: 208px minmax(0, 1fr);
    gap: 32px;
    min-height: 272px;
    margin: 0;
    padding: 32px;
    border: 0;
    border-radius: var(--radius-xl);
    color: white;
    background: var(--playlist-hero-color, #141414);
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
    inset: -40px;
    z-index: -2;
    display: block;
    background-position: center;
    background-size: cover;
    filter: blur(40px) saturate(1.2);
    transform: translateY(calc(var(--hero-p, 0) * 48px)) scale(1.2);
    will-change: transform;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-wash {
    position: absolute;
    inset: 0;
    z-index: -1;
    display: block;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--playlist-hero-color, #141414) 78%, rgba(0, 0, 0, .3)) 0%, color-mix(in srgb, var(--playlist-hero-color, #141414) 36%, transparent) 100%),
      linear-gradient(0deg, rgba(0, 0, 0, .32), transparent 64%);
  }

  :global(html:not(.mobile-runtime)) .playlist-cover {
    width: 208px;
    height: 208px;
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .32);
    transform-origin: 0 100%;
    transform: scale(calc(1 - var(--hero-p, 0) * .12));
    opacity: calc(1 - var(--hero-p, 0) * .6);
    animation: none;
  }

  :global(html:not(.mobile-runtime)) .playlist-hero-copy {
    gap: 8px;
    padding-right: 0;
    opacity: calc(1 - var(--hero-p, 0) * .7);
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
    font-size: clamp(32px, 4vw, 52px);
    font-weight: 700;
    line-height: 1.08;
  }

  :global(html:not(.mobile-runtime)) .playlist-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: color-mix(in srgb, currentColor 80%, transparent);
  }

  :global(html:not(.mobile-runtime)) .playlist-meta-avatar {
    width: 20px;
    height: 20px;
    display: block;
    border-radius: 50%;
    object-fit: cover;
  }

  :global(html:not(.mobile-runtime)) .playlist-desc {
    color: color-mix(in srgb, currentColor 62%, transparent);
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
    min-height: 40px;
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
    color: inherit;
    background: rgba(255, 255, 255, .16);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  :global(html:not(.mobile-runtime)) .playlist-play-btn:hover:not(:disabled) { filter: brightness(1.08); }
  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn:hover:not(:disabled) { background: rgba(255, 255, 255, .24); }
  :global(html:not(.mobile-runtime)) .playlist-shuffle-btn:disabled { opacity: .48; cursor: default; }

  @media (max-width: 860px) {
    :global(html:not(.mobile-runtime)) .playlist-detail-hero { grid-template-columns: 160px minmax(0, 1fr); gap: 24px; min-height: 0; padding: 24px; }
    :global(html:not(.mobile-runtime)) .playlist-cover { width: 160px; height: 160px; }
  }

  @keyframes playlistHeroFade {
    from { opacity: 0; }
  }
</style>
