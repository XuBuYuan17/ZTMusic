<script>
  import SongContextMenu from './SongContextMenu.svelte'

  let { onOpenArtist, onOpenAlbum, onToast, onBindRow } = $props()

  let menuShow = $state(false)
  let menuTrack = $state(null)
  let menuX = $state(0)
  let menuY = $state(0)

  function openMenu(track, event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    menuTrack = track
    menuX = event?.clientX ?? 16
    menuY = event?.clientY ?? 16
    menuShow = true
  }

  function closeMenu() {
    menuShow = false
  }

  function bindRow(track) {
    return {
      oncontextmenu: (event) => openMenu(track, event),
    }
  }

  $effect(() => {
    onBindRow?.(bindRow)
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

