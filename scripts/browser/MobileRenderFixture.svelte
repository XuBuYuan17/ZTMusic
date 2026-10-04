<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import MobileApp from '../../src/lib/components/MobileApp.svelte'
  import AppleMusicPlayer from '../../src/lib/components/AppleMusicPlayer.svelte'
  import { router } from '../../src/lib/stores/router.svelte.ts'
  import { desktopFeedback } from '../../src/lib/app/desktop-motion.ts'
  import { mobileFeedback } from '../../src/lib/app/mobile-feedback.ts'
  import { installPlaylistDiscMotion } from '../../src/lib/app/playlist-disc-motion.ts'
  import { player } from '../../src/lib/stores/player.svelte.ts'
  import { discoveryPlayback } from '../../src/lib/stores/discovery-playback.svelte.ts'
  import { auth } from '../../src/lib/stores/auth.svelte.ts'
  let { user }: { user: { userId: number; nickname: string; avatarUrl: string } } = $props()
  let showPlayer = $state(false)
  $effect(() => {
    auth.user; auth.isLoggedIn; auth.cookieOk
    player.queueRevision; player.queueIndex; player.id; player.mode
    untrack(() => discoveryPlayback.update())
  })
  onMount(() => {
    installPlaylistDiscMotion()
    Object.assign(window, { mobileFixture: {
      openPlayer: () => { showPlayer = true },
      closePlayer: () => { showPlayer = false },
      back: () => router.goBack(),
      login: () => auth.setUser(user, 'account'),
      logout: () => auth.clear(),
      navigate: (view: string) => router.handleNav(view),
      snapshot: () => ({ view: router.activeView, selectedId: router.selectedId, queue: player.queue.map(t => t.id), index: player.queueIndex, id: player.id, kind: discoveryPlayback.kind, busy: discoveryPlayback.busy, error: discoveryPlayback.error }),
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
<div class="app-shell" use:desktopFeedback use:mobileFeedback>
  <main class="main-area">
    <MobileApp activeView={router.activeView} theme="dark" accentTheme="red"
      onNavigate={router.handleNav} onBack={router.goBack}
      onOpenLogin={() => { (window as unknown as { loginRequests: number }).loginRequests = ((window as unknown as { loginRequests: number }).loginRequests || 0) + 1 }}
      onOpenPlaylist={(id, push, preview) => void router.goPlaylist(Number(id), push, preview as never)} />
  </main>
</div>
{#if showPlayer}
  <div class="ly-fullscreen"><div class="ly-container">
    <AppleMusicPlayer onClose={() => showPlayer = false} />
  </div></div>
{/if}
