<script lang="ts">
  import { onMount } from 'svelte'
  import MobileApp from '../../src/lib/components/MobileApp.svelte'
  import AppleMusicPlayer from '../../src/lib/components/AppleMusicPlayer.svelte'
  import { router } from '../../src/lib/stores/router.svelte.ts'
  import { desktopFeedback } from '../../src/lib/app/desktop-motion.ts'
  import { mobileFeedback } from '../../src/lib/app/mobile-feedback.ts'
  import { installPlaylistDiscMotion } from '../../src/lib/app/playlist-disc-motion.ts'
  let showPlayer = $state(false)
  onMount(() => {
    installPlaylistDiscMotion()
    Object.assign(window, { mobileFixture: {
      openPlayer: () => { showPlayer = true },
      closePlayer: () => { showPlayer = false },
      back: () => router.goBack(),
    } })
  })
</script>
<div class="app-shell" use:desktopFeedback use:mobileFeedback>
  <main class="main-area">
    <MobileApp activeView={router.activeView} theme="dark" accentTheme="red"
      onNavigate={router.handleNav} onBack={router.goBack}
      onOpenPlaylist={(id, push, preview) => void router.goPlaylist(Number(id), push, preview as never)} />
  </main>
</div>
{#if showPlayer}
  <div class="ly-fullscreen"><div class="ly-container">
    <AppleMusicPlayer onClose={() => showPlayer = false} />
  </div></div>
{/if}
