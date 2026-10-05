<script lang="ts">
  import { player } from '../../stores/player.svelte.ts'
  import type { PlayMode } from '../../types/player.ts'
  import { onDestroy } from 'svelte'
  import Icon from './Icon.svelte'

  const MODE_HUD: Record<PlayMode, { icon: string; text: string }> = {
    list: { icon: 'repeat', text: '顺序播放' },
    repeat: { icon: 'repeat-1', text: '单曲循环' },
    shuffle: { icon: 'shuffle-lg', text: '随机播放' },
  }

  let visible = $state(false)
  let iconName = $state('volume-full')
  let text = $state('')
  let isLabel = $state(false)
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  // Ignore requests from before this component mounted, including any restored state.
  let lastRequest = player.hudRequest
  onDestroy(() => { if (hideTimer) clearTimeout(hideTimer) })

  function flash(nextIcon: string, nextText: string, label: boolean): void {
    iconName = nextIcon
    text = nextText
    isLabel = label
    visible = true
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { visible = false }, 1200)
  }

  // Only the explicit setVolume/setMode controls request feedback. Native snapshots
  // can arrive seconds after reveal, and must never impersonate a user action.
  $effect(() => {
    const request = player.hudRequest
    if (!request || request === lastRequest) return
    lastRequest = request
    if (request.kind === 'volume') {
      const v = request.volume
      flash(v === 0 ? 'volume-off' : v < 0.5 ? 'volume' : 'volume-full', `${Math.round(v * 100)}%`, false)
    } else flash(MODE_HUD[request.mode].icon, MODE_HUD[request.mode].text, true)
  })
</script>

<div class="player-hud" class:show={visible} aria-hidden="true">
  <Icon name={iconName} size={28} strokeWidth={isLabel ? 2.2 : 1.8} />
  <span class="player-hud__text" class:label={isLabel}>{text}</span>
</div>

<style>
  .player-hud {
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

  .player-hud.show {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, -50%) scale(1);
  }

  .player-hud__text {
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  /* 模式提示是文字不是数字：26px 放不下「随机播放」，且不需要等宽数字 */
  .player-hud__text.label {
    font-size: 15px;
    font-weight: 500;
    font-variant-numeric: normal;
  }
</style>
