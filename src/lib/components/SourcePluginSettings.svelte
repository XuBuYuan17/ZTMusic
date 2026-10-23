<script lang="ts">
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { t } from '../i18n/index.svelte.ts'
  import {
    createSourcePlugin,
    listSourcePlugins,
    moveSourcePlugin,
    removeSourcePlugin,
    updateSourcePlugin,
    type PlaybackSourcePlugin,
  } from '../player/source-plugins.ts'

  let { mobile = false }: { mobile?: boolean } = $props()
  let addOpen = $state(false)
  let managing = $state<string | null>(null)
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }

  let plugins = $state<PlaybackSourcePlugin[]>(listSourcePlugins())
  let pluginName = $state('')
  let endpoint = $state('')
  let status = $state('')
  let statusError = $state(false)

  function handleButtonKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') event.stopPropagation()
  }

  function showError(error: unknown): void {
    statusError = true
    status = error instanceof Error && error.message.startsWith('sourcePlugins.') ? error.message : 'sourcePlugins.operationFailed'
  }

  function save(action: () => PlaybackSourcePlugin[], message: string): void {
    status = ''
    statusError = false
    try {
      refresh(action())
      status = message
    } catch (error) {
      showError(error)
    }
  }

  function refresh(next?: PlaybackSourcePlugin[]): void {
    plugins = next ?? listSourcePlugins()
  }

  function addPlugin(): void {
    status = ''
    statusError = false
    try {
      createSourcePlugin({ name: pluginName, endpoint })
      pluginName = ''
      endpoint = ''
      refresh()
      status = 'sourcePlugins.added'
      addOpen = false
    } catch (error) {
      showError(error)
    }
  }

  function toggle(plugin: PlaybackSourcePlugin): void {
    save(() => updateSourcePlugin(plugin.id, { enabled: !plugin.enabled }), 'sourcePlugins.updated')
  }

  function move(plugin: PlaybackSourcePlugin, delta: -1 | 1): void {
    save(() => moveSourcePlugin(plugin.id, delta), 'sourcePlugins.updated')
  }

  function remove(plugin: PlaybackSourcePlugin): void {
    save(() => removeSourcePlugin(plugin.id), 'sourcePlugins.removed')
  }
</script>

  {#snippet addForm()}
  <div class="source-plugin-add">
    <label>
      <span>{t('sourcePlugins.name')}</span>
      <input bind:value={pluginName} type="text" maxlength="64" placeholder={t('sourcePlugins.namePlaceholder')} />
    </label>
    <label>
      <span>{t('sourcePlugins.endpoint')}</span>
      <input bind:value={endpoint} type="url" placeholder="https://music.example.com/resolve" />
    </label>
    <div class="source-plugin-add-footer">
      <small>{t('sourcePlugins.help')}</small>
      <button type="button" onkeydown={handleButtonKeydown} disabled={!pluginName.trim() || !endpoint.trim()} onclick={addPlugin}>{t('sourcePlugins.add')}</button>
    </div>
    {#if status && (!mobile || statusError)}<div class="source-plugin-status" class:error={statusError} role="status" aria-live="polite">{t(status)}</div>{/if}
  </div>
  {/snippet}

<div class="source-plugins" class:mobile>
  <div class="source-plugins-intro">
    <div>
      <strong>{t('sourcePlugins.plugins')}</strong>
      <span>{mobile ? '按列表顺序尝试已启用的音源。仅使用你信任的服务。' : t('sourcePlugins.intro')}</span>
    </div>
    <span class="source-plugins-count">{plugins.filter((item) => item.enabled).length} {t('sourcePlugins.enabled')}</span>
  </div>

  {#if plugins.length > 0}
    <div class="source-plugin-list">
      {#each plugins as plugin, index (plugin.id)}
        <div class="source-plugin-row">
          <div class="source-plugin-copy">
            <strong>{plugin.name}</strong>
            <span>{plugin.endpoint}</span>
          </div>
          {#if mobile}
            <button
              type="button" onkeydown={handleButtonKeydown}
              class="source-toggle"
              class:on={plugin.enabled}
              aria-label={`${t('sourcePlugins.toggle')} ${plugin.name}`}
              aria-pressed={plugin.enabled}
              onclick={() => toggle(plugin)}
            ><span>{plugin.enabled ? t('common.on') : t('common.off')}</span></button>
            <div class="source-mobile-tools">
              <button class="source-manage" type="button" aria-label={`管理 ${plugin.name}`} aria-expanded={managing === plugin.id} onclick={() => managing = managing === plugin.id ? null : plugin.id}>管理</button>
              {#if managing === plugin.id}
            <button type="button" onkeydown={handleButtonKeydown} class="source-order" disabled={index === 0} aria-label={`${t('sourcePlugins.up')} ${plugin.name}`} onclick={() => move(plugin, -1)}>↑</button>
            <button type="button" onkeydown={handleButtonKeydown} class="source-order" disabled={index === plugins.length - 1} aria-label={`${t('sourcePlugins.down')} ${plugin.name}`} onclick={() => move(plugin, 1)}>↓</button>

            <button type="button" onkeydown={handleButtonKeydown} class="source-remove" onclick={() => remove(plugin)}>{t('sourcePlugins.remove')}</button>

              {/if}
            </div>
          {:else}
          <div class="source-plugin-actions">
            <button type="button" onkeydown={handleButtonKeydown} class="source-order" disabled={index === 0} aria-label={`${t('sourcePlugins.up')} ${plugin.name}`} onclick={() => move(plugin, -1)}>↑</button>
            <button type="button" onkeydown={handleButtonKeydown} class="source-order" disabled={index === plugins.length - 1} aria-label={`${t('sourcePlugins.down')} ${plugin.name}`} onclick={() => move(plugin, 1)}>↓</button>
            <button
              type="button" onkeydown={handleButtonKeydown}
              class="source-toggle"
              class:on={plugin.enabled}
              aria-label={`${t('sourcePlugins.toggle')} ${plugin.name}`}
              aria-pressed={plugin.enabled}
              onclick={() => toggle(plugin)}
            ><span>{plugin.enabled ? t('common.on') : t('common.off')}</span></button>
            <button type="button" onkeydown={handleButtonKeydown} class="source-remove" onclick={() => remove(plugin)}>{t('sourcePlugins.remove')}</button>
          </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="source-plugin-empty">{t('sourcePlugins.empty')}</div>
  {/if}


  {#if mobile}
    <button class="source-add-open" type="button" aria-haspopup="dialog" onclick={() => { status = ''; addOpen = true }}>{t('sourcePlugins.add')}</button>
    {#if status}<p class="source-plugin-status" class:error={statusError} role="status">{t(status)}</p>{/if}
  {:else}
    {@render addForm()}
  {/if}

</div>

{#if mobile && addOpen}
  <div class="source-add-portal" use:portal>
    <button class="source-add-backdrop" type="button" aria-label="关闭添加音源" onclick={() => addOpen = false}></button>
    <div class="source-add-dialog" role="dialog" aria-modal="true" aria-label="添加音源插件" tabindex="-1" data-bottom-panel use:dialogFocus={() => addOpen = false}>
      <header><h2>添加音源插件</h2><button type="button" onclick={() => addOpen = false}>取消</button></header>
      {@render addForm()}
    </div>
  </div>
{/if}

<style>
  .source-plugins {
    display: grid;
    gap: 0;
    color: var(--text);
  }

  .source-plugins-intro,
  .source-plugin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 62px;
    padding: 12px 14px;
  }

  .source-plugins-intro > div,
  .source-plugin-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .source-plugins strong {
    font-size: 14px;
    font-weight: 700;
  }

  .source-plugins span,
  .source-plugins small {
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.45;
  }

  .source-plugins-count {
    flex: 0 0 auto;
    color: var(--accent) !important;
    font-weight: 700;
  }

  .source-plugin-list {
    border-top: 1px solid var(--border);
  }

  .source-plugin-row + .source-plugin-row {
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }

  .source-plugin-copy span {
    max-width: min(52vw, 520px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-plugin-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .source-plugin-actions button,
  .source-plugin-add button {
    min-height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .source-order,
  .source-remove {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  .source-order:disabled {
    opacity: .35;
    cursor: default;
  }

  .source-remove { color: var(--danger); }

  .source-toggle {
    position: relative;
    width: 42px;
    padding: 3px !important;
    border-radius: 999px !important;
    background: color-mix(in srgb, var(--text-secondary) 28%, transparent);
  }

  .source-toggle::after {
    content: '';
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: 0 1px 3px rgb(0 0 0 / .18);
    transition: transform 160ms var(--ease-out);
  }

  .source-toggle.on { background: var(--accent); }
  .source-toggle.on::after { transform: translateX(18px); }
  .source-toggle span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .source-plugin-empty {
    padding: 14px;
    border-top: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
  }

  .source-plugin-add {
    display: grid;
    gap: 9px;
    padding: 14px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-layer) 20%, transparent);
  }

  .source-plugin-add label {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .source-plugin-add label > span {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .source-plugin-add input {
    min-width: 0;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    background: var(--bg);
    font: inherit;
    font-size: 12px;
    outline: none;
  }

  .source-plugin-add input:focus { border-color: var(--accent); }

  .source-plugin-add-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .source-plugin-add-footer small { max-width: 680px; }

  .source-plugin-add-footer button {
    flex: 0 0 auto;
    min-height: 34px;
    padding-inline: 12px;
    color: var(--accent);
    background: var(--accent-bg);
  }

  .source-plugin-add-footer button:disabled { opacity: .45; cursor: default; }

  .source-plugin-status {
    color: var(--accent);
    font-size: 11px;
  }

  .source-plugin-status.error { color: var(--danger); }

  .source-plugin-actions button:focus-visible,
  .source-plugin-add button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 620px) {
    .source-plugins-intro,
    .source-plugin-row {
      padding-inline: 13px;
    }

    .source-plugin-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 9px;
    }

    .source-plugin-copy span { max-width: calc(100vw - 64px); }

    .source-plugin-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .source-plugin-add label {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .source-plugin-add-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .source-plugin-add-footer button { align-self: flex-end; }
  }

  .mobile .source-plugins-intro { padding: 12px 16px; align-items: start; flex-wrap: wrap; }
  .mobile .source-plugins-intro strong { display: none; }
  .mobile .source-plugins-intro span, .mobile .source-plugin-empty { font-size: .8125rem; line-height: 1.5; }
  .mobile .source-plugin-copy strong { font-size: 1.0625rem; font-weight: 400; overflow-wrap: anywhere; }
  .mobile .source-plugin-copy span { max-width: 100%; white-space: normal; overflow-wrap: anywhere; font-size: .8125rem; }
  .mobile .source-order { color: var(--md-primary); background: transparent; }
  .mobile .source-remove { background: transparent; }
  .mobile .source-toggle { width: 52px; background: transparent; }
  .mobile .source-toggle::before { content: ''; position: absolute; inset: 6px 0; border-radius: 999px; background: color-mix(in srgb, var(--text-secondary) 28%, transparent); }
  .mobile .source-toggle::after { position: absolute; width: 26px; height: 26px; top: 9px; left: 3px; background: #fff; }
  .mobile .source-toggle.on::before { background: var(--md-primary); }
  .mobile .source-toggle.on::after { transform: translateX(20px); }
  .source-add-open { min-height: 52px; padding: 12px 16px; border: 0; border-top: 1px solid var(--border); color: var(--md-primary); background: transparent; font: inherit; font-size: 1.0625rem; text-align: left; }
  .mobile .source-plugin-status { margin: 0; padding: 12px 16px; font-size: .8125rem; }
  .source-add-portal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; }
  .source-add-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgb(0 0 0 / .4); }
  .source-add-dialog { position: relative; box-sizing: border-box; width: 100%; max-height: 90%; overflow: auto; padding: 8px 0 max(16px, env(safe-area-inset-bottom)); border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--bg-elevated); color: var(--text); }
  .source-add-dialog header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; }
  .source-add-dialog h2 { margin: 0; font-size: 1.0625rem; }
  .source-add-dialog header button { min-height: 44px; border: 0; background: transparent; color: var(--md-primary); font: inherit; }
  .source-add-dialog .source-plugin-add { padding: 16px; background: transparent; gap: 16px; }
  .source-add-dialog .source-plugin-add label { grid-template-columns: 1fr; gap: 6px; }
  .source-add-dialog .source-plugin-add label > span { font-size: .9375rem; }
  .source-add-dialog .source-plugin-add input { box-sizing: border-box; min-height: 48px; font-size: 1rem; }
  .source-add-dialog .source-plugin-add-footer { flex-direction: column; align-items: stretch; }
  .source-add-dialog .source-plugin-add-footer small, .source-add-dialog .source-plugin-status { font-size: .8125rem; line-height: 1.5; }
  .source-add-dialog .source-plugin-add-footer button { align-self: stretch; min-height: 48px; font-size: 1.0625rem; font-weight: 400; }
  :global(html.mobile-keyboard-open) .source-add-portal { top: var(--mobile-viewport-top, 0px); bottom: auto; height: var(--mobile-viewport-height, 100dvh); }
  @media (prefers-reduced-motion: reduce) { .source-toggle::after { transition: none; } }

  .mobile .source-plugin-row { padding: 12px 16px; display: grid; grid-template-columns: minmax(0, 1fr) 52px; align-items: center; gap: 4px 12px; }
  .mobile .source-plugin-copy { grid-column: 1; }
  .mobile .source-toggle { grid-column: 2; grid-row: 1; min-height: 44px; }
  .source-mobile-tools { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .source-mobile-tools button { min-height: 44px; min-width: 44px; padding: 0 8px; border: 0; border-radius: var(--radius-sm); font: inherit; font-size: .9375rem; color: var(--md-primary); background: transparent; }
  .source-mobile-tools .source-remove { color: var(--danger); margin-left: auto; }
  .source-manage { padding-left: 0 !important; }
  .mobile .source-plugins-intro { padding-block: 14px; }
  .source-add-dialog { background: var(--md-surface, var(--bg-elevated)); }
</style>
