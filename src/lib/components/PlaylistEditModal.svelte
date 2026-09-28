<script lang="ts">
  import { dialogFocus, desktopFeedback } from '../app/desktop-motion.ts'
  import { ncm } from '../api/client.ts'
  import { notifyPlaylistChange } from '../stores/router.svelte.ts'
  import type { NormalizedPlaylist } from '../utils/normalize.ts'
  import type { SongId } from '../types/music.ts'

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
    if (!rename && !redescribe) { close(); return }
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
      notifyPlaylistChange(pl.id as SongId)
      onClose?.()
      onNotice?.(redescribe ? '已更新简介' : '已保存')
    } catch (e) {
      onNotice?.(((e as { message?: unknown } | null | undefined)?.message || '保存失败') as string)
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
    <div class="library-modal-actions">
      <button class="library-modal-btn library-modal-btn-cancel" type="button" onclick={close} disabled={saving}>取消</button>
      <button class="library-modal-btn library-modal-btn-confirm" type="button" onclick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
    </div>
  </div>
</div>
