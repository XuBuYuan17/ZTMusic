<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte'
  import DesktopPageHost from '../../src/lib/components/layout/DesktopPageHost.svelte'
  import { setLayoutMode } from '../../src/lib/utils/layout-mode.ts'
  import MobileApp from '../../src/lib/components/MobileApp.svelte'
  import LyricsPageV2 from '../../src/lib/components/LyricsPageV2.svelte'
  import MobileMiniPlayer from '../../src/lib/components/MobileMiniPlayer.svelte'
  import { createPlayerSurfaceController } from '../../src/lib/player-motion/controller.ts'
  import { router } from '../../src/lib/stores/router.svelte.ts'
  import { desktopFeedback } from '../../src/lib/app/desktop-motion.ts'
  import { mobileFeedback } from '../../src/lib/app/mobile-feedback.ts'
  import { installPlaylistDiscMotion } from '../../src/lib/app/playlist-disc-motion.ts'
  import { player } from '../../src/lib/stores/player.svelte.ts'
  import { discoveryPlayback } from '../../src/lib/stores/discovery-playback.svelte.ts'
  import { auth } from '../../src/lib/stores/auth.svelte.ts'
  let { user }: { user: { userId: number; nickname: string; avatarUrl: string } } = $props()
  let desktopLayout = $state(false)
  let showPlayer = $state(false)
  let desktopTitlebar = $state(false)
  const surface = createPlayerSurfaceController()
  const unsubscribe = surface.subscribe(({ phase }) => { showPlayer = phase !== 'closed' })
  onDestroy(() => { unsubscribe(); surface.destroy() })
  $effect(() => {
    auth.user; auth.isLoggedIn; auth.cookieOk
    player.queueRevision; player.queueIndex; player.id; player.mode
    untrack(() => { discoveryPlayback.update(); router.syncRecommendationAccount() })
  })
  onMount(() => {
    installPlaylistDiscMotion()
    Object.assign(window, { mobileFixture: {
      setLayout: (layout: 'mobile' | 'desktop') => {
        desktopLayout = layout === 'desktop'
        setLayoutMode(desktopLayout ? 'pc' : 'mobile')
        document.documentElement.classList.toggle('mobile-runtime', !desktopLayout)
      },
      openPlayer: () => surface.open(),
      closePlayer: () => surface.close(),
      surface,
      setDesktopTitlebar: (enabled: boolean) => {
        desktopTitlebar = enabled
        document.documentElement.classList.toggle('desktop-titlebar', enabled)
      },
      seekForSurfaceTest: () => { player.seek = time => { player.currentTime = time } },
      setSurfaceArtwork: (value: string) => { player.cover = value === 'normal' ? user.avatarUrl : value },
      back: () => router.goBack(),
      login: () => auth.setUser(user, 'account'),
      logout: () => auth.clear(),
      navigate: (view: string) => router.handleNav(view),
      snapshot: () => ({ view: router.activeView, selectedId: router.selectedId, queue: player.queue.map(t => t.id), index: player.queueIndex, id: player.id, mode: player.mode, kind: discoveryPlayback.kind, busy: discoveryPlayback.busy, error: discoveryPlayback.error }),
      advance: () => { const index = player.queueIndex + 1; if (player.queue[index]) { player.queueIndex = index; player.id = player.queue[index].id } },
      normalPlayback: () => player.playQueue([{ id: 555, name: '普通歌曲' }]),
      enableSilentPlayback: () => {
        // 测试页面交互和队列，不请求真实歌曲音频；原生追加路径由 Android 构建验证。
        player.playTrack = async (track, index = 0) => {
          player.queueIndex = index; player.id = track!.id!; player.currentTrack = player.queue[index]
          player.title = String(track!.name); player.playing = true
        }
      },
    } })
  })
</script>
{#if desktopTitlebar}<header class="fixture-titlebar" aria-label="测试窗口标题栏">哲听 Dev</header>{/if}
<div class="app-shell" use:desktopFeedback use:mobileFeedback>
  <main class="main-area">
    {#if desktopLayout}
      <DesktopPageHost theme="dark" accentTheme="red" onOpenLogin={() => {}} onSetTheme={() => {}} onSetAccentTheme={() => {}} />
    {:else}
    <MobileApp activeView={router.activeView} theme="dark" accentTheme="red"
      onNavigate={router.handleNav} onBack={router.goBack}
      onOpenLogin={() => { (window as unknown as { loginRequests: number }).loginRequests = ((window as unknown as { loginRequests: number }).loginRequests || 0) + 1 }}
      onOpenPlaylist={(id, push, preview) => void router.goPlaylist(Number(id), push, preview as never)} />
    {/if}
  </main>
</div>
<div class="player-bar-wrap">
  <MobileMiniPlayer controller={surface} onOpenSheet={() => surface.open()} onToggleQueue={() => {}} />
</div>
<LyricsPageV2 show={showPlayer} controller={surface} onClose={() => surface.close()} />

<style>
  .fixture-titlebar { position: fixed; inset: 0 0 auto; height: var(--titlebar-h); z-index: 700; padding: 8px 14px; background: var(--bg); }
</style>
