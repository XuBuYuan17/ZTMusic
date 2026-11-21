<script lang="ts">
  import { fade } from 'svelte/transition'
  import { responsive } from '../utils/responsive.ts'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import Icon from './ui/Icon.svelte'

  let { label, value, options, onChange }: {
    label: string
    value: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
  } = $props()
  let open = $state(false)
  let selectedLabel = $derived(options.find(option => option.value === value)?.label || value)
  $effect(() => { if (!$responsive.isMobile) open = false })
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }
</script>

{#if $responsive.isMobile}
  <button class="settings-select mobile-setting-select" type="button" aria-label={`${label}：${selectedLabel}`} aria-haspopup="dialog" aria-expanded={open} onclick={() => open = true}>
    <span>{selectedLabel}</span><Icon name="chevron-down" size={18} />
  </button>
{:else}
  <select class="settings-select" aria-label={label} {value} onchange={event => onChange(event.currentTarget.value)}>
    {#each options as option}<option value={option.value}>{option.label}</option>{/each}
  </select>
{/if}

{#if open}
  <div class="mobile-choice-portal" use:portal>
    <button class="mobile-choice-backdrop" type="button" aria-label={`关闭${label}`} onclick={() => open = false} transition:fade={{ duration: reducedMotion() ? 0 : 240 }}></button>
    <div class="mobile-choice-sheet" data-bottom-panel role="dialog" aria-modal="true" aria-label={label} tabindex="-1" use:dialogFocus={() => open = false} in:mobileSheet out:mobileSheet>
      <button class="m-sheet-handle" type="button" aria-label={`关闭${label}`} onclick={() => open = false} use:mobileDrag={{ close: () => open = false, panel: true }}></button>
      <header><h2>{label}</h2><button class="mobile-choice-done" type="button" onclick={() => open = false}>完成</button></header>
      <div class="mobile-choice-body" role="group" aria-label={label}>
        {#each options as option}
          <button class="mobile-choice-option" class:active={value === option.value} type="button" aria-pressed={value === option.value} onclick={() => { if (value !== option.value) onChange(option.value) }}>
            <span>{option.label}</span>{#if value === option.value}<Icon name="check" size={20} />{/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
