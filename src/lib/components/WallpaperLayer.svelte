<script lang="ts">
  import { onMount } from 'svelte'
  import { wallpaper } from '../stores/wallpaper.svelte.ts'

  let video = $state<HTMLVideoElement | null>(null)
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
  <div class="wallpaper-layer" class:wallpaper-layer--video={wallpaper.kind === 'video'} aria-hidden="true">
    {#if wallpaper.kind === 'image'}
      <img class="wallpaper-layer__backdrop" src={wallpaper.url} alt="" />
      <img class="wallpaper-layer__media" src={wallpaper.url} alt="" />
    {:else}
      <video
        class="wallpaper-layer__media"
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
