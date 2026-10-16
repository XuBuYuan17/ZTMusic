<script lang="ts">
  import { t } from '../i18n/index.svelte.ts'
  import {
    createSourcePlugin,
    listSourcePlugins,
    moveSourcePlugin,
    removeSourcePlugin,
    updateSourcePlugin,
    type PlaybackSourcePlugin,
  } from '../player/source-plugins.ts'

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

<div class="source-plugins">
  <div class="source-plugins-intro">
    <div>
      <strong>{t('sourcePlugins.plugins')}</strong>
      <span>{t('sourcePlugins.intro')}</span>
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
        </div>
      {/each}
    </div>
  {:else}
    <div class="source-plugin-empty">{t('sourcePlugins.empty')}</div>
  {/if}

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
    {#if status}<div class="source-plugin-status" class:error={statusError} role="status" aria-live="polite">{t(status)}</div>{/if}
  </div>
</div>

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
</style>
