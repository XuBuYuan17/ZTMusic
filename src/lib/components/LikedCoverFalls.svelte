<script lang="ts">
  import { coverUrl } from '../utils/image.ts'

  let { covers = [], threeColumns = false }: { covers?: string[]; threeColumns?: boolean } = $props()

  function padColumn(list: string[]): string[] {
    if (!list.length) return []
    if (list.length >= 4) return list
    return Array.from({ length: 4 }, (_, i) => list[i % list.length] ?? list[0] ?? '')
  }

  const columns = $derived.by(() => {
    if (covers.length === 1) return { l: padColumn(covers), r: [] as string[] }
    if (covers.length > 1 && covers.length < 4) {
      const take = (start: number): string[] => Array.from({ length: 4 }, (_, i) => covers[(start + i) % covers.length] ?? '')
      return { l: take(0), r: take(1) }
    }
    return { l: covers.filter((_, i) => i % 2 === 0), r: covers.filter((_, i) => i % 2 === 1) }
  })
  const three = $derived(Array.from({ length: 3 }, (_, column) => Array.from({ length: 4 }, (_, row) => covers[(column + row * 3) % covers.length] ?? '')))

  const starPath = 'M12 2.6l2.95 6.01 6.62.94-4.8 4.65 1.15 6.57L12 17.68l-5.92 3.09 1.15-6.57-4.8-4.65 6.62-.94z'
</script>

{#if covers.length === 1}
  <img class="liked-falls-single" src={coverUrl(covers[0], 400)} alt="" loading="lazy" referrerpolicy="no-referrer" />
  <span class="liked-falls-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d={starPath}/></svg></span>
{:else if columns.l.length}
  <div class="liked-falls" class:liked-falls-three={threeColumns} aria-hidden="true">
    {#each (threeColumns ? three : [columns.l, columns.r]) as column, i}
      {#if column.length}
        <div class="liked-falls-col">
          <div class:liked-falls-track-l={i === 0} class:liked-falls-track-r={i === 1} class="liked-falls-track">
            {#each [...column, ...column] as src}
              <img src={coverUrl(src, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
  <span class="liked-falls-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d={starPath}/></svg></span>
{:else}
  <div class="library-card-liked-art" aria-hidden="true"><svg viewBox="0 0 24 24" width="46%" height="46%" fill="currentColor"><path d={starPath}/></svg></div>
{/if}
