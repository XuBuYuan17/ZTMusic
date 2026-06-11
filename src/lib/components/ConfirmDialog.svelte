<script>
  let { show = false, title = '确认', message = '', confirmText = '确定', cancelText = '取消', onConfirm, onCancel, danger = false } = $props()

  function handleConfirm() {
    onConfirm?.()
  }
  function handleCancel() {
    onCancel?.()
  }
</script>

{#if show}
  <div class="confirm-overlay" role="button" tabindex="0" aria-label="关闭" onclick={handleCancel} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCancel() } }}>
    <div class="confirm-card" role="dialog" tabindex="-1" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="confirm-title">{title}</div>
      <p class="confirm-message">{message}</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" onclick={handleCancel}>{cancelText}</button>
        <button class="confirm-btn confirm-btn-confirm" class:danger onclick={handleConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .confirm-card {
    background: var(--bg-surface);
    border-radius: 16px;
    padding: 28px 32px;
    max-width: 360px;
    width: 90%;
    box-shadow: 0 16px 64px rgba(0,0,0,0.32);
    animation: confirmEnter 0.2s cubic-bezier(0.32, 0, 0.38, 1);
  }
  @keyframes confirmEnter {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
  .confirm-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
  }
  .confirm-message {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 24px;
  }
  .confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .confirm-btn {
    padding: 8px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .confirm-btn:active {
    transform: scale(0.96);
  }
  .confirm-btn-cancel {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
  .confirm-btn-cancel:hover {
    background: var(--border);
  }
  .confirm-btn-confirm {
    background: var(--accent);
    color: #fff;
  }
  .confirm-btn-confirm:hover {
    background: var(--accent-hover);
  }
  .confirm-btn-confirm.danger {
    background: #e74c3c;
  }
  .confirm-btn-confirm.danger:hover {
    background: #c0392b;
  }
</style>
