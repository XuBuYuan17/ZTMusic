<script>
  import MobileTabs from './MobileTabs.svelte'
  import MobileTopBar from './MobileTopBar.svelte'
  import MobileMiniPlayer from './MobileMiniPlayer.svelte'
  import PlayerBar from './PlayerBar.svelte'

  let {
    activeView = 'home',
    title = '哲听',
    isLoggedIn = false,
    showQueuePanel = false,
    contentScrollEl = $bindable(null),
    onNavigate,
    onOpenSearch,
    onOpenLogin,
    onOpenSheet,
    onToggleQueue,
    onOpenArtist,
    children,
  } = $props()
</script>

<div class="mobile-shell">
  <MobileTopBar {title} {isLoggedIn} {onOpenSearch} {onOpenLogin} />

  <div class="content-scroll" bind:this={contentScrollEl}>
    <div class="content-inner">
      {@render children?.()}
    </div>
  </div>

  <div class="player-bar-wrap" class:queue-open={showQueuePanel}>
    <PlayerBar onOpenSheet={onOpenSheet} onToggleQueue={onToggleQueue} {showQueuePanel} {onOpenArtist} />
    <MobileMiniPlayer onOpenSheet={onOpenSheet} onToggleQueue={onToggleQueue} {showQueuePanel} {onOpenArtist} />
  </div>

  <MobileTabs {activeView} onNavigate={onNavigate} />
</div>
