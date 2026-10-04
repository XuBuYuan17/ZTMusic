import '../../src/app.css'
import '../../src/styles/shell.css'
import '../../src/styles/wallpaper.css'
import '../../src/styles/search-overlay.css'
import '../../src/styles/player-bar.css'
import '../../src/styles/theme-transition.css'
import '../../src/styles/loading.css'
import '../../src/styles/home.css'
import '../../src/styles/library.css'
import '../../src/styles/content.css'
import '../../src/styles/lyrics.css'
import '../../src/styles/explore.css'
import '../../src/styles/lyrics/player.css'
import '../../src/styles/lyrics/context.css'
import '../../src/styles/lyrics/controls.css'
import '../../src/styles/lyrics/mobile.css'
import '../../src/app-pc.css'
import '../../src/styles/product-polish.css'
import '../../src/styles/desktop-system.css'
import '../../src/app-mobile.css'
import '../../src/styles/mobile/lyrics.css'
import '../../src/styles/mobile/responsive.css'
import '../../src/styles/mobile/search.css'
import '../../src/styles/mobile/artist.css'
import '../../src/styles/mobile/playlist-motion.css'
import '../../src/styles/mobile/playlist-layout.css'
import '../../src/styles/mobile/action-panels.css'
import '../../src/styles/mobile/interaction-polish.css'
import { mount } from 'svelte'
import Fixture from './MobileRenderFixture.svelte'
import { ncm } from '../../src/lib/api/client.ts'
import { player } from '../../src/lib/stores/player.svelte.ts'
import { router } from '../../src/lib/stores/router.svelte.ts'
const cover = '/scripts/browser/cover.svg'
const playlists = Array.from({ length: 4 }, (_, i) => ({
  id: 9001 + i, name: '渲染验证歌单 ' + (i + 1), picUrl: cover, coverImgUrl: cover,
  trackCount: 12, description: '同一封面应连续移动到详情页并返回', creator: { nickname: '测试账号' },
}))
const tracks = Array.from({ length: 12 }, (_, i) => ({
  id: 1001 + i, name: '歌曲 ' + (i + 1), ar: [{ id: 71, name: '测试歌手' }],
  al: { id: 81, name: '测试专辑', picUrl: cover }, dt: 180000,
}))
Object.assign(ncm, {
  banner: async () => ({ banners: [] }),
  personalized: async () => ({ result: playlists }),
  topPlaylist: async () => ({ playlists: [] }),
  personalizedNewSong: async () => ({ result: [] }),
  recommendSongs: async () => ({ data: [] }),
  albumNewest: async () => ({ albums: [] }),
  homepageBlockPage: async () => ({ data: { blocks: [] } }),
  simiSong: async () => ({ songs: [] }),
  simiPlaylist: async () => ({ playlists: [] }),
  commentMusic: async () => ({ hotComments: Array.from({ length: 6 }, (_, i) => ({
    commentId: 201 + i,
    user: { nickname: i % 2 ? '昵称很长很长的一位听众，仍然不能挤到头像上' : '听众 ' + (i + 1), avatarUrl: i === 2 ? '' : cover },
    content: i % 2 ? '这是一条较长的评论。正文要完整显示，多行文字不能覆盖头像、昵称或下一条评论。\n第二行仍然属于这条评论。' : '这首歌很好听，评论正文应该在昵称下面。',
    timeStr: '昨天 18:30', likedCount: i === 3 ? 0 : 128 + i,
  })) }),
  playlistDetail: async id => ({ playlist: { ...playlists.find(p => p.id === Number(id)), tracks, trackIds: [] } }),
  songDetail: async () => ({ songs: tracks }),
  lyric: async () => ({ lrc: { lyric: '[00:00.00]第一行测试歌词\n[00:10.00]第二行测试歌词' } }),
})
Object.assign(player, { id: tracks[0].id, title: '动画渲染测试歌曲', artist: '测试歌手', cover, duration: 180, currentTrack: tracks[0], queue: tracks })
router.activeView = 'explore'
document.documentElement.classList.add('mobile-runtime', 'native-shell')
document.documentElement.setAttribute('data-theme', 'dark')
mount(Fixture, { target: document.getElementById('app') })
