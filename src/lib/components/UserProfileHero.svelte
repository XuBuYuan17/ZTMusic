<script lang="ts">
  import type { UserProfileData } from '../services/user-profile.ts'
  import { coverUrl } from '../utils/image.ts'
  import { formatPlayCount } from '../format.ts'
  import Icon from './ui/Icon.svelte'

  let {
    profile,
    isOwn = false,
    followBusy = false,
    onFollow,
    onMessage,
    onOpenArtist,
  }: {
    profile: UserProfileData
    isOwn?: boolean
    followBusy?: boolean
    onFollow?: () => void
    onMessage?: () => void
    onOpenArtist?: () => void
  } = $props()

  const background = $derived(profile.backgroundUrl || profile.avatarUrl)
  const stats = $derived([
    { label: '听歌', value: formatPlayCount(profile.listenSongs) || '0' },
    { label: '关注', value: formatPlayCount(profile.follows) || '0' },
    { label: '粉丝', value: formatPlayCount(profile.followeds) || '0' },
    { label: '歌单', value: formatPlayCount(profile.playlistCount) || '0' },
  ])
</script>

<section class="user-profile-hero">
  {#if background}
    <div class="user-profile-hero__background" style={`background-image:url(${coverUrl(background, 1200)})`}></div>
  {/if}
  <div class="user-profile-hero__wash"></div>
  <div class="user-profile-hero__content">
    <div class="user-profile-hero__identity">
      {#if profile.avatarUrl}
        <img class="user-profile-hero__avatar" src={coverUrl(profile.avatarUrl, 240)} alt="" referrerpolicy="no-referrer" />
      {:else}
        <span class="user-profile-hero__avatar user-profile-hero__avatar--empty"><Icon name="user" size={42} /></span>
      {/if}
      <div class="user-profile-hero__copy">
        <div class="user-profile-hero__label">{isOwn ? 'MY PROFILE' : 'USER PROFILE'}</div>
        <div class="user-profile-hero__name-line">
          <h1>{profile.nickname}</h1>
          {#if profile.level > 0}<span class="user-profile-hero__level">Lv.{profile.level}</span>{/if}
        </div>
        {#if profile.identityLabel}<div class="user-profile-hero__identity-label"><Icon name="music" size={13} />{profile.identityLabel}</div>{/if}
        {#if profile.signature}<p>{profile.signature}</p>{/if}
      </div>
    </div>

    {#if !isOwn}
      <div class="user-profile-hero__actions">
        {#if profile.artistId}
          <button class="artist" onclick={onOpenArtist}><Icon name="music" size={16} /> 音乐作品</button>
        {/if}
        <button class:active={profile.followed} disabled={followBusy} onclick={onFollow}>
          <Icon name={profile.followed ? 'check' : 'add'} size={16} />
          {followBusy ? '处理中' : profile.followed ? '已关注' : '关注'}
        </button>
        <button class="secondary" onclick={onMessage}>
          <Icon name="messages" size={16} /> 私信
        </button>
      </div>
    {/if}

    <div class="user-profile-hero__stats">
      {#each stats as stat}
        <div><strong>{stat.value}</strong><span>{stat.label}</span></div>
      {/each}
    </div>
  </div>
</section>

<style>
  .user-profile-hero { position: relative; min-height: 316px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: var(--radius-xl); color: white; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, #18181b), #111214); box-shadow: 0 24px 70px rgba(0,0,0,.22); }
  .user-profile-hero__background { position: absolute; inset: -18px; background-size: cover; background-position: center 36%; filter: blur(9px) saturate(1.08); transform: scale(1.05); opacity: .74; }
  .user-profile-hero__wash { position: absolute; inset: 0; background: radial-gradient(circle at 82% 8%, rgba(255,255,255,.18), transparent 36%), linear-gradient(90deg, rgba(8,9,12,.86) 0%, rgba(9,10,13,.58) 58%, rgba(9,10,13,.34)); }
  .user-profile-hero__content { position: relative; z-index: 1; min-height: 316px; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 1fr auto; align-items: end; gap: 24px; padding: 32px; }
  .user-profile-hero__identity { min-width: 0; display: flex; align-items: center; gap: 24px; }
  .user-profile-hero__avatar { width: 112px; height: 112px; flex: 0 0 auto; object-fit: cover; border: 3px solid rgba(255,255,255,.76); border-radius: 50%; background: rgba(255,255,255,.1); box-shadow: 0 16px 38px rgba(0,0,0,.3); }
  .user-profile-hero__avatar--empty { display: grid; place-items: center; }
  .user-profile-hero__copy { min-width: 0; }
  .user-profile-hero__label { margin-bottom: 8px; color: rgba(255,255,255,.62); font-size: 11px; font-weight: 700; letter-spacing: .14em; }
  .user-profile-hero__name-line { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .user-profile-hero h1 { overflow: hidden; margin: 0; color: white; font-size: clamp(32px, 4vw, 52px); line-height: 1.05; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .user-profile-hero__level { flex: 0 0 auto; padding: 4px 8px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; color: rgba(255,255,255,.86); background: rgba(0,0,0,.2); font-size: 11px; font-weight: 700; }
  .user-profile-hero p { max-width: 600px; margin-top: 10px; color: rgba(255,255,255,.7); font-size: 14px; line-height: 1.55; }
  .user-profile-hero__identity-label { width: fit-content; display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: rgba(255,255,255,.82); background: rgba(255,255,255,.1); font-size: 11px; font-weight: 700; }
  .user-profile-hero__actions { align-self: center; display: flex; gap: 8px; }
  .user-profile-hero__actions button { height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: #151518; background: white; font-size: 13px; font-weight: 700; transition: background-color var(--motion-release) var(--ease-out), filter var(--motion-release) var(--ease-out); }
  .user-profile-hero__actions button:not(:disabled):hover { filter: brightness(.94); }
  .user-profile-hero__actions button.active:not(:disabled):hover, .user-profile-hero__actions button.secondary:not(:disabled):hover { filter: none; background: rgba(255,255,255,.18); }
  .user-profile-hero__actions button.artist:not(:disabled):hover { filter: brightness(1.08); }
  .user-profile-hero__actions button.active, .user-profile-hero__actions button.secondary { color: white; background: rgba(255,255,255,.12); backdrop-filter: blur(18px); }
  .user-profile-hero__actions button.artist { color: white; background: var(--accent); border-color: color-mix(in srgb, var(--accent) 72%, white); }
  .user-profile-hero__actions button:disabled { opacity: .58; }
  .user-profile-hero__stats { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 126px)); gap: 8px; }
  .user-profile-hero__stats div { min-width: 0; display: grid; gap: 2px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.09); border-radius: var(--radius-md); background: rgba(0,0,0,.18); backdrop-filter: blur(16px); }
  .user-profile-hero__stats strong { overflow: hidden; font-size: 17px; font-weight: 700; text-overflow: ellipsis; }
  .user-profile-hero__stats span { color: rgba(255,255,255,.55); font-size: 11px; }

  :global(html.mobile-runtime) .user-profile-hero { min-height: 220px; border-radius: var(--radius-lg); }
  :global(html.mobile-runtime) .user-profile-hero__content { min-height: 220px; grid-template-columns: 1fr; grid-template-rows: auto auto; gap: 14px; padding: 22px 18px 18px; }
  :global(html.mobile-runtime) .user-profile-hero__identity { align-items: flex-end; gap: 14px; }
  :global(html.mobile-runtime) .user-profile-hero__avatar { width: 78px; height: 78px; border-width: 2px; }
  :global(html.mobile-runtime) .user-profile-hero h1 { font-size: 27px; }
  :global(html.mobile-runtime) .user-profile-hero p { max-height: 42px; overflow: hidden; margin-top: 6px; font-size: 12px; }
  :global(html.mobile-runtime) .user-profile-hero__actions { align-self: auto; }
  :global(html.mobile-runtime) .user-profile-hero__actions button { flex: 1; min-height: 44px; }
  :global(html.mobile-runtime) .user-profile-hero__stats { grid-column: auto; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
  :global(html.mobile-runtime) .user-profile-hero__stats div { padding: 8px 5px; text-align: center; }
  :global(html.mobile-runtime) .user-profile-hero__stats strong { font-size: 14px; }
</style>
