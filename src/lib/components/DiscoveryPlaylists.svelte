<script lang="ts">
  import { auth } from '../stores/auth.svelte.ts'
  import { discoveryPlaylists } from '../app/discovery-playlists.ts'
  import type { DiscoveryPlaylistKey } from '../app/discovery-playlists.ts'
  let { mobile = false, onOpenRecommendation, onOpenLogin }: {
    mobile?: boolean
    onOpenRecommendation?: (key: DiscoveryPlaylistKey) => void
    onOpenLogin?: () => void
  } = $props()
  let message = $state('')
  $effect(() => { auth.user; auth.cookieOk; message = '' })
  function open(key: DiscoveryPlaylistKey): void {
    message = ''
    if (!auth.isLoggedIn || !auth.cookieOk) { message = '登录后查看专属歌单'; onOpenLogin?.(); return }
    onOpenRecommendation?.(key)
  }
</script>

{#if mobile}
  <section class="mobile-discovery-section discovery-playlists" aria-label="专属歌单">
    <h2>专属歌单</h2>
    <div class="mobile-cover-rail">
      {#each discoveryPlaylists as playlist (playlist.key)}
        <button class="mobile-cover-item" type="button" data-motion="card" data-discovery={playlist.key} onclick={() => open(playlist.key)}>
          <span class="mobile-cover-image"><img src={playlist.coverImgUrl} alt="" loading="eager" /></span>
          <strong>{playlist.name}</strong><small>{playlist.description}</small>
        </button>
      {/each}
    </div>
    {#if message}<p role="status">{message}</p>{/if}
  </section>
{:else}
  <section class="music-discovery-section discovery-playlists" aria-label="专属歌单">
    <div class="music-section-head"><h2>专属歌单</h2></div>
    <div class="music-card-rail">
      {#each discoveryPlaylists as playlist (playlist.key)}
        <button class="music-cover-card" type="button" data-motion="card" data-discovery={playlist.key} onclick={() => open(playlist.key)}>
          <img src={playlist.coverImgUrl} alt="" loading="eager" /><strong>{playlist.name}</strong><em>{playlist.description}</em>
        </button>
      {/each}
    </div>
    {#if message}<p role="status">{message}</p>{/if}
  </section>
{/if}
