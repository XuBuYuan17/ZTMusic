<script lang="ts" generics="Item extends { id?: unknown }">
  import type { Snippet } from 'svelte'

  let { items, loading = false, children }: {
    items: Item[]
    loading?: boolean
    children: Snippet<[Item]>
  } = $props()

  const rows = $derived([
    items.filter((_, index) => index % 2 === 0),
    items.filter((_, index) => index % 2 === 1),
  ])
</script>

<div class="mobile-cover-rows">
  {#each rows as row, index (index)}
    {#if loading || row.length}
      <div class="mobile-cover-rail mobile-cover-rail--single-row" role="group" aria-label={index === 0 ? '上排' : '下排'}>
        {#if loading}
          {#each [0, 1] as card (card)}
            <div class="mobile-cover-item"><span class="mobile-cover-image skeleton-block"></span><span class="skeleton-line"></span></div>
          {/each}
        {:else}
          {#each row as item (item.id)}{@render children(item)}{/each}
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .mobile-cover-rows { display: grid; gap: 8px; min-width: 0; }
</style>
