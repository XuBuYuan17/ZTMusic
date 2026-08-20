<script>
  import { onMount } from 'svelte'
  import { formatDuration } from '../format.js'
  import { player } from '../stores/player.svelte.js'
  import { localMusic } from '../stores/local-music.svelte.js'
  import Icon from '../components/ui/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'

  let fileInput = $state(null)
  let folderInput = $state(null)
  let query = $state('')
  let deleteTarget = $state(null)
  let showClearConfirm = $state(false)
  let filteredTracks = $derived.by(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return localMusic.tracks
    return localMusic.tracks.filter((track) => [
      track.name,
      track.ar?.map((artist) => artist.name).join(' '),
      track.al?.name,
      track.fileName,
      track.remoteUrl,
    ].some((value) => String(value || '').toLowerCase().includes(keyword)))
  })

  onMount(() => localMusic.init())

  function formatSize(bytes) {
    if (!bytes) return '0 B'
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  }

  async function importSelection(event) {
    const input = event.currentTarget
    await localMusic.importFiles(input.files)
    input.value = ''
  }

  function playTrack(track) {
    const index = filteredTracks.findIndex((item) => item.id === track.id)
    player.playQueue(filteredTracks, Math.max(index, 0))
  }

  function playAll() {
    if (filteredTracks.length) player.playQueue(filteredTracks, 0)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    player.removeTracksById([deleteTarget.id])
    await localMusic.remove(deleteTarget.id)
    deleteTarget = null
  }

  async function confirmClear() {
    player.removeTracksById(localMusic.localTracks.map((track) => track.id))
    await localMusic.clear()
    showClearConfirm = false
  }

  async function connectWebDav() {
    await localMusic.connectWebDav()
  }
</script>

<div class="local-page fade-in">
  <header class="local-header">
    <div>
      <span class="local-kicker">On this device</span>
      <h1>本地音乐</h1>
      <p>{localMusic.tracks.length} 首 · 本机 {localMusic.localTracks.length} 首 · WebDAV {localMusic.webdavTracks.length} 首</p>
    </div>
    <div class="local-header-actions">
      <input bind:this={fileInput} class="local-file-input" type="file" accept="audio/*,.mp3,.flac,.wav,.ogg,.opus,.m4a,.aac" multiple onchange={importSelection} />
      <input bind:this={folderInput} class="local-file-input" type="file" accept="audio/*,.mp3,.flac,.wav,.ogg,.opus,.m4a,.aac" multiple webkitdirectory="" onchange={importSelection} />
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

  {#if localMusic.importing}
    <div class="local-import-status" role="status">
      <span>正在导入 {localMusic.importCurrent} / {localMusic.importTotal}</span>
      <div><i style:width={`${localMusic.importTotal ? localMusic.importCurrent / localMusic.importTotal * 100 : 0}%`}></i></div>
    </div>
  {:else if localMusic.error || localMusic.message}
    <div class="local-message" class:error={localMusic.error} role="status">{localMusic.error || localMusic.message}</div>
  {/if}

  <section class="local-webdav">
    <div>
      <span class="local-kicker">Remote library</span>
      <h2>WebDAV 曲库</h2>
      <p>连接 NAS、AList、坚果云等 WebDAV 目录，扫描到的音频会进入同一个播放队列。</p>
    </div>
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
        <Icon name="link" size={17} /> {localMusic.webdavLoading ? '扫描中…' : localMusic.webdavConnected ? '刷新' : '连接'}
      </button>
      {#if localMusic.webdavTracks.length}
        <button class="local-btn local-btn--ghost" disabled={localMusic.webdavLoading} onclick={() => localMusic.disconnectWebDav()}>
          断开
        </button>
      {/if}
    </div>
  </section>

  {#if localMusic.tracks.length}
    <div class="local-toolbar">
      <label class="local-search">
        <Icon name="search" size={17} />
        <input type="search" bind:value={query} placeholder="搜索本地歌曲、歌手或专辑" />
      </label>
      <button class="local-clear" disabled={!localMusic.localTracks.length} onclick={() => showClearConfirm = true}>清空本机导入</button>
    </div>
  {/if}

  {#if localMusic.loading}
    <div class="local-empty" aria-busy="true">正在读取本地曲库…</div>
  {:else if !localMusic.tracks.length}
    <div class="local-empty">
      <span class="local-empty-icon"><Icon name="music" size={34} /></span>
      <h2>还没有本地音乐</h2>
      <p>导入音频文件或文件夹后，就能和在线歌曲使用同一套播放队列。</p>
      <button class="local-btn local-btn--primary" onclick={() => fileInput?.click()}>选择音乐文件</button>
    </div>
  {:else if !filteredTracks.length}
    <div class="local-empty local-empty--compact">没有匹配“{query}”的本地歌曲</div>
  {:else}
    <div class="local-list" role="list">
      {#each filteredTracks as track, index (track.id)}
        <div class="local-track" class:active={player.id === track.id} role="listitem">
          <button class="local-track-main" onclick={() => playTrack(track)} aria-label={`播放 ${track.name}`}>
            <span class="local-track-index">{player.id === track.id && player.playing ? '▶' : index + 1}</span>
            <span class="local-track-cover"><Icon name="music-note" size={20} /></span>
            <span class="local-track-copy">
              <strong>{track.name}</strong>
              <small>{track.source === 'webdav' ? 'WebDAV' : track.ar?.map((artist) => artist.name).join(' / ') || '未知歌手'}</small>
            </span>
            <span class="local-track-album">{track.al?.name || '本地音乐'}</span>
            <span class="local-track-size">{formatSize(track.fileSize)}</span>
            <span class="local-track-duration">{track.dt ? formatDuration(track.dt) : '--:--'}</span>
          </button>
          <button class="local-track-delete" onclick={() => deleteTarget = track} aria-label={`从曲库移除 ${track.name}`} title={track.source === 'webdav' ? '移除本次 WebDAV 结果' : '从曲库移除'}>
            <Icon name="trash" size={17} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

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
  .local-btn { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 15px; border-radius: var(--radius-md); font-size: 13px; font-weight: 700; transition: transform .15s, background .15s; }
  .local-btn:active { transform: scale(.97); }
  .local-btn:disabled { opacity: .48; cursor: default; transform: none; }
  .local-btn--secondary { color: var(--text); background: var(--bg-elevated); border: 1px solid var(--border); }
  .local-btn--primary { color: #fff; background: var(--accent); }
  .local-btn--ghost { color: var(--text-tertiary); background: transparent; border: 1px solid var(--border); }
  .local-import-status, .local-message { padding: 12px 14px; border-radius: var(--radius-md); background: var(--accent-bg); color: var(--accent); font-size: 13px; font-weight: 500; }
  .local-import-status { display: grid; gap: 8px; }
  .local-import-status > div { height: 4px; overflow: hidden; border-radius: 999px; background: var(--bg-layer); }
  .local-import-status i { display: block; height: 100%; background: var(--accent); transition: width .16s; }
  .local-message.error { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .local-webdav { display: grid; grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.4fr); align-items: end; gap: 16px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 70%, transparent); }
  .local-webdav h2 { margin: 6px 0 5px; font-size: 20px; line-height: 1.2; }
  .local-webdav p { max-width: 460px; color: var(--text-tertiary); font-size: 13px; line-height: 1.5; }
  .local-webdav-form { display: grid; grid-template-columns: minmax(220px, 1.4fr) minmax(120px, .7fr) minmax(120px, .7fr) auto auto; gap: 8px; align-items: end; }
  .local-webdav-form label { min-width: 0; display: grid; gap: 6px; color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
  .local-webdav-form input { width: 100%; min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-md); outline: 0; color: var(--text); background: var(--bg-layer); font: inherit; }
  .local-webdav-form input:focus { border-color: var(--accent); }
  .local-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .local-search { width: min(420px, 100%); min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-elevated); color: var(--text-tertiary); }
  .local-search:focus-within { border-color: var(--accent); }
  .local-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--text); background: transparent; font: inherit; }
  .local-clear { color: var(--danger); font-size: 13px; font-weight: 500; }
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
  .local-track-delete { width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-tertiary); opacity: 0; }
  .local-track:hover .local-track-delete, .local-track-delete:focus-visible { opacity: 1; }
  .local-track-delete:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .local-empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 32px; border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); color: var(--text-tertiary); text-align: center; }
  .local-empty-icon { width: 68px; height: 68px; display: grid; place-items: center; border-radius: var(--radius-lg); color: var(--accent); background: var(--accent-bg); }
  .local-empty h2 { color: var(--text); font-size: 20px; }
  .local-empty p { max-width: 420px; font-size: 13px; line-height: 1.6; }
  .local-empty--compact { min-height: 180px; }

  :global(html.mobile-runtime) .local-page { gap: 16px; padding-bottom: 24px; }
  :global(html.mobile-runtime) .local-header { align-items: stretch; flex-direction: column; gap: 14px; }
  :global(html.mobile-runtime) .local-header h1 { font-size: 30px; }
  :global(html.mobile-runtime) .local-header-actions { display: grid; grid-template-columns: 1fr 1fr; }
  :global(html.mobile-runtime) .local-header-actions .local-btn--primary { grid-column: 1 / -1; }
  :global(html.mobile-runtime) .local-webdav { grid-template-columns: 1fr; padding: 14px; border-radius: var(--radius-md); }
  :global(html.mobile-runtime) .local-webdav-form { grid-template-columns: 1fr; }
  :global(html.mobile-runtime) .local-toolbar { align-items: stretch; flex-direction: column; }
  :global(html.mobile-runtime) .local-search { width: 100%; }
  :global(html.mobile-runtime) .local-clear { align-self: flex-end; }
  :global(html.mobile-runtime) .local-list { border-radius: var(--radius-md); }
  :global(html.mobile-runtime) .local-track { grid-template-columns: minmax(0, 1fr) 40px; }
  :global(html.mobile-runtime) .local-track-main { grid-template-columns: 38px minmax(0, 1fr) 48px; gap: 10px; padding-left: 10px; }
  :global(html.mobile-runtime) .local-track-index, :global(html.mobile-runtime) .local-track-album, :global(html.mobile-runtime) .local-track-size { display: none; }
  :global(html.mobile-runtime) .local-track-cover { width: 38px; height: 38px; }
  :global(html.mobile-runtime) .local-track-delete { opacity: 1; }
  :global(html.mobile-runtime) .local-empty { min-height: 260px; padding: 24px 18px; }
</style>
