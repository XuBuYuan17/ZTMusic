<script lang="ts">
  import { coverUrl } from '../utils/image.ts'
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
    onBack,
    onPlayAll,
  }: {
    detail?: HeroDetail | null
    loading?: boolean
    loadingMore?: boolean
    heroColor?: string
    detailType?: string
    totalCount?: number
    visibleCount?: number
    onBack?: () => void
    onPlayAll?: () => void
  } = $props()

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }
</script>

{#if !detail}
  <div class="playlist-detail-hero playlist-detail-hero--loading">
    <button class="playlist-back-btn" onclick={onBack} aria-label="返回">
      <Icon name="chevron-left" size={18} strokeWidth={2.2} />
    </button>
    <div class="playlist-cover skeleton-block"></div>
    <div class="playlist-hero-copy">
      <div class="skeleton-line short" style="margin-bottom:10px"></div>
      <div class="skeleton-line medium" style="height:52px;margin-bottom:12px"></div>
      <div class="playlist-meta skeleton-line narrow"></div>
      <div class="playlist-desc skeleton-line"></div>
    </div>
  </div>
{:else}
  <div class="playlist-detail-hero" style={`--playlist-hero-color:${heroColor}`}>
    <button class="playlist-back-btn" onclick={onBack} aria-label="返回">
      <Icon name="chevron-left" size={18} strokeWidth={2.2} />
    </button>
    {#if detail.coverImgUrl || detail.picUrl}
      <img class="playlist-cover" src={coverUrl(detail.coverImgUrl || detail.picUrl, 320)} alt={detail.name} referrerpolicy="no-referrer" fetchpriority="high" />
    {:else}
      <div class="playlist-cover playlist-cover--empty">
        <Icon name="music" size={42} strokeWidth={1.3} />
      </div>
    {/if}
    <div class="playlist-hero-copy">
      <div class="playlist-kicker">{detailType}</div>
      <h1>{detail.name}</h1>
      <div class="playlist-meta">{rec(detail.creator)?.nickname ?? ''}{#if totalCount} · {totalCount} 首{:else if loading} · 正在加载歌曲{/if}{#if loadingMore} · 正在补全{/if}</div>
      {#if detail.description}
        <div class="playlist-desc">{detail.description}</div>
      {/if}
      <button class="playlist-play-btn" onclick={() => onPlayAll?.()} disabled={!visibleCount}>
        <Icon name="play" size={17} fill="currentColor" />
        播放全部
      </button>
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
  }

  .playlist-detail-hero--loading {
    --playlist-hero-color: var(--accent);
  }

  .playlist-back-btn {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-surface) 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    color: var(--text);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .playlist-back-btn:hover {
    background: var(--bg-hover);
  }

  .playlist-cover {
    width: 156px;
    height: 156px;
    display: grid;
    place-items: center;
    object-fit: cover;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-layer) 78%, transparent);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
  }

  .playlist-cover--empty {
    color: var(--text-tertiary);
  }

  .playlist-hero-copy {
    min-width: 0;
    display: grid;
    gap: 7px;
    padding-right: 8px;
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

  :global(html.mobile-runtime) .playlist-detail-hero {
    grid-template-columns: 104px minmax(0, 1fr);
    align-items: end;
    gap: 14px;
    margin: -18px -14px 0;
    padding: 52px 14px 16px;
    border-width: 0 0 1px;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background:
      linear-gradient(155deg, color-mix(in srgb, var(--playlist-hero-color, #141414) 24%, transparent), transparent 68%),
      color-mix(in srgb, var(--bg-elevated) 82%, transparent);
  }

  :global(html.mobile-runtime) .playlist-back-btn {
    top: 12px;
    left: 14px;
    width: 32px;
    height: 32px;
    border-radius: 999px;
  }

  :global(html.mobile-runtime) .playlist-cover {
    width: 104px;
    height: 104px;
    border-radius: var(--radius-md);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  }

  :global(html.mobile-runtime) .playlist-hero-copy {
    align-self: end;
    gap: 6px;
    padding-right: 0;
  }

  :global(html.mobile-runtime) .playlist-kicker {
    font-size: 10px;
    letter-spacing: .4px;
  }

  :global(html.mobile-runtime) .playlist-hero-copy h1 {
    font-size: 22px;
    line-height: 1.14;
    line-clamp: 3;
    -webkit-line-clamp: 3;
  }

  :global(html.mobile-runtime) .playlist-meta {
    min-width: 0;
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.mobile-runtime) .playlist-desc {
    display: none;
  }

  :global(html.mobile-runtime) .playlist-play-btn {
    min-height: 36px;
    width: min(100%, 132px);
    justify-content: center;
    margin-top: 3px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
  }

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
</style>
