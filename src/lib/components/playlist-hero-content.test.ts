/**
 * PlaylistHero 纯决策自检。
 * 跑法：node --experimental-strip-types src/lib/components/playlist-hero-content.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import {
  heroCreatorName,
  heroDurationText,
  heroMetaText,
  heroPlayback,
} from './playlist-hero-content.ts'

// ── 暂停 / 继续：当前曲目属于本详情 ──
{
  const playing = heroPlayback({ containsCurrentTrack: true, playing: true, visibleCount: 10 })
  assert.equal(playing.mode, 'toggle', 'playing current track: button toggles')
  assert.equal(playing.pressed, true)
  assert.equal(playing.label, '暂停')
  assert.equal(playing.icon, 'pause')

  const paused = heroPlayback({ containsCurrentTrack: true, playing: false, visibleCount: 10 })
  assert.equal(paused.mode, 'toggle', 'paused current track: button resumes, not play-all')
  assert.equal(paused.pressed, false)
  assert.equal(paused.label, '播放全部', 'desktop wording is preserved')
  assert.equal(paused.icon, 'play')
}

// ── 别的详情的歌正在播：本详情仍是「播放全部」 ──
{
  const other = heroPlayback({ containsCurrentTrack: false, playing: true, visibleCount: 10 })
  assert.equal(other.mode, 'playAll')
  assert.equal(other.pressed, false, 'playing another playlist must not mark this hero as playing')
  assert.equal(other.label, '播放全部')
  assert.equal(other.menuLabel, '播放全部')
}

// ── 空详情：没有可见曲目且不含当前曲目时禁用 ──
{
  assert.equal(heroPlayback({ containsCurrentTrack: false, playing: false, visibleCount: 0 }).disabled, true)
  assert.equal(heroPlayback({ containsCurrentTrack: true, playing: false, visibleCount: 0 }).disabled, false, 'filtered out but contains current track stays usable')
}

// ── 窄布局短文案 ──
{
  assert.equal(heroPlayback({ containsCurrentTrack: false, playing: false, visibleCount: 5, compact: true }).label, '播放')
  assert.equal(heroPlayback({ containsCurrentTrack: true, playing: false, visibleCount: 5, compact: true }).label, '播放')
  assert.equal(heroPlayback({ containsCurrentTrack: true, playing: true, visibleCount: 5, compact: true }).label, '暂停')
  assert.equal(heroPlayback({ containsCurrentTrack: false, playing: false, visibleCount: 5, compact: true }).menuLabel, '播放全部', 'menu keeps the full wording')
}

// ── 创建者：字符串 / 对象 / 缺失 ──
assert.equal(heroCreatorName('网易云音乐'), '网易云音乐')
assert.equal(heroCreatorName({ nickname: '小张' }), '小张')
assert.equal(heroCreatorName({ name: '小李' }), '小李')
assert.equal(heroCreatorName(null), '', 'missing creator renders empty, layout stays stable')

// ── 时长格式 ──
assert.equal(heroDurationText(0), '0 分钟')
assert.equal(heroDurationText(30 * 60000), '30 分钟')
assert.equal(heroDurationText(90 * 60000), '1 小时 30 分钟')
assert.equal(heroDurationText(59.6 * 60000), '1 小时 0 分钟', 'rounding boundary stays as before')

// ── 元信息拼接 ──
assert.equal(heroMetaText({ creatorName: '小张', totalCount: 120, loading: false, totalDuration: 65 * 60000, loadingMore: false }), '小张 · 120 首 · 1 小时 5 分钟')
assert.equal(heroMetaText({ creatorName: '小张', totalCount: 0, loading: true, totalDuration: 0, loadingMore: false }), '小张 · 正在加载歌曲')
assert.equal(heroMetaText({ creatorName: '小张', totalCount: 120, loading: false, totalDuration: 0, loadingMore: true }), '小张 · 120 首 · 正在补全')
assert.equal(heroMetaText({ creatorName: '', totalCount: 5, loading: false, totalDuration: 0, loadingMore: false }), ' · 5 首', 'empty creator keeps the original prefix')

console.log('playlist hero content: playback semantics, creator, duration and meta passed')
