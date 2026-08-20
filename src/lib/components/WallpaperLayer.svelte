<script>
  import { onMount } from 'svelte'
  import { wallpaper } from '../stores/wallpaper.svelte.js'

  let video = $state(null)
  let documentVisible = $state(true)

  onMount(() => {
    wallpaper.init()
    const syncVisibility = () => { documentVisible = !document.hidden }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  })

  $effect(() => {
    if (!video) return
    if (wallpaper.videoPlaying && documentVisible) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  })
</script>

{#if wallpaper.active}
  <div class="wallpaper-layer" aria-hidden="true">
    {#if wallpaper.kind === 'image'}
      <img src={wallpaper.url} alt="" />
    {:else}
      <video
        bind:this={video}
        src={wallpaper.url}
        muted
        loop
        playsinline
        preload="metadata"
        onerror={() => wallpaper.reportPlaybackError()}
      ></video>
    {/if}
    <div class="wallpaper-layer__scrim"></div>
  </div>
{/if}
