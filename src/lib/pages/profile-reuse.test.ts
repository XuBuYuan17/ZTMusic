/**
 * 歌手页 / 他人主页复用公共模块的自检。
 * 跑法：node --experimental-strip-types src/lib/pages/profile-reuse.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')
const artist = await read('./ArtistPage.svelte')
const user = await read('./UserProfilePage.svelte')
const shells = await Promise.all([
  read('../components/layout/DesktopPageHost.svelte'),
  read('../components/MobileApp.svelte'),
])

// ── 1) 按真实重复点复用 ──
assert.ok(artist.includes("import SongList from '../components/SongList.svelte'"), 'artist songs use the shared list')
assert.ok(artist.includes('toSongRows(visibleSongs)'), 'artist normalizes its own songs')
assert.ok(artist.includes('rowActions={songActions?.bindRow ?? null}'), 'artist keeps the shared row menu')
assert.ok(!artist.includes('<table class="track-table">'), 'artist no longer renders its own table')

assert.ok(user.includes("import CompactTrackList from '../components/CompactTrackList.svelte'"), 'weekly ranking uses the shared compact list')
assert.ok(user.includes('<CompactTrackList ranked rows={weeklyRows}'), 'weekly rows are rank ordered')
assert.ok(user.includes("import PlaylistCoverCard from '../components/PlaylistCoverCard.svelte'"), 'created playlists use the shared card')
assert.ok(user.includes("import SocialPreviewSection from '../components/SocialPreviewSection.svelte'"), 'social previews use the shared section')
assert.ok(!user.includes('user-page__tracks'), 'no local ranking markup left')
assert.ok(!user.includes('user-page__social'), 'no local social markup left')

// ── 2) 关注、身份与页面特有内容保留 ──
assert.ok(artist.includes('onToggleFollow'), 'artist follow stays on the page')
assert.ok(artist.includes('artist.followed'), 'follow state still drives the button')
assert.ok(artist.includes('onOpenUser?.(artist.accountUserId)'), 'the linked user profile entry is kept')
assert.ok(artist.includes('artist-albums'), 'albums section is page specific and kept')
assert.ok(artist.includes('showAllSongs'), 'the show-all toggle for songs is kept')

assert.ok(user.includes('toggleFollow'), 'user follow is page specific')
assert.ok(user.includes('if (!profile || isOwn || followBusy) return'), 'own profile cannot be followed')
assert.ok(user.includes('{isOwn}'), 'identity is still passed to the hero')
assert.ok(user.includes('onMessage='), 'messaging another user is kept')
assert.ok(user.includes('profileCache'), 'the page keeps its own profile cache')

// ── 3) 自己与他人的权限 ──
assert.ok(artist.includes('disabled={!songs.length}'), 'play all disables when there is nothing to play')
assert.ok(!user.includes('onToggleFollow'), 'the shared hero still owns the follow button')

// ── 4) 两端都渲染这两个页面 ──
assert.ok(shells[0].includes('loadArtistPage') && shells[0].includes('loadUserProfilePage'), 'desktop host renders both')
assert.ok(shells[1].includes("import ArtistPage") && shells[1].includes("import UserProfilePage"), 'mobile shell renders both')

// ── 5) 不把不同业务数据合成一个类型 ──
assert.ok(artist.includes('interface ArtistTrack') || artist.includes('type ArtistTrack'), 'artist keeps its own track type')
assert.ok(user.includes('weeklyTracks.slice(0, 8)'), 'weekly rows are built from the profile type, not merged into artist tracks')
assert.ok(!artist.includes('UserProfileData'), 'artist page does not pretend to be a user profile')
assert.ok(!user.includes('ArtistTrack'), 'user profile does not reuse the artist track type')

console.log('artist/user pages: shared modules, kept identity and separate types passed')
