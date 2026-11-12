<script lang="ts">
  import { mobileDock } from '../stores/mobile-dock.svelte.ts'
  import { DOCK_TABS, MAX_DOCK_TABS } from '../settings/mobile-dock.ts'
  import SettingSelect from './SettingSelect.svelte'
  import Icon from './ui/Icon.svelte'
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
    <div class="dock-settings__heading"><strong id="dock-items-title">导航图标</strong><small>已选 {mobileDock.config.tabs.length} / {MAX_DOCK_TABS} · 设置始终保留</small></div>
    {#each DOCK_TABS as tab (tab.id)}
      {@const selected = mobileDock.config.tabs.includes(tab.id)}
      {@const locked = tab.id === 'settings' || (selected && mobileDock.config.tabs.length <= 2) || (!selected && mobileDock.config.tabs.length >= MAX_DOCK_TABS)}
      <div class="dock-settings__choice">
        <button type="button" role="checkbox" aria-checked={selected} disabled={locked} onclick={() => mobileDock.toggleTab(tab.id)}>
          <span class="dock-settings__check" class:checked={selected} aria-hidden="true">{#if selected}<Icon name="check" size={16} />{/if}</span>
          <span>{tab.label}</span>{#if tab.id === 'settings'}<small>固定</small>{/if}
        </button>
        {#if selected && tab.icons.length > 1}
          <SettingSelect label={`${tab.label}图标`} value={mobileDock.config.icons[tab.id] || tab.icons[0].value} options={tab.icons.map(icon => ({ ...icon }))} onChange={value => mobileDock.setIcon(tab.id, value)} />
        {/if}
      </div>
    {/each}
  </section>
  <p class="dock-settings__note">未显示的主页面可以从底栏“更多”进入。</p>
  {#if mobileDock.error}<p class="dock-settings__error" role="alert">{mobileDock.error}</p>{/if}
  <button class="dock-settings__reset" type="button" onclick={() => mobileDock.reset()}>恢复默认</button>
</div>

<style>
  .dock-settings { display: grid; gap: 16px; }
  .dock-settings__section { overflow: hidden; border-radius: var(--radius-md); background: var(--settings-group, var(--bg-surface)); }
  .dock-settings__row { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; }
  .dock-settings__row + .dock-settings__row { border-top: 1px solid var(--border); }
  .dock-settings__row > span { min-width: 0; display: grid; gap: 4px; }
  .dock-settings__row strong, .dock-settings__choice button { font-size: 15px; font-weight: 400; }
  .dock-settings__row small, .dock-settings__heading small, .dock-settings__choice small { color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
  .dock-settings__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 16px 16px 8px; }
  .dock-settings__heading strong { font-size: 14px; }
  .dock-settings__choice { display: flex; align-items: center; gap: 8px; padding-right: 12px; border-top: 1px solid var(--border); }
  .dock-settings__choice > button { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 8px 16px; color: var(--text); background: transparent; text-align: left; }
  .dock-settings__choice > button:disabled { opacity: .55; }
  .dock-settings__choice small { margin-left: auto; }
  .dock-settings__check { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border: 1px solid var(--text-secondary); border-radius: var(--radius-xs); color: white; }
  .dock-settings__check.checked { border-color: var(--accent); background: var(--accent); }
  .dock-settings__note, .dock-settings__error { margin: 0; padding: 0 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
  .dock-settings__error { color: var(--danger); }
  .dock-settings__reset { justify-self: start; min-height: 44px; padding: 0 12px; color: var(--accent); background: transparent; }
  .dock-settings button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
