<script>
  let { artists = [], onOpenArtist, fallback = '未知歌手' } = $props()

  function openArtist(event, artist) {
    event.stopPropagation()
    if (artist?.id) onOpenArtist?.(artist.id)
  }

  function handleKeydown(event, artist) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openArtist(event, artist)
    }
  }
</script>

<span class="artist-links">
  {#each artists as artist, index (artist.id || artist.name)}
    {#if artist.id && onOpenArtist}
      <span
        class="artist-link"
        role="button"
        tabindex="0"
        onclick={(event) => openArtist(event, artist)}
        onkeydown={(event) => handleKeydown(event, artist)}
      >{artist.name}</span>
    {:else}
      <span>{artist.name}</span>
    {/if}
    {#if index < artists.length - 1}<span class="artist-sep">/</span>{/if}
  {:else}
    <span>{fallback}</span>
  {/each}
</span>
