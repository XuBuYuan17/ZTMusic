<script lang="ts">
  import { onMount } from 'svelte'
  import { engine } from '../player/engine.ts'
  import { player } from '../stores/player.svelte.ts'
  import { wordProgress } from '../utils/lyric-word-progress.ts'

  let { words }: { words: Array<{ time: number; duration: number; text: string }> } = $props()
  let now = $state(0)
  let reduced = $state(false)

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reduced = query.matches }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  })

  $effect(() => {
    now = player.currentTime
    if (!player.playing || reduced) return
    let frame = 0
    let last = 0
    const update = (timestamp: number) => {
      if (!document.hidden && timestamp - last >= 33) {
        now = engine.currentTime
        last = timestamp
      }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  })
</script>

{#each words as word, index (index)}<span class="lyric-word" style={`--word-progress:${wordProgress(word, now, reduced)}%`}>{word.text}</span>{/each}

<style>
  @supports ((background-clip: text) or (-webkit-background-clip: text)) {
    .lyric-word {
      color: transparent;
      background-image: linear-gradient(90deg, white var(--word-progress), rgba(255,255,255,.3) var(--word-progress));
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  }
</style>
