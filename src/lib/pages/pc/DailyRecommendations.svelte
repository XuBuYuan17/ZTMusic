<script lang="ts">
  import { untrack } from 'svelte'
  import { auth } from '../../stores/auth.svelte.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadDailyRecommendations } from '../../services/discovery-recommendations.ts'
  import type { CompactTrack } from '../../player/queue.ts'
  import { coverUrl } from '../../utils/image.ts'
  import Icon from '../../components/ui/Icon.svelte'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import SongListActions from '../../components/SongListActions.svelte'

  let { onOpenLogin, onOpenArtist, onOpenAlbum }: {
    onOpenLogin?: () => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()
  let songs = $state<CompactTrack[]>([])
  let loading = $state(false)
  let error = $state('')
  let bindRow = $state<((track: unknown) => { oncontextmenu: (event: MouseEvent) => void }) | null>(null)
  let request = 0

  async function refresh(): Promise<void> {
    if (!auth.isLoggedIn || !auth.cookieOk) return
    const token = ++request
    const owner = auth.user
    loading = true
    error = ''
    try {
      const tracks = await loadDailyRecommendations(ncm)
      if (token === request && owner === auth.user) songs = tracks
    } catch (cause) {
      if (token === request && owner === auth.user) error = cause instanceof Error ? cause.message : '每日推荐加载失败'
    } finally {
      if (token === request) loading = false
    }
  }
  $effect(() => {
    const owner = auth.user
    const loggedIn = auth.isLoggedIn && auth.cookieOk
    untrack(() => {
      request++
      songs = []
      error = ''
      loading = false
      if (owner && loggedIn) void refresh()
    })
    return () => { request++ }
  })
</script>

<div class="daily-recommendations">
  <header class="daily-recommendations__header">
    <div><h2>每日推荐</h2><p>今天为你推荐{songs.length ? ` · ${songs.length} 首` : ''}</p></div>
    <button class="daily-recommendations__refresh" type="button" aria-label="刷新每日推荐" disabled={loading || !auth.isLoggedIn || !auth.cookieOk} onclick={refresh}><Icon name="refresh" size={22} /></button>
  </header>
  {#if !auth.isLoggedIn || !auth.cookieOk}
    <div class="daily-recommendations__state"><p>登录后查看每日推荐</p><button type="button" onclick={() => onOpenLogin?.()}>登录</button></div>
  {:else}
    {#if error}<ErrorBlock message={error} onRetry={refresh} />{/if}
    {#if loading && !songs.length}
      <div class="daily-recommendations__state" role="status">正在加载每日推荐…</div>
    {/if}
    {#if songs.length}
      <button class="daily-recommendations__play-all" type="button" onclick={() => player.playQueue(songs)}><Icon name="play" size={18} />播放全部</button>
      <div class="daily-recommendations__list" aria-label="每日推荐歌曲">
        {#each songs as track, index (track.id)}
          <div class="daily-recommendations__row" class:active={String(player.id) === String(track.id)}>
            <button type="button" class="daily-recommendations__song" oncontextmenu={(event) => bindRow?.(track).oncontextmenu(event)} aria-label={`播放 ${track.name}`} onclick={() => player.playQueue(songs, index)}>
              <span class="daily-recommendations__cover">{#if track.picUrl}<img src={coverUrl(track.picUrl, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={22} />{/if}</span>
              <span class="daily-recommendations__copy"><strong>{track.name}</strong><small>{track.ar.map(artist => artist.name).join(' / ') || '未知艺人'}</small></span>
            </button>
            <button type="button" class="daily-recommendations__more" aria-label={`更多操作：${track.name}`} onclick={(event) => bindRow?.(track).oncontextmenu(event)}><Icon name="more" size={22} /></button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
<SongListActions {onOpenArtist} {onOpenAlbum} onBindRow={(fn) => { bindRow = fn }} />

<style>
  .daily-recommendations { color: var(--text); max-width: 1180px; margin: 0 auto; }
  .daily-recommendations__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
  .daily-recommendations__header h2 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; }
  .daily-recommendations__header p { margin: 6px 0 0; font-size: 13px; line-height: 20px; color: var(--text-secondary); }
  .daily-recommendations__refresh, .daily-recommendations__more { display: grid; place-items: center; flex-shrink: 0; width: 48px; height: 48px; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); cursor: pointer; }
  .daily-recommendations__refresh:disabled { opacity: .5; cursor: wait; }
  .daily-recommendations__play-all, .daily-recommendations__state button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 20px; border: 0; border-radius: 999px; background: var(--md-primary, var(--accent)); color: var(--md-on-primary, #fff); font-size: 14px; font-weight: 500; cursor: pointer; }
  .daily-recommendations__list { margin-top: 16px; }
  .daily-recommendations__row { display: flex; align-items: center; min-height: 72px; gap: 8px; border-radius: var(--radius-md); }
  .daily-recommendations__row.active { background: var(--md-container, var(--bg-elevated)); }
  .daily-recommendations__song { display: flex; align-items: center; flex: 1; min-width: 0; gap: 12px; min-height: 72px; padding: 8px 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
  .daily-recommendations__cover { display: grid; place-items: center; flex-shrink: 0; width: 48px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; background: var(--md-container-high, var(--bg-elevated)); }
  .daily-recommendations__cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .daily-recommendations__copy { display: grid; gap: 4px; min-width: 0; }
  .daily-recommendations__copy strong { font-size: 15px; line-height: 22px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .daily-recommendations__copy small { font-size: 13px; line-height: 18px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .daily-recommendations__state { display: grid; justify-items: center; gap: 16px; padding: 48px 16px; font-size: 14px; line-height: 22px; color: var(--text-secondary); }
  :global(html.mobile-runtime) .daily-recommendations__header h2 { display: none; }
  :global(html.mobile-runtime) .daily-recommendations__header p { margin-top: 0; }
  button:focus-visible { outline: 2px solid var(--md-primary, var(--accent)); outline-offset: 2px; }
  button:active { opacity: .7; }
</style>
