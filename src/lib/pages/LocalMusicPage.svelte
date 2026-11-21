<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import { playlistPortal } from '../components/PlaylistActionSheet.svelte'
  import { formatDuration } from '../format.ts'
  import { player } from '../stores/player.svelte.ts'
  import { localMusic } from '../stores/local-music.svelte.ts'
  import Icon from '../components/ui/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'

  type LocalTrack = (typeof localMusic.tracks)[number]

  let { mobile = false, active = true }: { mobile?: boolean; active?: boolean } = $props()
  let sourceFilter = $state<'all' | 'local' | 'webdav'>('all')
  let sheet = $state<'import' | 'sources' | 'track'>('import')
  let sheetOpen = $state(false)
  let selectedTrack = $state<LocalTrack | null>(null)
  const sourceFilters = [{ id: 'all', label: '全部' }, { id: 'local', label: '本机' }, { id: 'webdav', label: 'WebDAV' }] as const
  const hasBothSources = $derived(localMusic.localTracks.length > 0 && localMusic.webdavTracks.length > 0)
  const effectiveSource = $derived(mobile && hasBothSources ? sourceFilter : 'all')
  const sheetTitle = $derived(sheet === 'import' ? '导入音乐' : sheet === 'sources' ? '音乐来源' : selectedTrack?.name || '歌曲操作')
  const sourceSummary = $derived(localMusic.webdavLoading ? '扫描中…' : localMusic.webdavConnected ? localMusic.webdavTracks.length + ' 首歌曲' : '未连接')

  function openSheet(kind: typeof sheet): void {
    sheet = kind
    sheetOpen = true
  }
  function closeSheet(): void { sheetOpen = false }
  function chooseImport(input: HTMLInputElement | null): void {
    closeSheet()
    input?.click()
  }

  $effect(() => { if (!active) closeSheet() })

  let fileInput = $state<HTMLInputElement | null>(null)
  let folderInput = $state<HTMLInputElement | null>(null)
  let query = $state('')
  let deleteTarget = $state<LocalTrack | null>(null)
  let showClearConfirm = $state(false)
  let filteredTracks = $derived.by<LocalTrack[]>(() => {
    const keyword = query.trim().toLowerCase()
    const tracks = effectiveSource === 'local' ? localMusic.localTracks : effectiveSource === 'webdav' ? localMusic.webdavTracks : localMusic.tracks
    if (!keyword) return tracks
    return tracks.filter((track) => [
      track.name,
      track.ar?.map((artist) => artist.name).join(' '),
      track.al?.name,
      track.fileName,
      track.remoteUrl,
    ].some((value) => String(value || '').toLowerCase().includes(keyword)))
  })

  onMount(() => { localMusic.init() })

  function formatSize(bytes?: number): string {
    if (!bytes) return '0 B'
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  }

  async function importSelection(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const input = event.currentTarget
    await localMusic.importFiles(input.files)
    input.value = ''
  }

  function playTrack(track: LocalTrack): void {
    const index = filteredTracks.findIndex((item) => item.id === track.id)
    player.playQueue(filteredTracks, Math.max(index, 0))
  }

  function playAll(): void {
    if (filteredTracks.length) player.playQueue(filteredTracks, 0)
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    player.removeTracksById([deleteTarget.id])
    await localMusic.remove(deleteTarget.id)
    deleteTarget = null
  }

  async function confirmClear(): Promise<void> {
    player.removeTracksById(localMusic.localTracks.map((track) => track.id))
    await localMusic.clear()
    showClearConfirm = false
  }

  async function connectWebDav(): Promise<void> {
    await localMusic.connectWebDav()
  }
</script>

{#snippet webdavForm()}
  <div class="local-webdav-form">
    <label>
      <span>地址</span>
      <input type="url" bind:value={localMusic.webdavUrl} placeholder="https://example.com/dav/music/" autocomplete="url" />
    </label>
    <label>
      <span>用户名</span>
      <input type="text" bind:value={localMusic.webdavUsername} placeholder="可留空" autocomplete="username" />
    </label>
    <label>
      <span>密码</span>
      <input type="password" bind:value={localMusic.webdavPassword} placeholder="仅保存到本次会话" autocomplete="current-password" />
    </label>
    <button class="local-btn local-btn--secondary" disabled={localMusic.webdavLoading || !localMusic.webdavUrl.trim()} onclick={connectWebDav}>
      <Icon name="link" size={17} /> {localMusic.webdavLoading ? '扫描中…' : localMusic.webdavConnected ? '重新扫描' : '连接'}
    </button>
    {#if localMusic.webdavConnected}
      <button class="local-btn local-btn--ghost" disabled={localMusic.webdavLoading} onclick={() => localMusic.disconnectWebDav()}>
        断开
      </button>
    {/if}
  </div>
{/snippet}

{#snippet statusMessage()}
  {#if localMusic.error || localMusic.message}
    <div class="local-message" class:error={localMusic.error} role="status">{localMusic.error || localMusic.message}</div>
  {/if}
{/snippet}

{#snippet searchBox()}
  <label class="local-search">
    <Icon name="search" size={17} />
    <input type="search" bind:value={query} placeholder="搜索歌曲、歌手或专辑" aria-label="搜索本地音乐" />
  </label>
{/snippet}

{#snippet musicSources()}
  <button class="local-source-entry" type="button" aria-haspopup="dialog" onclick={() => openSheet('sources')}>
    <span class="local-source-label"><Icon name="link" size={18} /><strong>音乐来源</strong></span>
    <span class="local-source-status">WebDAV · {sourceSummary}</span>
  </button>
{/snippet}

<div class="local-page fade-in" class:mobile>
  <input bind:this={fileInput} class="local-file-input" type="file" accept="audio/*,.mp3,.flac,.wav,.ogg,.opus,.m4a,.aac" multiple onchange={importSelection} />
  <input bind:this={folderInput} class="local-file-input" type="file" accept="audio/*,.mp3,.flac,.wav,.ogg,.opus,.m4a,.aac" multiple webkitdirectory={true} onchange={importSelection} />

  {#if !mobile}
    <header class="local-header">
      <div>
        <span class="local-kicker">On this device</span>
        <h1>本地音乐</h1>
        <p>{localMusic.tracks.length} 首 · 本机 {localMusic.localTracks.length} 首 · WebDAV {localMusic.webdavTracks.length} 首</p>
      </div>
      <div class="local-header-actions">
        <button class="local-btn local-btn--secondary" disabled={localMusic.importing} onclick={() => fileInput?.click()}>
          <Icon name="add" size={17} /> 导入文件
        </button>
        <button class="local-btn local-btn--secondary" disabled={localMusic.importing} onclick={() => folderInput?.click()}>
          <Icon name="folder" size={17} /> 导入文件夹
        </button>
        <button class="local-btn local-btn--primary" disabled={!filteredTracks.length || localMusic.importing} onclick={playAll}>
          <Icon name="play" size={17} /> 播放全部
        </button>
      </div>
    </header>
  {:else if localMusic.tracks.length}
    <div class="local-mobile-controls">
      <span class="local-count">{localMusic.tracks.length} 首</span>
      <button class="local-btn local-btn--secondary" type="button" aria-haspopup="dialog" disabled={localMusic.importing} onclick={() => openSheet('import')}>
        <Icon name="add" size={16} /> 导入
      </button>
      <button class="local-btn local-btn--primary" type="button" disabled={!filteredTracks.length || localMusic.importing} onclick={playAll}>
        <Icon name="play" size={16} /> 播放全部
      </button>
    </div>
  {/if}

  {#if localMusic.importing}
    <div class="local-import-status" role="status">
      <span>正在导入 {localMusic.importCurrent} / {localMusic.importTotal}</span>
      <div><i style:width={localMusic.importTotal ? (localMusic.importCurrent / localMusic.importTotal * 100) + '%' : '0%'}></i></div>
    </div>
  {:else if !mobile || !sheetOpen || sheet !== 'sources'}
    {@render statusMessage()}
  {/if}

  {#if !mobile}
    <section class="local-webdav">
      <div>
        <span class="local-kicker">Remote library</span>
        <h2>WebDAV 曲库</h2>
        <p>连接 NAS、AList、坚果云等 WebDAV 目录，扫描到的音频会进入同一个播放队列。</p>
      </div>
      {@render webdavForm()}
    </section>
  {/if}

  {#if localMusic.tracks.length}
    <div class="local-toolbar">
      {@render searchBox()}
      {#if !mobile}
        <button class="local-clear" disabled={!localMusic.localTracks.length} onclick={() => showClearConfirm = true}>清空本机导入</button>
      {/if}
    </div>
    {#if mobile}
      {#if hasBothSources}
        <div class="local-source-filters" role="group" aria-label="歌曲来源">
          {#each sourceFilters as filter (filter.id)}
            <button type="button" aria-pressed={effectiveSource === filter.id} onclick={() => sourceFilter = filter.id}>{filter.label}</button>
          {/each}
        </div>
      {/if}
      {@render musicSources()}
    {/if}
  {/if}

  {#if localMusic.loading || !localMusic.initialized}
    <div class="local-empty" role="status">正在读取本地曲库…</div>
  {:else if !localMusic.tracks.length}
    <div class="local-empty">
      <span class="local-empty-icon"><Icon name="music" size={30} /></span>
      <h2>还没有本地歌曲</h2>
      <p>导入音频文件或文件夹后，就可以在这里播放。</p>
      <button class="local-btn local-btn--primary" type="button" aria-haspopup={mobile ? 'dialog' : undefined} disabled={localMusic.importing}
        onclick={() => { if (mobile) openSheet('import'); else fileInput?.click() }}>
        {#if mobile}<Icon name="add" size={18} /> 导入音乐{:else}选择音乐文件{/if}
      </button>
    </div>
    {#if mobile}{@render musicSources()}{/if}
  {:else if !filteredTracks.length}
    <div class="local-empty local-empty--compact">没有匹配“{query.trim()}”的本地歌曲</div>
  {:else}
    <div class="local-list" role="list">
      {#each filteredTracks as track, index (track.id)}
        <div class="local-track" class:active={player.id === track.id} role="listitem">
          <button class="local-track-main" onclick={() => playTrack(track)} aria-label={'播放 ' + track.name}>
            {#if !mobile}<span class="local-track-index">{player.id === track.id && player.playing ? '▶' : index + 1}</span>{/if}
            <span class="local-track-cover"><Icon name="music-note" size={20} /></span>
            <span class="local-track-copy">
              <strong>{track.name}</strong>
              <small>{track.ar?.map((artist) => artist.name).join(' / ') || (track.source === 'webdav' ? 'WebDAV' : '未知歌手')}</small>
            </span>
            {#if !mobile}
              <span class="local-track-album">{track.al?.name || '本地音乐'}</span>
              <span class="local-track-size">{formatSize(track.fileSize)}</span>
              <span class="local-track-duration">{track.dt ? formatDuration(track.dt) : '--:--'}</span>
            {/if}
          </button>
          {#if mobile}
            <button class="local-track-menu" type="button" aria-label={'更多操作：' + track.name} aria-haspopup="dialog"
              onclick={() => { selectedTrack = track; openSheet('track') }}><Icon name="more" size={20} /></button>
          {:else}
            <button class="local-track-delete" onclick={() => deleteTarget = track} aria-label={'从曲库移除 ' + track.name} title={track.source === 'webdav' ? '移除本次 WebDAV 结果' : '从曲库移除'}>
              <Icon name="trash" size={17} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  {#if mobile && localMusic.localTracks.length}
    <button class="local-clear" onclick={() => showClearConfirm = true}>清空本机导入</button>
  {/if}
</div>

{#if mobile && active && sheetOpen}
  <div use:playlistPortal>
    <button class="mobile-choice-backdrop" type="button" aria-label={'关闭' + sheetTitle} onclick={closeSheet} transition:fade={{ duration: reducedMotion() ? 0 : 200 }}></button>
    <div class="mobile-choice-sheet local-sheet" data-bottom-panel role="dialog" aria-modal="true" aria-label={sheetTitle} tabindex="-1"
      use:dialogFocus={closeSheet} in:mobileSheet out:mobileSheet>
      <button class="m-sheet-handle" type="button" aria-label={'收起' + sheetTitle} onclick={closeSheet} use:mobileDrag={{ close: closeSheet, panel: true }}></button>
      <header><h2>{sheetTitle}</h2><button class="mobile-choice-done" type="button" onclick={closeSheet}>完成</button></header>
      <div class="mobile-choice-body">
        {#if sheet === 'import'}
          <button class="mobile-choice-option" type="button" onclick={() => chooseImport(fileInput)}><Icon name="add" size={20} /><span>导入文件</span></button>
          <button class="mobile-choice-option" type="button" onclick={() => chooseImport(folderInput)}><Icon name="folder" size={20} /><span>导入文件夹</span></button>
        {:else if sheet === 'sources'}
          <p class="local-source-note">连接 WebDAV，扫描到的歌曲会显示在本地音乐里。</p>
          {@render webdavForm()}
          {@render statusMessage()}
        {:else if selectedTrack}
          <button class="mobile-choice-option local-remove-action" type="button" onclick={() => { deleteTarget = selectedTrack; closeSheet() }}>
            <Icon name="trash" size={19} /><span>从曲库移除</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  show={Boolean(deleteTarget)}
  title={deleteTarget?.source === 'webdav' ? '移除 WebDAV 歌曲' : '移除本地歌曲'}
  message={deleteTarget?.source === 'webdav' ? `将从本次 WebDAV 列表中移除“${deleteTarget?.name || ''}”，不会删除远程文件。` : `将删除哲听保存的“${deleteTarget?.name || ''}”副本，不会删除原始文件。`}
  confirmText="移除"
  danger={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteTarget = null}
/>

<ConfirmDialog
  show={showClearConfirm}
  title="清空本机导入"
  message={`将删除哲听保存的 ${localMusic.localTracks.length} 首歌曲副本，不会删除原始文件。WebDAV 列表会保留。`}
  confirmText="清空"
  danger={true}
  onConfirm={confirmClear}
  onCancel={() => showClearConfirm = false}
/>

<style>
  .local-page { display: grid; gap: 22px; }
  .local-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .local-kicker { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  .local-header h1 { margin: 6px 0 5px; font-size: 36px; line-height: 1.08; }
  .local-header p { color: var(--text-tertiary); font-size: 13px; }
  .local-header-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .local-file-input { display: none; }
  .local-btn { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 15px; border-radius: var(--radius-md); font-size: 13px; font-weight: 700; transition: background 150ms var(--ease-out); }
  .local-btn:disabled { opacity: .48; cursor: default; }
  .local-btn--secondary { color: var(--text); background: var(--bg-elevated); border: 1px solid var(--border); }
  .local-btn--primary { color: #fff; background: var(--accent); }
  .local-btn--ghost { color: var(--text-tertiary); background: transparent; border: 1px solid var(--border); }
  .local-import-status, .local-message { padding: 12px 14px; border-radius: var(--radius-md); background: var(--accent-bg); color: var(--accent); font-size: 13px; font-weight: 500; }
  .local-import-status { display: grid; gap: 8px; }
  .local-import-status > div { height: 4px; overflow: hidden; border-radius: 999px; background: var(--bg-layer); }
  .local-import-status i { display: block; height: 100%; background: var(--accent); transition: width .16s; }
  .local-message.error { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .local-webdav { min-width: 0; display: grid; grid-template-columns: minmax(220px, .8fr) minmax(0, 1.4fr); align-items: end; gap: 16px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 70%, transparent); }
  .local-webdav h2 { margin: 6px 0 5px; font-size: 20px; line-height: 1.2; }
  .local-webdav p { max-width: 460px; color: var(--text-tertiary); font-size: 13px; line-height: 1.5; }
  .local-webdav-form { min-width: 0; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(96px, .7fr) minmax(96px, .7fr) max-content max-content; gap: 8px; align-items: end; }
  .local-webdav-form label { min-width: 0; display: grid; gap: 6px; color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
  .local-webdav-form input { width: 100%; min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-md); outline: 0; color: var(--text); background: var(--bg-layer); font: inherit; overflow: hidden; text-overflow: ellipsis; }
  .local-webdav-form input:focus { border-color: var(--accent); }
  .local-webdav-form .local-btn { min-width: 0; white-space: nowrap; }
  .local-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .local-search { width: min(420px, 100%); min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-elevated); color: var(--text-tertiary); }
  .local-search:focus-within { border-color: var(--accent); }
  .local-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--text); background: transparent; font: inherit; }
  .local-clear { min-height: 36px; color: var(--danger); font-size: 13px; font-weight: 500; }
  .local-clear:disabled { opacity: .45; cursor: default; }
  .local-list { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 76%, transparent); }
  .local-track { display: grid; grid-template-columns: minmax(0, 1fr) 42px; align-items: center; border-bottom: 1px solid var(--border); }
  .local-track:last-child { border-bottom: 0; }
  .local-track:hover, .local-track.active { background: var(--bg-hover); }
  .local-track.active { color: var(--accent); }
  .local-track-main { min-width: 0; display: grid; grid-template-columns: 30px 40px minmax(160px, 1.4fr) minmax(100px, .8fr) 72px 54px; align-items: center; gap: 10px; padding: 10px 4px 10px 12px; color: inherit; text-align: left; }
  .local-track-index, .local-track-size, .local-track-duration { color: var(--text-tertiary); font-size: 12px; text-align: center; }
  .local-track-cover { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-tertiary); background: var(--bg-layer); }
  .local-track-copy { min-width: 0; display: grid; gap: 3px; }
  .local-track-copy strong, .local-track-copy small, .local-track-album { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .local-track-copy strong { font-size: 14px; font-weight: 500; }
  .local-track-copy small, .local-track-album { color: var(--text-tertiary); font-size: 12px; }
  .local-track-delete { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-tertiary); opacity: 0; }
  .local-track:hover .local-track-delete, .local-track-delete:focus-visible { opacity: 1; }
  .local-track-delete:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .local-empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 32px; border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); color: var(--text-tertiary); text-align: center; }
  .local-empty-icon { width: 68px; height: 68px; display: grid; place-items: center; border-radius: var(--radius-lg); color: var(--accent); background: var(--accent-bg); }
  .local-empty h2 { color: var(--text); font-size: 20px; }
  .local-empty p { max-width: 420px; font-size: 13px; line-height: 1.6; }
  .local-empty--compact { min-height: 180px; }

  @media (max-width: 1120px) {
    .local-webdav { grid-template-columns: 1fr; align-items: stretch; }
    .local-webdav-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .local-webdav-form label:first-child { grid-column: 1 / -1; }
  }

  .mobile.local-page { gap: 12px; padding-bottom: 24px; }
  .local-mobile-controls { display: flex; align-items: center; gap: 8px; }
  .local-mobile-controls .local-btn { min-height: 40px; padding: 0 12px; white-space: nowrap; }
  .local-count { flex: 1; color: var(--text-secondary); font-size: 13px; white-space: nowrap; }
  .mobile .local-search { width: 100%; min-height: 44px; }
  .local-source-entry { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-radius: var(--radius-md); background: var(--bg-surface); text-align: start; }
  .local-source-label { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text); }
  .local-source-label strong { font-size: 14px; font-weight: 500; }
  .local-source-status { color: var(--text-secondary); font-size: 12px; text-align: end; }
  .local-source-filters { display: flex; gap: 6px; }
  .local-source-filters button { min-height: 44px; padding: 0 14px; border-radius: 999px; background: var(--bg-surface); color: var(--text-secondary); font-size: 13px; }
  .local-source-filters button[aria-pressed="true"] { background: var(--accent-bg); color: var(--accent); }
  .mobile .local-empty { min-height: 0; padding: 30px 14px 24px; gap: 10px; border: none; }
  .mobile .local-empty-icon { width: 56px; height: 56px; color: var(--accent); }
  .mobile .local-empty h2 { font-size: 18px; }
  .mobile .local-empty p { max-width: 26ch; }
  .mobile .local-empty .local-btn { min-height: 44px; margin-top: 5px; }
  .mobile .local-list { border-radius: var(--radius-md); background: var(--md-container-highest); }
  .mobile .local-track { position: relative; grid-template-columns: minmax(0, 1fr) 44px; border-bottom: 0; }
  .mobile .local-track:not(:last-child)::after { position: absolute; inset: auto 8px 0 58px; height: 1px; background: var(--border); content: ''; pointer-events: none; }
  .mobile .local-track-main { min-height: 58px; padding: 8px 0 8px 8px; grid-template-columns: 40px minmax(0, 1fr); }
  .mobile .local-track-copy strong { font-size: 15px; font-weight: 400; }
  .mobile .local-track-copy small { color: var(--text-secondary); }
  .mobile .local-track.active { background: transparent; color: var(--md-primary); }
  .local-track-menu { display: grid; place-items: center; width: 44px; height: 44px; color: var(--text-secondary); }
  .local-track-menu :global(svg) { rotate: 90deg; }
  .mobile .local-clear { justify-self: end; }
  .local-sheet h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .local-sheet :global(.mobile-choice-option) { justify-content: flex-start; }
  .local-sheet .local-webdav-form { grid-template-columns: 1fr; margin: 4px 8px 8px; }
  .local-sheet .local-webdav-form input { height: 44px; }
  .local-source-note { padding: 4px 8px; color: var(--text-secondary); font-size: 13px; }
  .local-sheet .local-remove-action { color: var(--danger); }
</style>
