<script lang="ts">
  import { dialogFocus, desktopFeedback } from '../app/desktop-motion.ts'
  import { ncm } from '../api/client.ts'
  import { notifyPlaylistChange } from '../stores/router.svelte.ts'
  import type { NormalizedPlaylist } from '../utils/normalize.ts'
  import type { SongId } from '../types/music.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { readPlaylistGroups, setPlaylistGroupMembership, type PlaylistGroup } from '../services/playlist-groups.ts'

  let {
    pl,
    onClose,
    onNotice,
  }: {
    pl: NormalizedPlaylist
    onClose?: () => void
    onNotice?: (text: string) => void
  } = $props()

  // 列表接口不保证带回 description，取不到就是空——此时用户不动这一栏就一个字都不会发出去，
  // 不会把服务端已有的简介覆盖成空。
  // 弹窗由父级的 {#if editTarget} 挂载，打开期间 pl 不会换，这里就是只要一次初始值
  // svelte-ignore state_referenced_locally
  const initialName = String(pl.name || '')
  // svelte-ignore state_referenced_locally
  const initialDesc = pl.description || ''
  let name = $state(initialName)
  let desc = $state(initialDesc)
  let saving = $state(false)
  const ownerId = auth.user?.userId
  function initialGroupData(): { groups: PlaylistGroup[]; error: string } {
    try { return { groups: readPlaylistGroups(ownerId), error: '' } }
    catch (e) { return { groups: [], error: e instanceof Error ? e.message : '无法读取本地分组' } }
  }
  const groupData = initialGroupData()
  const groups = groupData.groups
  const groupError = groupData.error
  const initialGroups = groups.filter(group => group.playlistIds.includes(String(pl.id))).map(group => group.id)
  let selectedGroups = $state([...initialGroups])

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function focusOnMount(node: HTMLInputElement) {
    queueMicrotask(() => { node.focus(); node.select() })
  }

  function close(): void {
    if (saving) return
    onClose?.()
  }

  // 桌面 Escape 由 dialogFocus 按弹层栈处理；移动保留窗口级关闭
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && document.documentElement.classList.contains('mobile-runtime')) {
      event.preventDefault()
      close()
    }
  }

  function handleBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) close()
  }

  async function submit(): Promise<void> {
    if (saving || !pl.id) return
    const nextName = name.trim()
    if (!nextName) { onNotice?.('歌单名称不能为空'); return }
    const nextDesc = desc.trim()
    // 只发改过的字段。改名与改简介是两个独立端点，正是为了避开 /playlist/update
    // 要求三项全传、回填时容易把没动过的字段清空的问题
    const rename = nextName !== initialName
    const redescribe = nextDesc !== initialDesc
    const groupChanged = selectedGroups.length !== initialGroups.length || selectedGroups.some(id => !initialGroups.includes(id))
    if (!rename && !redescribe && !groupChanged) { close(); return }
    if (auth.user?.userId !== ownerId) { onNotice?.('账号已切换，请重新打开编辑'); return }
    saving = true
    try {
      if (rename) {
        const r = rec(await ncm.playlistRename(pl.id as SongId, nextName))
        if (r && r.code !== 200) throw new Error((r.message || r.msg || '改名失败') as string)
      }
      if (redescribe) {
        const r = rec(await ncm.playlistUpdateDesc(pl.id as SongId, nextDesc))
        if (r && r.code !== 200) throw new Error((r.message || r.msg || '保存简介失败') as string)
      }
      if (groupChanged) setPlaylistGroupMembership(ownerId, pl.id, selectedGroups)
      if (rename || redescribe) notifyPlaylistChange(pl.id as SongId)
      onClose?.()
      onNotice?.(redescribe ? '已更新简介' : '已保存')
    } catch (e) {
      onNotice?.(groupChanged && (rename || redescribe) ? '保存未完成，歌单信息可能已更新，请检查本地分组' : ((e as { message?: unknown } | null | undefined)?.message || '保存失败') as string)
    } finally {
      saving = false
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="library-modal-backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="library-modal" use:dialogFocus={close} use:desktopFeedback role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="edit-playlist-title">
    <h3 class="library-modal-title" id="edit-playlist-title">编辑歌单</h3>
    <input
      class="library-modal-input"
      type="text"
      placeholder="歌单名称"
      bind:value={name}
      maxlength="30"
      use:focusOnMount
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
    />
    <textarea
      class="library-modal-textarea"
      placeholder="歌单简介（可留空）"
      bind:value={desc}
      maxlength="1000"
      rows="3"
    ></textarea>
    <fieldset class="playlist-edit-groups" disabled={saving}>
      <legend>本地分组</legend>
      {#if groupError}<p role="alert">{groupError}</p>
      {:else if groups.length}
        {#each groups as group (group.id)}
          <label><input type="checkbox" value={group.id} bind:group={selectedGroups} /> {group.name}</label>
        {/each}
      {:else}<p>可在设置中创建分组，仅保存在本设备。</p>{/if}
    </fieldset>
    <div class="library-modal-actions">
      <button class="library-modal-btn library-modal-btn-cancel" type="button" onclick={close} disabled={saving}>取消</button>
      <button class="library-modal-btn library-modal-btn-confirm" type="button" onclick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
    </div>
  </div>
</div>

<style>
  .playlist-edit-groups { display: grid; gap: 8px; min-width: 0; margin: 12px 0; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); }
  .playlist-edit-groups legend { padding: 0 5px; color: var(--text-secondary); font-size: 12px; }
  .playlist-edit-groups label { display: flex; align-items: center; gap: 8px; min-height: 32px; }
  .playlist-edit-groups p { color: var(--text-secondary); font-size: 12px; }
</style>
