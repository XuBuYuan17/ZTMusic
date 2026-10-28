<script module lang="ts">
  import type { UserProfileData } from '../services/user-profile.ts'
  const profileCache = new Map<string, { data: UserProfileData; expires: number }>()
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import type { CompactTrackInput } from '../player/queue.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { player } from '../stores/player.svelte.ts'
  import { router } from '../stores/router.svelte.ts'
  import { toast } from '../stores/toast.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { loadUserProfileData, withFollowState } from '../services/user-profile.ts'
  import { coverUrl } from '../utils/image.ts'
  import { formatPlayCount } from '../format.ts'
  import UserProfileHero from '../components/UserProfileHero.svelte'
  import SocialPreviewSection from '../components/SocialPreviewSection.svelte'
  import CompactTrackList from '../components/CompactTrackList.svelte'
  import type { CompactTrackRow } from '../components/CompactTrackList.svelte'
  import PlaylistCoverCard from '../components/PlaylistCoverCard.svelte'
  import Icon from '../components/ui/Icon.svelte'
  import Spinner from '../components/Spinner.svelte'

  let { userId, onBack, onOpenUser, onOpenPlaylist, onOpenArtist, onOpenMessage }: {
    userId: SongId | null
    onBack?: () => void
    onOpenUser?: (id: unknown) => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenArtist?: (id: unknown) => void
    onOpenMessage?: (user: { userId: SongId; nickname?: unknown; avatarUrl?: unknown }) => void
  } = $props()

  let profile = $state<UserProfileData | null>(null)
  let loading = $state(true)
  let error = $state('')
  let followBusy = $state(false)
  let requestId = 0
  const isOwn = $derived(Boolean(userId && auth.user?.userId && String(auth.user.userId) === String(userId)))

  async function load(force = false): Promise<void> {
    if (!userId) return
    const rid = ++requestId
    const key = String(userId)
    const cached = profileCache.get(key)
    if (!force && cached && cached.expires > Date.now()) {
      profile = cached.data
      loading = false
      return
    }
    loading = true
    error = ''
    try {
      const data = await loadUserProfileData(ncm, userId, { isOwn, fallbackUser: isOwn ? auth.user : null })
      if (rid !== requestId) return
      profile = data
      profileCache.set(key, { data, expires: Date.now() + 3 * 60 * 1000 })
    } catch (e) {
      if (rid === requestId) error = (e as { message?: string })?.message || '用户资料加载失败'
    } finally {
      if (rid === requestId) loading = false
    }
  }

  async function toggleFollow(): Promise<void> {
    if (!profile || isOwn || followBusy) return
    const previous = profile
    const nextFollowed = !profile.followed
    profile = withFollowState(profile, nextFollowed)
    followBusy = true
    try {
      const response = await ncm.userFollow(profile.userId, nextFollowed) as { code?: number; message?: string; msg?: string } | null
      if (response?.code && response.code !== 200) throw new Error(response.message || response.msg || '操作失败')
      profileCache.set(String(profile.userId), { data: profile, expires: Date.now() + 3 * 60 * 1000 })
    } catch (e) {
      profile = previous
      toast.error((e as { message?: string })?.message || '关注操作失败')
    } finally {
      followBusy = false
    }
  }

  const weeklyRows = $derived<CompactTrackRow[]>(profile?.weeklyTracks.slice(0, 8).map((track, index) => ({
    key: `${String(track.id)}#${index}`,
    title: String(track.name ?? ''),
    subtitle: `${formatPlayCount(track.playCount) || '0'} 次播放`,
    cover: track.picUrl || '',
    rank: index + 1,
  })) ?? [])

  function playWeekly(index: number): void {
    if (profile?.weeklyTracks.length) player.playQueue(profile.weeklyTracks as unknown as CompactTrackInput[], index)
  }

  $effect(() => {
    if (isOwn && router.activeView === 'user' && String(router.selectedId) === String(userId)) {
      router.handleNav('library')
      return
    }
    if (userId && !isOwn) untrack(load)
  })
</script>

<div class="user-page fade-in">
  <button class="user-page__back" onclick={onBack}><Icon name="back" size={18} /> 返回</button>

  {#if loading && !profile}
    <div class="user-page__hero-skeleton skeleton-block"></div>
    <div class="user-page__loading"><Spinner /> 正在加载个人主页</div>
  {:else if error && !profile}
    <div class="user-page__error"><h2>暂时无法打开主页</h2><p>{error}</p><button onclick={() => load(true)}>重试</button></div>
  {:else if profile}
    <UserProfileHero
      {profile}
      {isOwn}
      {followBusy}
      onFollow={toggleFollow}
      onMessage={() => onOpenMessage?.({ userId: profile!.userId, nickname: profile!.nickname, avatarUrl: profile!.avatarUrl })}
      onOpenArtist={() => profile?.artistId && onOpenArtist?.(profile.artistId)}
    />

    <div class="user-page__grid">
      <section class="user-page__panel">
        <header><div><span>WEEKLY</span><h2>本周常听</h2></div><em>{profile.weeklyTracks.length ? `${profile.weeklyTracks.length} 首` : ''}</em></header>
        <CompactTrackList ranked rows={weeklyRows} emptyText="听歌排行未公开" onPlay={playWeekly} />
      </section>

      <section class="user-page__panel">
        <header><div><span>PLAYLISTS</span><h2>创建的歌单</h2></div><em>{profile.createdPlaylists.length ? `${profile.createdPlaylists.length} 个` : ''}</em></header>
        {#if profile.createdPlaylists.length}
          <div class="user-page__playlists">
            {#each profile.createdPlaylists.slice(0, 8) as playlist (playlist.id)}
              <PlaylistCoverCard title={String(playlist.name ?? '')} meta={`${playlist.trackCount ?? 0} 首`} cover={String(playlist.picUrl ?? '')} onSelect={() => onOpenPlaylist?.(playlist.id, true, playlist)} />
            {/each}
          </div>
        {:else}<div class="user-page__empty">暂无公开歌单</div>{/if}
      </section>
    </div>

    <SocialPreviewSection follows={profile.follows} followeds={profile.followeds} followsPreview={profile.followsPreview} followersPreview={profile.followersPreview} {onOpenUser} />
  {/if}
</div>

<style>
  .user-page { display: grid; gap: 22px; }
  .user-page__back { width: fit-content; height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-secondary); background: color-mix(in srgb, var(--bg-layer) 82%, transparent); font-size: 13px; font-weight: 700; }
  .user-page__hero-skeleton { min-height: 316px; border-radius: var(--radius-xl); }
  .user-page__loading, .user-page__error { min-height: 180px; display: grid; place-items: center; gap: 8px; color: var(--text-secondary); text-align: center; }
  .user-page__error button { padding: 9px 16px; border-radius: 999px; color: white; background: var(--accent); }
  .user-page__grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 18px; }
  .user-page__panel { min-width: 0; padding: 22px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: color-mix(in srgb, var(--bg-layer) 84%, transparent); }
  .user-page__panel > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
  .user-page__panel header span { color: var(--accent); font-size: 9px; font-weight: 700; letter-spacing: .12em; }
  .user-page__panel h2 { margin-top: 3px; font-size: 20px; }
  .user-page__panel header > em { color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .user-page__empty { min-height: 180px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
  @media (max-width: 1050px) { .user-page__grid { grid-template-columns: 1fr; } }
  :global(html.mobile-runtime) .user-page { gap: 14px; padding: 12px 14px 24px; }
  :global(html.mobile-runtime) .user-page__back { position: sticky; top: 8px; z-index: 10; width: 38px; padding: 0; justify-content: center; color: white; background: rgba(20,20,22,.72); backdrop-filter: blur(16px); }
  :global(html.mobile-runtime) .user-page__back :global(svg) { margin: 0; }
  :global(html.mobile-runtime) .user-page__back { font-size: 0; }
  :global(html.mobile-runtime) .user-page__panel { padding: 16px; border-radius: var(--radius-lg); }
</style>
