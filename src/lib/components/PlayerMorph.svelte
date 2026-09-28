<script lang="ts">
  import { playerMorph, elementRect } from '../stores/player-morph.svelte.ts'
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { lerp } from '../app/morph-geometry.ts'
  import { coverUrl } from '../utils/image.ts'
  import { player } from '../stores/player.svelte.ts'
  import PCPlayer from './PCPlayer.svelte'
  import { closeDrag } from '../app/close-drag.ts'
  import { getSetting } from '../utils/settings.ts'

  let { onOpenArtist, onOpenAlbum, onOpenPlaylist, showLocalQueue = false, toggleLocalQueue }: {
    onOpenArtist?: (id: number | null) => void
    onOpenAlbum?: (id: number | null) => void
    onOpenPlaylist?: (id: number | null) => void
    showLocalQueue?: boolean
    toggleLocalQueue?: () => void
  } = $props()

  let textBlur = $state(true)
  $effect(() => {
    if (playerMorph.active) textBlur = getSetting('lyrics_text_blur_effect') !== 'false'
  })

  function barSnapshot(node: HTMLElement) {
    const bar = document.querySelector('.player-bar')
    if (!bar) return {}
    const clone = bar.cloneNode(true) as HTMLElement
    clone.classList.remove('morph-hidden', 'pressing')
    clone.inert = true
    clone.setAttribute('aria-hidden', 'true')
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'))
    node.append(clone)
    return { destroy() { clone.remove() } }
  }

  // 目标槽位：PCPlayer 与本层同批挂载，effect 在 DOM commit 后测得到
  function measureTargets(): void {
    const cover = document.querySelector('.player-morph .ly-cover-wrap')
    if (cover) {
      const img = cover.querySelector('.ly-cover')
      playerMorph.targetCover = elementRect(cover, img ? parseFloat(getComputedStyle(img).borderRadius) || 0 : 0)
    }
    const title = document.querySelector('.player-morph .ly-track-title')
    if (title) {
      playerMorph.targetTitle = elementRect(title, 0)
      const style = getComputedStyle(title)
      playerMorph.targetFont = parseFloat(style.fontSize)
      playerMorph.targetLineHeight = parseFloat(style.lineHeight) || playerMorph.targetFont * 1.2
      playerMorph.targetWeight = parseFloat(style.fontWeight) || 700
    }
  }

  $effect(() => {
    if (!playerMorph.active) return
    measureTargets()
    const observer = new ResizeObserver(measureTargets)
    document.querySelectorAll('.player-morph .ly-cover-wrap, .player-morph .ly-track-title').forEach(el => observer.observe(el))
    window.addEventListener('resize', measureTargets)
    return () => { observer.disconnect(); window.removeEventListener('resize', measureTargets) }
  })

  // 源标题颜色（条上，随主题）：插值到白
  function parseRgb(css: string): [number, number, number] {
    const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [15, 15, 17]
  }
  let sourceColor = $state<[number, number, number]>([15, 15, 17])
  $effect(() => {
    if (!playerMorph.active) return
    const el = document.querySelector('.lcd-meta__title')
    if (el) sourceColor = parseRgb(getComputedStyle(el).color)
  })

  let titleFont = $derived(lerp(playerMorph.sourceFont, playerMorph.targetFont, playerMorph.p))
  let titleLineHeight = $derived(lerp(playerMorph.sourceLineHeight, playerMorph.targetLineHeight, playerMorph.p))
  let titleWeight = $derived(lerp(playerMorph.sourceWeight, playerMorph.targetWeight, playerMorph.p))
  let titleColor = $derived([
    Math.round(lerp(sourceColor[0]!, 255, playerMorph.p)),
    Math.round(lerp(sourceColor[1]!, 255, playerMorph.p)),
    Math.round(lerp(sourceColor[2]!, 255, playerMorph.p)),
  ])

  // 浮层封面：先沿用条上 88px（已显示），600px 预载完成再换，免白闪
  let fcoverSrc = $state('')
  $effect(() => {
    const c = player.cover
    if (!c || !playerMorph.active) { fcoverSrc = ''; return }
    fcoverSrc = coverUrl(c, 88)
    const img = new Image()
    img.onload = () => { fcoverSrc = coverUrl(c, 600) }
    img.src = coverUrl(c, 600)
    return () => { img.onload = null }
  })
</script>

<!-- 桌面常驻外壳；--p 是所有 CSS 材质 / 入场映射的唯一进度输入 -->
<div class="player-morph" class:active={playerMorph.active} class:is-open={playerMorph.isOpen} class:has-shared-title={!!playerMorph.sourceTitle} class:ly-no-text-blur={!textBlur} style="--p:{playerMorph.p}">
  {#if playerMorph.active}
    {@const r = playerMorph.surfaceRect}
    {@const c = playerMorph.coverRect}
    {@const t = playerMorph.titleRect}
    <div class="pm-focus" role="dialog" aria-modal="true" aria-label="正在播放" tabindex="-1" use:dialogFocus={() => playerMorph.close()}>
      <button class="pm-close" type="button" use:closeDrag={true} onclick={() => playerMorph.close()} aria-label="收起歌词页" title="点击或向下拖动收起">
        <span></span>
      </button>
      <div class="pm-scrim"></div>
      <div class="pm-surface" style="clip-path: inset({r.top}px {r.right}px {r.bottom}px {r.left}px round {r.radius}px)">
        <div class="pm-glass"></div>
        <div class="pm-solid"></div>
        {#if player.cover}<div class="pm-art"><img src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer"></div>{/if}
        <div class="pm-veil"></div>
        {#if playerMorph.sourceBar}
          {@const bar = playerMorph.sourceBar}
          {#key bar}<div class="pm-bar-snapshot" aria-hidden="true" inert class:has-title={!!t} style="left:{bar.left}px;top:{bar.top}px;width:{bar.width}px;height:{bar.height}px" use:barSnapshot></div>{/key}
        {/if}
        <div class="pm-container">
          <PCPlayer
            onClose={() => playerMorph.close()}
            {onOpenArtist} {onOpenAlbum} {onOpenPlaylist}
            {showLocalQueue} {toggleLocalQueue}
          />
        </div>
        {#if c}
          <div class="pm-fcover" style="left:{c.left}px;top:{c.top}px;width:{c.width}px;height:{c.height}px;clip-path: inset(0 round {c.radius}px)">
            {#if fcoverSrc}<img src={fcoverSrc} alt="" referrerpolicy="no-referrer">{/if}
          </div>
        {/if}
        {#if t}
          <div class="pm-ftitle" style="left:{t.left}px;top:{t.top}px;width:{t.width}px;height:{t.height}px;font-size:{titleFont}px;line-height:{titleLineHeight}px;font-weight:{titleWeight};color:rgb({titleColor[0]},{titleColor[1]},{titleColor[2]})">
            {player.title || '未在播放'}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
