<script lang="ts">
  import CompactTrackList from './CompactTrackList.svelte'
  import type { CompactTrackRow } from './CompactTrackList.svelte'
  import {
    weeklyListenCanExpand,
    weeklyListenRows,
    weeklyListenState,
    type WeeklyListenTrack,
  } from './weekly-listen.ts'

  // 本周常听：排行展示、播放与数据状态都在这里；数据由上层传入（主页的资料请求）。
  let {
    tracks = [],
    failed = false,
    loading = false,
    limit = 8,
    onPlay,
    onRetry,
  }: {
    tracks?: WeeklyListenTrack[]
    /** 周榜请求失败：不能显示成「本周没有听歌」 */
    failed?: boolean
    loading?: boolean
    limit?: number
    /** 收到完整列表里的下标 */
    onPlay?: (index: number) => void
    onRetry?: () => void
  } = $props()

  let expanded = $state(false)
  const phase = $derived(weeklyListenState({ failed, loading, count: tracks.length }))
  // 可见列表永远是完整列表的前缀，所以「可见下标」=「完整列表下标」
  const rows = $derived<CompactTrackRow[]>(weeklyListenRows(tracks, { limit, expanded }).map(row => ({
    key: row.key,
    title: row.title,
    subtitle: row.subtitle,
    rank: row.rank,
  })))
  const canExpand = $derived(weeklyListenCanExpand(tracks.length, limit))
</script>

<section class="profile-home__panel">
  <header><div><span>WEEKLY</span><h2>本周常听</h2></div></header>

  {#if phase === 'failed'}
    <div class="weekly-state" role="status">
      <p>本周常听加载失败</p>
      {#if onRetry}<button type="button" onclick={() => onRetry?.()}>重试</button>{/if}
    </div>
  {:else if phase === 'loading'}
    <div class="weekly-state"><p>正在加载本周排行…</p></div>
  {:else if phase === 'empty'}
    <div class="profile-home__empty">本周还没有公开的听歌排行</div>
  {:else}
    <CompactTrackList ranked {rows} onPlay={(index) => onPlay?.(index)} />
    {#if canExpand}
      <button class="weekly-toggle" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>
        {expanded ? '收起' : `展开全部 ${tracks.length} 首`}
      </button>
    {/if}
  {/if}
</section>

<style>
  /* 与主页 dashboard 面板保持一致；窄屏由 app-mobile.css 覆盖 */
  .profile-home__panel { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .profile-home__panel > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .profile-home__panel header span { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .profile-home__panel h2 { margin-top: 4px; font-size: 20px; }

  .weekly-state { min-height: 96px; display: grid; place-items: center; gap: 10px; color: var(--text-tertiary); font-size: 12px; }
  .weekly-state p { margin: 0; }
  .weekly-state button { min-height: 32px; padding: 0 14px; border-radius: var(--radius-lg); background: var(--accent-bg); color: var(--accent); font-size: 12px; font-weight: 700; }
  .weekly-state button:hover { background: var(--accent-bg-hover); }

  .weekly-toggle { width: 100%; min-height: 40px; margin-top: 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--accent); font-size: 12px; font-weight: 500; }
  .weekly-toggle:hover { background: var(--bg-hover); }

  :global(html.mobile-runtime) .profile-home__panel { padding: 0; border: 0; background: transparent; }
  :global(html.mobile-runtime) .profile-home__panel h2 { font-size: 18px; }
  :global(html.mobile-runtime) .weekly-toggle { min-height: 48px; }
</style>
