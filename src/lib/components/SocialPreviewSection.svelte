<script lang="ts">
  import SocialPreview from './SocialPreview.svelte'
  import type { UserPreview } from '../services/user-profile.ts'
  import { loadSocialPreview } from '../services/user-profile.ts'
  import { ncm } from '../api/client.ts'
  import type { SongId } from '../types/music.ts'

  // 关注 / 粉丝预览：宽屏并排，窄屏堆叠。
  // 页面已经有数据就直传；没有（资料库概览）就给 loadFor，由模块自己拉预览。
  let {
    follows = 0,
    followeds = 0,
    followsPreview,
    followersPreview,
    loadFor,
    onOpenUser,
  }: {
    follows?: number
    followeds?: number
    followsPreview?: UserPreview[]
    followersPreview?: UserPreview[]
    /** 没传预览时，用这个 uid 自己拉 */
    loadFor?: SongId
    onOpenUser?: (id: unknown) => void
  } = $props()

  let loaded = $state<{ followsPreview: UserPreview[]; followersPreview: UserPreview[] } | null>(null)

  const followUsers = $derived(followsPreview ?? loaded?.followsPreview ?? [])
  const followerUsers = $derived(followersPreview ?? loaded?.followersPreview ?? [])

  $effect(() => {
    const uid = loadFor
    if (uid === undefined || uid === null || uid === '') return
    if (followsPreview || followersPreview) return
    let alive = true
    void loadSocialPreview(ncm, uid).then((result) => { if (alive) loaded = result }).catch(() => {})
    return () => { alive = false }
  })
</script>

<div class="social-preview-pair">
  <SocialPreview title="我的关注" count={follows} users={followUsers} {onOpenUser} />
  <SocialPreview title="我的粉丝" count={followeds} users={followerUsers} {onOpenUser} />
</div>

<style>
  /* 宽屏并排；窄屏堆叠，避免两列头像在窄窗口里互相挤压 */
  .social-preview-pair { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

  @media (max-width: 900px) {
    .social-preview-pair { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  }

  :global(html.mobile-runtime) .social-preview-pair { grid-template-columns: minmax(0, 1fr); gap: 12px; }
</style>
