<script lang="ts">
  import { playerMorph, elementRect } from '../stores/player-morph.svelte.ts'
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { lerp } from '../app/morph-geometry.ts'
  import { coverUrl } from '../utils/image.ts'
  import { player } from '../stores/player.svelte.ts'
  import PCPlayer from './PCPlayer.svelte'
  import Icon from './ui/Icon.svelte'

  let { onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme, showLocalQueue = false, toggleLocalQueue }: {
    onOpenArtist?: (id: number | null) => void
    onOpenAlbum?: (id: number | null) => void
    onOpenPlaylist?: (id: number | null) => void
    onToggleTheme?: (event?: MouseEvent) => void
    showLocalQueue?: boolean
    toggleLocalQueue?: () => void
  } = $props()

  // 目标槽位：PCPlayer 与本层同批挂载，effect 在 DOM commit 后测得到
  function measureTargets(): void {
    const cover = document.querySelector('.player-morph .ly-cover-wrap')
    if (cover) playerMorph.targetCover = elementRect(cover, 12)
    const title = document.querySelector('.player-morph .ly-track-title')
    if (title) playerMorph.targetTitle = elementRect(title, 0)
  }

  $effect(() => {
    if (!playerMorph.active) return
    measureTargets()
    window.addEventListener('resize', measureTargets)
    return () => window.removeEventListener('resize', measureTargets)
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

  let targetFont = $derived(Math.max(18, Math.min(26, window.innerWidth * 0.0145)))
  let titleFont = $derived(lerp(14, targetFont, playerMorph.p))
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
  })
</script>

<!-- 桌面常驻外壳；--p 是所有 CSS 材质 / 入场映射的唯一进度输入 -->
<div class="player-morph" class:active={playerMorph.active} class:is-open={playerMorph.isOpen} style="--p:{playerMorph.p}">
  {#if playerMorph.active}
    {@const r = playerMorph.surfaceRect}
    {@const c = playerMorph.coverRect}
    {@const t = playerMorph.titleRect}
    <div class="pm-focus" use:dialogFocus={() => playerMorph.close()}>
      <div class="pm-scrim"></div>
      <div class="pm-surface" style="clip-path: inset({r.top}px {r.right}px {r.bottom}px {r.left}px round {r.radius}px)">
        <div class="pm-glass"></div>
        <div class="pm-solid"></div>
        <div class="pm-art"><img src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer"></div>
        <div class="pm-veil"></div>
        <div class="pm-container">
          <PCPlayer
            onClose={() => playerMorph.close()}
            {onOpenArtist} {onOpenAlbum} {onOpenPlaylist} {onToggleTheme}
            {showLocalQueue} {toggleLocalQueue}
          />
        </div>
        {#if c}
          <div class="pm-fcover" style="left:{c.left}px;top:{c.top}px;width:{c.width}px;height:{c.height}px;clip-path: inset(0 round {c.radius}px)">
            <img src={fcoverSrc} alt="" referrerpolicy="no-referrer">
          </div>
        {/if}
        {#if t}
          <div class="pm-ftitle" style="left:{t.left}px;top:{t.top}px;width:{t.width}px;height:{t.height}px;font-size:{titleFont}px;color:rgb({titleColor[0]},{titleColor[1]},{titleColor[2]})">
            {player.title || '未在播放'}
          </div>
        {/if}
      </div>
      <!-- 关闭键放在 clip 之外：任何进度都可点，不会随 surface 被裁掉 -->
      <button class="pm-close morph-in" style="--s:0.25;--d:0.16" type="button" onclick={() => playerMorph.close()} aria-label="关闭">
        <Icon name="chevron-down" size={20} strokeWidth={2.2} />
      </button>
    </div>
  {/if}
</div>
