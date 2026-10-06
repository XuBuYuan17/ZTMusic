<script lang="ts">
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

  function refresh(next?: PlaybackSourcePlugin[]): void {
    plugins = next ?? listSourcePlugins()
  }

  function addPlugin(): void {
    status = ''
    try {
      createSourcePlugin({ name: pluginName, endpoint })
      pluginName = ''
      endpoint = ''
      refresh()
      status = '已添加'
    } catch (error) {
      status = error instanceof Error ? error.message : '添加失败'
    }
  }

  function toggle(plugin: PlaybackSourcePlugin): void {
    refresh(updateSourcePlugin(plugin.id, { enabled: !plugin.enabled }))
  }

  function move(plugin: PlaybackSourcePlugin, delta: -1 | 1): void {
    refresh(moveSourcePlugin(plugin.id, delta))
  }

  function remove(plugin: PlaybackSourcePlugin): void {
    refresh(removeSourcePlugin(plugin.id))
  }
</script>

<div class="source-plugins">
  <div class="source-plugins-intro">
    <div>
      <strong>音源插件</strong>
      <span>官方播放链优先；只有官方解析失败时，才按下面顺序尝试已启用插件。</span>
    </div>
    <span class="source-plugins-count">{plugins.filter((item) => item.enabled).length} 个启用</span>
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
            <button type="button" class="source-order" disabled={index === 0} aria-label="上移" onclick={() => move(plugin, -1)}>↑</button>
            <button type="button" class="source-order" disabled={index === plugins.length - 1} aria-label="下移" onclick={() => move(plugin, 1)}>↓</button>
            <button
              type="button"
              class="source-toggle"
              class:on={plugin.enabled}
              aria-pressed={plugin.enabled}
              onclick={() => toggle(plugin)}
            ><span>{plugin.enabled ? '开' : '关'}</span></button>
            <button type="button" class="source-remove" onclick={() => remove(plugin)}>移除</button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="source-plugin-empty">当前没有第三方音源。哲听不会预置或偷偷调用公共解析服务。</div>
  {/if}

  <div class="source-plugin-add">
    <label>
      <span>名称</span>
      <input bind:value={pluginName} type="text" maxlength="64" placeholder="例如：我的 LX Gateway" />
    </label>
    <label>
      <span>解析地址</span>
      <input bind:value={endpoint} type="url" placeholder="https://music.example.com/resolve" />
    </label>
    <div class="source-plugin-add-footer">
      <small>仅添加你自行部署或已获授权使用的服务。插件使用 ZT Playback Resolver v1 协议，不保存第三方播放 URL 到持久缓存。</small>
      <button type="button" disabled={!pluginName.trim() || !endpoint.trim()} onclick={addPlugin}>添加插件</button>
    </div>
    {#if status}<div class="source-plugin-status">{status}</div>{/if}
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
    font-weight: 650;
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
    font-weight: 650;
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
    font-weight: 650;
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
    font-weight: 600;
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
