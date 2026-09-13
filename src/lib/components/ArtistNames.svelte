<script lang="ts">
  import type { SongId } from '../types/music.ts'

  interface ArtistRef {
    id?: SongId
    name: string
  }

  let {
    artists = [],
    onOpenArtist,
    fallback = '未知歌手',
  }: {
    artists?: ArtistRef[]
    onOpenArtist?: (id: SongId) => void
    fallback?: string
  } = $props()

  function openArtist(event: Event, artist: ArtistRef): void {
    event.stopPropagation()
    if (artist?.id) onOpenArtist?.(artist.id)
  }

  function handleKeydown(event: KeyboardEvent, artist: ArtistRef): void {
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
