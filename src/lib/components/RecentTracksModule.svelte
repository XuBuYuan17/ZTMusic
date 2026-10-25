<script lang="ts">
  import { player } from '../stores/player.svelte.ts'
  import { loadLocalRecentTracks } from '../services/home.ts'
  import { LISTENING_CHANGE } from '../services/listening-recorder.ts'
  import type { CompactTrackInput } from '../player/queue.ts'
  import { toSongRows, withRowKeys } from './song-row.ts'
  import CompactTrackList from './CompactTrackList.svelte'
  import type { CompactTrackRow } from './CompactTrackList.svelte'

  // 最近播放预览：自己负责读取本机历史并跟随变化刷新，两个页面可以直接复用。
  let {
    limit = 8,
    onOpenAll,
  }: {
    limit?: number
    onOpenAll?: () => void
  } = $props()

  // 保留原始 track 作为播放队列：索引与列表顺序一致，不能换成归一后的副本
  let sources = $state<unknown[]>([])

  const rows = $derived<CompactTrackRow[]>(withRowKeys(toSongRows(sources)).map(({ key, row }) => ({
    key,
    title: row.name,
    subtitle: row.artists.map(artist => artist.name).filter(Boolean).join(' / ') || '未知歌手',
    cover: row.cover,
  })))

  async function load(): Promise<void> {
    try {
      sources = await loadLocalRecentTracks(limit)
    } catch {
      sources = []
    }
  }

  // 预览播放：队列就是当前展示的这一串，index 即列表索引
  function playAt(index: number): void {
    if (!sources.length) return
    player.playQueue(sources as unknown as CompactTrackInput[], index)
  }

  $effect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener('local-listening-history-change', refresh)
    window.addEventListener(LISTENING_CHANGE, refresh)
    return () => {
      window.removeEventListener('local-listening-history-change', refresh)
      window.removeEventListener(LISTENING_CHANGE, refresh)
    }
  })
</script>

<section class="profile-home__panel">
  <header>
    <div><span>CONTINUE</span><h2>最近播放</h2></div>
    <button type="button" onclick={() => onOpenAll?.()}>查看全部</button>
  </header>
  <CompactTrackList {rows} emptyText="播放一首歌后会显示在这里" onPlay={playAt} />
</section>

<style>
  /* 面板外观与主页 dashboard 的面板保持一致；窄屏由 app-mobile.css 统一覆盖 */
  .profile-home__panel { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .profile-home__panel > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .profile-home__panel header span { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .profile-home__panel h2 { margin-top: 4px; font-size: 20px; }
  .profile-home__panel header button { padding: 4px 8px; margin-right: -8px; border-radius: var(--radius-sm); color: var(--accent); font-size: 12px; transition: background-color var(--motion-release) var(--ease-out); }

  :global(html.mobile-runtime) .profile-home__panel { padding: 0; border: 0; background: transparent; }
  :global(html.mobile-runtime) .profile-home__panel h2 { font-size: 18px; }
</style>
