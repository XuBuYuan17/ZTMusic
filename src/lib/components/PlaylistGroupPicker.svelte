<script lang="ts">
  import { auth } from '../stores/auth.svelte.ts'
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { readPlaylistGroups, setPlaylistGroupMembership, type PlaylistGroup } from '../services/playlist-groups.ts'
  import type { NormalizedPlaylist } from '../utils/normalize.ts'

  let { playlist, onClose, onNotice }: { playlist: NormalizedPlaylist; onClose: () => void; onNotice: (message: string) => void } = $props()
  const ownerId = auth.user?.userId
  function initialGroupData(): { groups: PlaylistGroup[]; error: string } {
    try { return { groups: readPlaylistGroups(ownerId), error: '' } }
    catch (e) { return { groups: [], error: e instanceof Error ? e.message : '无法读取本地分组' } }
  }
  const groupData = initialGroupData()
  const groups = groupData.groups
  let error = $state(groupData.error)
  let selected = $state(groups.filter(group => group.playlistIds.includes(String(playlist.id))).map(group => group.id))
  function save(): void {
    try {
      if (auth.user?.userId !== ownerId) throw new Error('账号已切换，请重新选择')
      setPlaylistGroupMembership(ownerId, playlist.id, selected)
      onNotice('已保存本地分组')
      onClose()
    } catch (e) { error = e instanceof Error ? e.message : '保存失败' }
  }
</script>

<div class="library-modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose() }}>
  <div class="library-modal" role="dialog" aria-modal="true" aria-label="整理歌单分组" tabindex="-1" use:dialogFocus={onClose}>
    <h3 class="library-modal-title">整理歌单分组</h3>
    <p class="group-picker__caption">{playlist.name} · 仅保存在本设备</p>
    {#if groups.length}
      <div class="group-picker__list">{#each groups as group (group.id)}<label><input type="checkbox" value={group.id} bind:group={selected} /> {group.name}</label>{/each}</div>
    {:else if !error}<p class="group-picker__caption">请先在设置中创建分组。</p>{/if}
    {#if error}<p role="alert" class="group-picker__error">{error}</p>{/if}
    <div class="library-modal-actions"><button class="library-modal-btn library-modal-btn-cancel" type="button" onclick={onClose}>取消</button><button class="library-modal-btn library-modal-btn-confirm" type="button" disabled={!groups.length} onclick={save}>保存</button></div>
  </div>
</div>

<style>
  .group-picker__caption { margin: 10px 0; color: var(--text-secondary); font-size: 13px; }
  .group-picker__list { display: grid; gap: 8px; max-height: 40vh; overflow: auto; margin: 12px 0; }
  .group-picker__list label { display: flex; align-items: center; gap: 8px; min-height: 36px; }
  .group-picker__error { color: var(--danger); font-size: 13px; }
</style>
