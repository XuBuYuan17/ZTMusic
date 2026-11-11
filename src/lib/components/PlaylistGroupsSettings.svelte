<script lang="ts">
  import { auth } from '../stores/auth.svelte.ts'
  import { createPlaylistGroup, deletePlaylistGroup, renamePlaylistGroup, readPlaylistGroups, PLAYLIST_GROUPS_CHANGE, type PlaylistGroup } from '../services/playlist-groups.ts'

  let groups = $state<PlaylistGroup[]>([])
  let name = $state('')
  let editing = $state('')
  let editName = $state('')
  let deleting = $state('')
  let error = $state('')

  function refresh(): void {
    if (!auth.user?.userId) { groups = []; return }
    try { groups = readPlaylistGroups(auth.user.userId); error = '' }
    catch (e) { groups = []; error = e instanceof Error ? e.message : '读取分组失败' }
  }
  function run(action: () => void): boolean {
    try { action(); error = ''; refresh(); return true }
    catch (e) { error = e instanceof Error ? e.message : '保存分组失败'; return false }
  }
  $effect(() => {
    auth.user?.userId
    refresh()
    window.addEventListener(PLAYLIST_GROUPS_CHANGE, refresh)
    return () => window.removeEventListener(PLAYLIST_GROUPS_CHANGE, refresh)
  })
</script>

<section class="group-settings" aria-label="歌单分组设置">
  <div class="group-settings__intro"><strong>歌单分组</strong><span>分组仅保存在本设备，删除分组不会删除歌单。</span></div>
  {#if !auth.isLoggedIn}
    <p>登录后管理当前账号的分组</p>
  {:else}
    <form class="group-settings__new" onsubmit={(event) => { event.preventDefault(); if (run(() => createPlaylistGroup(auth.user?.userId, name))) name = '' }}>
      <input aria-label="新分组名称" maxlength="30" placeholder="新分组名称" bind:value={name} />
      <button type="submit">新建分组</button>
    </form>
    {#each groups as group (group.id)}
      <div class="group-settings__row">
        {#if editing === group.id}
          <input aria-label="分组名称" maxlength="30" bind:value={editName} />
          <button type="button" onclick={() => { if (run(() => renamePlaylistGroup(auth.user?.userId, group.id, editName))) editing = '' }}>保存</button>
          <button type="button" onclick={() => editing = ''}>取消</button>
        {:else if deleting === group.id}
          <span>删除「{group.name}」？歌单会保留。</span>
          <button type="button" class="danger" onclick={() => { if (run(() => deletePlaylistGroup(auth.user?.userId, group.id))) deleting = '' }}>确认删除</button>
          <button type="button" onclick={() => deleting = ''}>取消</button>
        {:else}
          <span><strong>{group.name}</strong><small>{group.playlistIds.length} 个歌单</small></span>
          <button type="button" onclick={() => { editing = group.id; editName = group.name; deleting = '' }}>重命名</button>
          <button type="button" onclick={() => { deleting = group.id; editing = '' }}>删除</button>
        {/if}
      </div>
    {/each}
  {/if}
  {#if error}<p class="group-settings__error" role="alert">{error}</p>{/if}
</section>

<style>
  .group-settings { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); }
  .group-settings__intro { display: grid; gap: 4px; }
  .group-settings__intro span, p, small { color: var(--text-secondary); font-size: 12px; }
  .group-settings__new, .group-settings__row { display: flex; align-items: center; gap: 8px; }
  input { min-width: 0; flex: 1; min-height: 40px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); }
  button { flex: none; min-height: 40px; padding: 0 10px; border-radius: var(--radius-sm); color: var(--accent); }
  button:hover { background: var(--bg-hover); }
  .group-settings__row > span { min-width: 0; flex: 1; display: grid; gap: 3px; overflow-wrap: anywhere; }
  .group-settings__error, .danger { color: var(--danger); }
</style>
