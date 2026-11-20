<script lang="ts">
  import { fade } from 'svelte/transition'
  import { responsive } from '../utils/responsive.ts'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import Icon from './ui/Icon.svelte'

  let { label, description, value, options, onChange }: {
    label: string
    description?: string
    value: string
    options: { value: string; label: string; preview?: string }[]
    onChange: (value: string) => void
  } = $props()
  let open = $state(false)
  const selected = $derived(options.find(option => option.value === value))
  const selectedLabel = $derived(selected?.label || value)
  $effect(() => { if (!$responsive.isMobile) open = false })
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }
</script>

{#snippet optionLabel(text: string, preview?: string)}
  {#if preview}
    <span class="setting-option-label">
      <span class="setting-option-swatch" style:background={preview} aria-hidden="true"></span>
      <span>{text}</span>
    </span>
  {:else}
    <span>{text}</span>
  {/if}
{/snippet}

{#if $responsive.isMobile}
  <button class="settings-select mobile-setting-select" class:mobile-setting-select--row={Boolean(description)} type="button" aria-label={`${label}：${selectedLabel}`} aria-haspopup="dialog" aria-expanded={open} onclick={() => open = true}>
    {#if description}
      <strong class="setting-select-row-label">{label}</strong>
    {/if}
    {@render optionLabel(selectedLabel, selected?.preview)}
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
      <header>
        <div class="setting-select-heading">
          <h2>{label}</h2>
          {#if description}<p>{description}</p>{/if}
        </div>
        <button class="mobile-choice-done" type="button" onclick={() => open = false}><span class="settings-button-label">完成</span></button>
      </header>
      <div class="mobile-choice-body" role="group" aria-label={label}>
        {#each options as option}
          <button class="mobile-choice-option" class:active={value === option.value} type="button" aria-pressed={value === option.value} onclick={() => { if (value !== option.value) onChange(option.value) }}>
            {@render optionLabel(option.label, option.preview)}{#if value === option.value}<Icon name="check" size={20} />{/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .setting-option-label { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
  .setting-option-swatch { flex: 0 0 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); }
  .mobile-setting-select--row .setting-option-label { color: var(--text-secondary); font-size: .9375rem; }
  .setting-select-row-label { font-size: 1.0625rem; line-height: 1.4; font-weight: 400; text-align: start; }
  .setting-select-heading p { margin: 4px 0 0; color: var(--text-secondary); font-size: .8125rem; line-height: 1.4; }
</style>
