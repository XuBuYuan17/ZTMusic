<script lang="ts">
  import { coverUrl } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'
  import type { SongRowData } from './song-row.ts'

  // 共享歌曲行：只接收归一后的数据与回调。
  // 表格语义保持在父级 <table>/<tbody> 里，本组件只负责一个 <tr> 及其单元格。
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let {
    row,
    index = 0,
    current = false,
    rowActions = null,
    /** 长按刚触发过菜单时，列表会在短时间内屏蔽这一行的点击（避免松手又播放） */
    clickBlocked,
    onPlay,
    onOpenArtist,
    onOpenAlbum,
  }: {
    row: SongRowData
    index?: number
    /** 与播放器当前曲目一致（沿用玩家状态，不另存播放态） */
    current?: boolean
    rowActions?: RowBinder | null
    clickBlocked?: () => boolean
    onPlay?: (row: SongRowData) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let rowEl = $state<HTMLTableRowElement | null>(null)
  // 触摸长按由列表统一处理，这里只需要区分「鼠标右键」与「触摸合成的 contextmenu」
  let lastPointerType: string | null = null

  /** 三种入口（右键 / 更多按钮 / 键盘）统一走这里：先聚焦行，菜单关闭后焦点回到这里 */
  function openRowMenu(event?: MouseEvent | KeyboardEvent): void {
    rowEl?.focus({ preventScroll: true })
    rowActions?.(row.source).oncontextmenu(event as MouseEvent)
  }

  function handleContextMenu(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if (lastPointerType && lastPointerType !== 'mouse') return
    openRowMenu(event)
  }

  function handleClick(): void {
    if (clickBlocked?.()) return
    onPlay?.(row)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick()
      return
    }
    // 键盘打开菜单，与右键、更多按钮同一入口
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      openRowMenu(event)
    }
  }
</script>

<tr
  bind:this={rowEl}
  data-row-index={index}
  class:playlist-track-row={index < 14}
  class:active={current}
  style={`--playlist-row-i:${Math.min(index, 12)}`}
  role="button"
  tabindex="0"
  aria-haspopup={rowActions ? 'menu' : undefined}
  aria-keyshortcuts={rowActions ? 'Shift+F10' : undefined}
  onpointerdown={(event) => { lastPointerType = event.pointerType }}
  onclick={handleClick}
  onkeydown={handleKeydown}
  oncontextmenu={handleContextMenu}
>
  <td class="col-num">{index + 1}</td>
  <td class="col-cover">
    {#if row.cover}
      <img class="track-cover-img" src={coverUrl(row.cover, 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <div class="track-cover-placeholder">
        <Icon name="music-note" size={16} strokeWidth={1.5} />
      </div>
    {/if}
  </td>
  <td class="col-title">
    {row.name}
    <button
      class="m-track-more"
      type="button"
      aria-label={`更多操作：${row.name}`}
      onkeydown={(event) => event.stopPropagation()}
      onclick={(event) => { event.stopPropagation(); openRowMenu(event) }}
    ><Icon name="more" size={20} /></button>
  </td>
  <td class="col-artist artist-links">
    {#if row.artists.length}
      {#each row.artists as artist, artistIndex ((artist.id ?? artist.name) + ':' + artistIndex)}
        {#if artistIndex > 0}<span class="artist-sep">/</span>{/if}
        {#if artist.id}
          <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name || '未知歌手'}</button>
        {:else}
          <span>{artist.name || '未知歌手'}</span>
        {/if}
      {/each}
    {:else}
      <span class="song-row__muted">未知歌手</span>
    {/if}
  </td>
  <td class="col-album">
    {#if row.album?.id}
      {@const albumId = row.album.id}
      <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenAlbum?.(albumId) }}>{row.album?.name}</button>
    {:else}
      {row.album?.name || '—'}
    {/if}
  </td>
  <td class="col-added" title={row.addedTitle}>{row.addedLabel}</td>
  <td class="col-dur" data-duration-missing={!row.durationMs}>{row.durationLabel}</td>
</tr>

<style>
  /* 首屏行错峰：行本体由本组件拥有，动画与关键帧一起放在这里 */
  .playlist-track-row {
    opacity: 0;
    animation: playlistTrackRowIn 0.36s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.12s + var(--playlist-row-i, 0) * 24ms);
  }

  @keyframes playlistTrackRowIn {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-track-row {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  /* 桌面：页面整体入场由 host 的 pageMotion 处理 */
  :global(html:not(.mobile-runtime)) .playlist-track-row {
    animation: none;
    opacity: 1;
    transform: none;
  }

  /* 特异性需压过 desktop-system.css 对 .track-table 行的 animation: none */
  :global(html:not(.mobile-runtime) .playlist-detail-page.rows-intro .playlist-track-table tbody tr).playlist-track-row {
    animation: playlistTrackRowIn var(--motion-panel) var(--ease-out) backwards;
    animation-delay: calc(80ms + var(--playlist-row-i, 0) * 24ms);
  }

  .song-row__muted { color: var(--text-tertiary); }
</style>
