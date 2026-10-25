<script lang="ts">
  import { progressiveCover } from '../utils/image.ts'

  // 封面预览卡：宽屏用网格卡，窄屏用横滑卡，只是布局不同，数据和动作一致。
  let {
    title = '',
    meta = '',
    cover = '',
    mobile = false,
    onSelect,
  }: {
    title?: string
    meta?: string
    cover?: string
    mobile?: boolean
    onSelect?: () => void
  } = $props()

  // 图片失败只隐藏图片，占位框还在，网格高度不会跳
  function hideBrokenImage(event: Event): void {
    const image = event.currentTarget
    if (image instanceof HTMLElement) image.style.visibility = 'hidden'
  }
</script>

{#if mobile}
  <button class="mobile-cover-item" type="button" data-motion="card" onclick={() => onSelect?.()}>
    <span class="mobile-cover-image">
      {#if cover}<img use:progressiveCover={{ source: cover, size: 360 }} alt="" onerror={hideBrokenImage} loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="mobile-cover-fallback">♪</span>{/if}
    </span>
    <strong>{title}</strong>
    {#if meta}<small>{meta}</small>{/if}
  </button>
{:else}
  <button class="music-cover-card" type="button" data-motion="card" onclick={() => onSelect?.()}>
    {#if cover}<img use:progressiveCover={{ source: cover, size: 360 }} alt="" onerror={hideBrokenImage} loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
    <strong>{title}</strong>
    {#if meta}<em>{meta}</em>{/if}
  </button>
{/if}

<style>
  .mobile-cover-fallback { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-tertiary); }
</style>
