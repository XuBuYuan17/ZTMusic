<script>
  import { toast } from '../stores/toast.svelte.js'
</script>

{#if toast.visible}
  <div class="toast toast--{toast.type}" role="status" aria-live="polite" onclick={toast.hide}>
    <span>{toast.message}</span>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: calc(120px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    padding: 10px 20px;
    border-radius: 22px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    max-width: 80vw;
    text-align: center;
    animation: toastFadeIn 0.2s ease-out;
    transition: opacity 0.3s ease;
  }

  .toast--success { background: rgba(52, 199, 89, 0.92); }
  .toast--error { background: rgba(255, 59, 48, 0.92); }
  .toast--warning { background: rgba(255, 159, 10, 0.92); }
  .toast--info { background: rgba(0, 0, 0, 0.85); }

  .toast span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes toastFadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
