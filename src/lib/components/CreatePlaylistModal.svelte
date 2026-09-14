<script lang="ts">
  import { ncm } from '../api/client.ts'

  let {
    onClose,
    onCreated,
    onNotice,
  }: {
    onClose?: () => void
    onCreated?: () => void | Promise<void>
    onNotice?: (text: string) => void
  } = $props()

  let createName = $state('')
  let creating = $state(false)

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function focusOnMount(node: HTMLInputElement) {
    queueMicrotask(() => node.focus())
  }

  function close(): void {
    if (creating) return
    onClose?.()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  function handleBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) close()
  }

  async function submitCreate(): Promise<void> {
    if (creating) return
    const name = createName.trim()
    if (!name) return
    creating = true
    try {
      const res = await ncm.playlistCreate(name)
      const r = rec(res)
      if (r && r.code !== 200) throw new Error((r.message || r.msg || '创建失败') as string)
      onClose?.()
      onNotice?.('已创建歌单')
      await onCreated?.()
    } catch (e) {
      onNotice?.(((e as { message?: unknown } | null | undefined)?.message || '创建失败') as string)
    } finally {
      creating = false
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="library-modal-backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="library-modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="create-playlist-title">
    <h3 class="library-modal-title" id="create-playlist-title">新建歌单</h3>
    <input
      class="library-modal-input"
      type="text"
      placeholder="请输入歌单名称"
      bind:value={createName}
      maxlength="30"
      use:focusOnMount
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCreate() } }}
    />
    <div class="library-modal-actions">
      <button class="library-modal-btn library-modal-btn-cancel" type="button" onclick={close} disabled={creating}>取消</button>
      <button class="library-modal-btn library-modal-btn-confirm" type="button" onclick={submitCreate} disabled={creating}>{creating ? '创建中…' : '创建'}</button>
    </div>
  </div>
</div>
