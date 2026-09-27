import { loadUserProfileData, withFollowState } from './user-profile.ts'

let passed = 0
let failed = 0
function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) passed++
  else { failed++; console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
}

const api = {
  userDetail: async () => ({ level: 7, listenSongs: 321, identify: { imageDesc: '原创音乐人' }, profile: { nickname: '哲听用户', avatarUrl: 'avatar', backgroundUrl: 'background', signature: '保持安静', follows: 12, followeds: 34, followed: true, artistId: 88 } }),
  userPlaylist: async () => ({ playlist: [
    { id: 1, name: '喜欢', specialType: 5, creator: { userId: 9 }, trackCount: 20 },
    { id: 2, name: '创建', specialType: 0, creator: { userId: 9 }, trackCount: 8 },
    { id: 3, name: '收藏', specialType: 0, creator: { userId: 8 }, trackCount: 6 },
  ] }),
  userRecordWeek: async () => ({ weekData: [{ playCount: 7, song: { id: 11, name: '常听歌曲', al: { picUrl: 'cover' } } }] }),
  userFollows: async () => ({ follow: [{ userId: 21, nickname: '关注用户' }] }),
  userFolloweds: async () => ({ followeds: [{ userId: 22, nickname: '粉丝用户' }] }),
  userLevel: async () => ({ data: { level: 8 } }),
  userSubcount: async () => ({ createdPlaylistCount: 2, subPlaylistCount: 3 }),
}

const profile = await loadUserProfileData(api, 9, { isOwn: true })
equal(profile.nickname, '哲听用户', 'normalizes profile')
equal(profile.level, 8, 'own level endpoint wins')
equal(profile.createdPlaylists.length, 1, 'keeps created playlists only')
equal(profile.likedPlaylist?.id, 1, 'extracts liked playlist')
equal(profile.weeklyTracks[0]?.playCount, 7, 'normalizes weekly record')
equal(profile.followsPreview[0]?.userId, 21, 'normalizes follows')
equal(profile.followersPreview[0]?.userId, 22, 'normalizes followers')
equal(profile.artistId, 88, 'links an authenticated user to the artist profile')
equal(profile.identityLabel, '原创音乐人', 'normalizes the artist identity label')

const followed = withFollowState({ ...profile, followed: false, followeds: 0 }, true)
equal(followed.followeds, 1, 'follow increments fans')
equal(withFollowState(followed, false).followeds, 0, 'unfollow decrements fans without going negative')
equal(withFollowState({ ...profile, followed: true, followeds: 0 }, false).followeds, 0, 'fans stay non-negative')

const partial = await loadUserProfileData({ ...api, userPlaylist: async () => { throw new Error('private') }, userRecordWeek: async () => { throw new Error('private') } }, 9)
equal(partial.nickname, '哲听用户', 'partial failure keeps profile')
equal(partial.createdPlaylists.length, 0, 'private playlists become empty')
equal(partial.weeklyTracks.length, 0, 'private records become empty')

console.log(`user-profile: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
