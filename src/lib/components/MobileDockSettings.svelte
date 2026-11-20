<script lang="ts">
  import { mobileDock } from '../stores/mobile-dock.svelte.ts'
  import { toast } from '../stores/toast.svelte.ts'
  import { DOCK_TABS, MAX_DOCK_TABS, type DockTabId } from '../settings/mobile-dock.ts'
  import SettingSelect from './SettingSelect.svelte'
  import Icon from './ui/Icon.svelte'

  let dragging = $state<DockTabId | null>(null)
  let dragTarget = $state<DockTabId | null>(null)
  let dragOffset = $state(0)
  let dragStart = 0
  let dragCenter = 0
  let dragPointer: number | null = null
  let announcement = $state('')
  const orderedTabs = $derived([
    ...mobileDock.config.tabs.map(id => DOCK_TABS.find(tab => tab.id === id)!),
    ...DOCK_TABS.filter(tab => !mobileDock.config.tabs.includes(tab.id)),
  ])
  function chooseTab(id: DockTabId): void {
    if (!mobileDock.config.tabs.includes(id) && mobileDock.config.tabs.length >= MAX_DOCK_TABS) toast.showHud(`最多显示 ${MAX_DOCK_TABS} 个页面，请先取消一个已选页面`)
    else mobileDock.toggleTab(id)
  }
  function startDrag(event: PointerEvent, id: DockTabId): void {
    if (event.button !== 0 || dragPointer !== null) return
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-dock-tab]')
    if (!row) return
    const rect = row.getBoundingClientRect()
    dragPointer = event.pointerId
    dragStart = event.clientY
    dragCenter = rect.top + rect.height / 2
    dragging = id
    dragTarget = id
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  function moveDrag(event: PointerEvent): void {
    if (!dragging || event.pointerId !== dragPointer) return
    dragOffset = event.clientY - dragStart
    let nearest = Math.abs(event.clientY - dragCenter)
    let target = dragging
    for (const row of document.querySelectorAll<HTMLElement>('[data-dock-tab]')) {
      const id = row.dataset.dockTab as DockTabId
      if (id === dragging || !mobileDock.config.tabs.includes(id)) continue
      const rect = row.getBoundingClientRect()
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2))
      if (distance < nearest) { nearest = distance; target = id }
    }
    dragTarget = target
  }
  function finishDrag(cancelled = false): void {
    if (!cancelled && dragging && dragTarget && dragging !== dragTarget) {
      mobileDock.moveTab(dragging, dragTarget)
      announcement = '底栏顺序已更新'
    }
    dragging = null
    dragTarget = null
    dragOffset = 0
    dragPointer = null
  }
  function moveByKey(event: KeyboardEvent, id: DockTabId): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const index = mobileDock.config.tabs.indexOf(id)
    const target = mobileDock.config.tabs[index + (event.key === 'ArrowUp' ? -1 : 1)]
    if (target) { mobileDock.moveTab(id, target); announcement = '底栏顺序已更新' }
  }
</script>

<div class="dock-settings">
  <section class="dock-settings__section" aria-label="底栏样式">
    <div class="dock-settings__row">
      <span><strong>底栏样式</strong><small>悬浮底栏将播放器和导航放在一起</small></span>
      <SettingSelect label="底栏样式" value={mobileDock.config.layout} options={[{ value: 'classic', label: '经典' }, { value: 'floating', label: '悬浮' }]} onChange={value => mobileDock.setLayout(value === 'floating' ? 'floating' : 'classic')} />
    </div>
    <div class="dock-settings__row">
      <span><strong>图标文字</strong></span>
      <SettingSelect label="图标文字" value={mobileDock.config.labels ? 'labels' : 'icons'} options={[{ value: 'labels', label: '显示' }, { value: 'icons', label: '仅图标' }]} onChange={value => mobileDock.setLabels(value === 'labels')} />
    </div>
  </section>

  <section class="dock-settings__section" aria-labelledby="dock-items-title">
    <div class="dock-settings__heading"><strong id="dock-items-title">导航图标</strong><small>已选 {mobileDock.config.tabs.length} / {MAX_DOCK_TABS}</small></div>
    <p class="dock-settings__hint">开启页面后可拖动右侧按钮调整顺序；设置始终显示。</p>
    {#each orderedTabs as tab (tab.id)}
      {@const selected = mobileDock.config.tabs.includes(tab.id)}
      {@const locked = tab.id === 'settings' || (selected && mobileDock.config.tabs.length <= 2)}
      <div class="dock-settings__choice" class:dragging={dragging === tab.id} class:drag-target={dragTarget === tab.id && dragging !== tab.id} style:transform={dragging === tab.id ? `translateY(${dragOffset}px)` : undefined} data-dock-tab={tab.id}>
        <button class="dock-settings__choice-button" type="button" role="checkbox" aria-label={tab.label} aria-checked={selected} disabled={locked} onclick={() => chooseTab(tab.id)}>
          <span class="dock-settings__check" class:checked={selected} aria-hidden="true">{#if selected}<Icon name="check" size={16} />{/if}</span>
          <span class="dock-settings__name">{tab.label}{#if tab.id === 'settings'}<small>始终显示</small>{/if}</span>
        </button>
        {#if selected && tab.icons.length > 1}
          <SettingSelect label={`${tab.label}图标`} value={mobileDock.config.icons[tab.id] || tab.icons[0].value} options={tab.icons.map(icon => ({ ...icon }))} onChange={value => mobileDock.setIcon(tab.id, value)} />
        {/if}
        <button class="dock-settings__handle" type="button" aria-label={`调整${tab.label}顺序`} aria-describedby="dock-order-help" disabled={!selected}
          onpointerdown={event => startDrag(event, tab.id)} onpointermove={moveDrag} onpointerup={() => finishDrag()} onpointercancel={() => finishDrag(true)} onlostpointercapture={() => finishDrag(true)} onkeydown={event => moveByKey(event, tab.id)}><Icon name="menu" size={20} strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
    {/each}
  </section>
  <span class="dock-settings__sr-only" id="dock-order-help">拖动调整顺序，或使用上下方向键。</span>
  <span class="dock-settings__sr-only" aria-live="polite">{announcement}</span>
  <p class="dock-settings__note">未显示的页面可从设置页右上角的导航菜单进入。</p>
  {#if mobileDock.error}<p class="dock-settings__error" role="alert">{mobileDock.error}</p>{/if}
  <button class="dock-settings__reset" type="button" onclick={() => mobileDock.reset()}><span class="settings-button-label">恢复默认</span></button>
</div>

<style>
  .dock-settings { display: grid; gap: 16px; }
  .dock-settings__section { overflow: hidden; border: 1px solid color-mix(in srgb, var(--border) 65%, transparent); border-radius: var(--radius-lg); background: var(--settings-group, var(--bg-surface)); }
  .dock-settings__row { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; }
  .dock-settings__row + .dock-settings__row { border-top: 1px solid var(--border); }
  .dock-settings__row > span { min-width: 0; display: grid; gap: 4px; }
  .dock-settings__row strong, .dock-settings__choice { font-size: 15px; font-weight: 400; }
  .dock-settings__row small, .dock-settings__heading small, .dock-settings__choice small { color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
  .dock-settings__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 16px 16px 8px; }
  .dock-settings__heading strong { font-size: 14px; font-weight: 500; }
  .dock-settings__heading small { padding: 3px 9px; border-radius: 999px; background: var(--bg-hover); font-variant-numeric: tabular-nums; }
  .dock-settings__hint { margin: 0; padding: 0 16px 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  .dock-settings__choice { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 6px 12px 6px 16px; border-top: 1px solid var(--border); }
  .dock-settings__choice.dragging { position: relative; z-index: 2; border-radius: var(--radius-md); background: var(--settings-group, var(--bg-surface)); box-shadow: var(--shadow-lg); }
  .dock-settings__choice.drag-target { background: var(--accent-bg); }
  .dock-settings__choice-button { flex: 1; min-width: 0; min-height: 46px; display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: transparent; color: var(--text); text-align: left; font-size: 15px; }
  .dock-settings__choice-button:disabled { opacity: .55; }
  .dock-settings__name { flex: 1; min-width: 0; }
  .dock-settings__name small { display: block; }
  .dock-settings__check { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border: 1.5px solid var(--text-tertiary); border-radius: var(--radius-xs); color: white; transition: background-color 160ms ease, border-color 160ms ease; }
  .dock-settings__check.checked { border-color: var(--accent); background: var(--accent); }
  .dock-settings__handle { display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text-tertiary); cursor: grab; touch-action: none; }
  .dock-settings__handle:disabled { opacity: .25; cursor: default; }
  .dock-settings__handle:active { background: var(--bg-hover); color: var(--text); cursor: grabbing; }
  :global(html.mobile-runtime) .dock-settings__handle { touch-action: none; }
  .dock-settings__sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .dock-settings__note, .dock-settings__error { margin: 0; padding: 0 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  .dock-settings__error { color: var(--danger); }
  .dock-settings__reset { justify-self: start; min-height: 44px; padding: 0 12px; color: var(--accent); background: transparent; }
  .dock-settings button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
