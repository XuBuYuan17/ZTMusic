<script lang="ts">
  import SongContextMenu from './SongContextMenu.svelte'
  import { untrack } from 'svelte'

  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let {
    onOpenArtist,
    onOpenAlbum,
    onToast,
    onBindRow,
  }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onToast?: (message: unknown) => void
    onBindRow?: (bindRow: RowBinder) => void
  } = $props()

  let menuShow = $state(false)
  let menuTrack = $state<unknown>(null)
  let menuX = $state(0)
  let menuY = $state(0)

  function openMenu(track: unknown, event?: MouseEvent): void {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    menuTrack = track
    menuX = event?.clientX ?? 16
    menuY = event?.clientY ?? 16
    menuShow = true
  }

  function closeMenu(): void {
    menuShow = false
  }

  const bindRow: RowBinder = (track) => {
    return {
      oncontextmenu: (event) => openMenu(track, event),
    }
  }

  $effect(() => {
    untrack(() => onBindRow?.(bindRow))
  })
</script>

<SongContextMenu
  show={menuShow}
  track={menuTrack}
  x={menuX}
  y={menuY}
  onClose={closeMenu}
  onOpenArtist={onOpenArtist}
  onOpenAlbum={onOpenAlbum}
  onToast={onToast}
/>

