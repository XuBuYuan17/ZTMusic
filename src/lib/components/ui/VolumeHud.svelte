<script lang="ts">
  import { player } from '../../stores/player.svelte.ts'
  import Icon from './Icon.svelte'

  let visible = $state(false)
  let firstRun = true
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  // 追踪唯一数据源 player.volume：任意入口调节都在此汇总；跳过首次挂载避免启动闪现
  $effect(() => {
    const v = player.volume
    if (firstRun) { firstRun = false; return }
    visible = true
    hideTimer = setTimeout(() => { visible = false }, 1000)
    return () => { if (hideTimer) clearTimeout(hideTimer) }
  })

  let iconName = $derived(player.volume === 0 ? 'volume-off' : player.volume < 0.5 ? 'volume' : 'volume-full')
</script>

<div class="volume-hud" class:show={visible} aria-hidden="true">
  <Icon name={iconName} size={28} strokeWidth={1.8} />
  <span class="volume-hud__pct">{Math.round(player.volume * 100)}%</span>
</div>

<style>
  .volume-hud {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 112px;
    height: 112px;
    border-radius: var(--radius-xl);
    background: rgba(28, 28, 30, 0.72);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
    color: #fff;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translate(-50%, -50%) scale(0.92);
    transition: opacity 180ms ease-out, transform 180ms ease-out, visibility 180ms;
  }

  .volume-hud.show {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, -50%) scale(1);
  }

  .volume-hud__pct {
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
</style>
