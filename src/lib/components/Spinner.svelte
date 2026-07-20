<script>
  let { size = 'md', label = '' } = $props()

  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  }
</script>

<div class="spinner-wrapper" class:with-label={!!label}>
  <svg
    class="spinner-icon"
    style="width: {sizeMap[size]}px; height: {sizeMap[size]}px;"
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="2"
      opacity="0.08"
    />
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="2"
      stroke-dasharray="15.7 62.8"
      stroke-linecap="round"
      class="spinner-arc"
    />
  </svg>
  {#if label}
    <p class="spinner-label">{label}</p>
  {/if}
</div>

<style>
  .spinner-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .spinner-wrapper.with-label {
    gap: 16px;
  }

  .spinner-icon {
    color: var(--text-secondary);
    animation: macSpinning 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .spinner-arc {
    transform-origin: 12px 12px;
  }

  .spinner-label {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.01em;
  }
</style>
