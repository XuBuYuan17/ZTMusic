import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [source, layout] = await Promise.all([
  readFile(new URL('./PlaylistHero.svelte', import.meta.url), 'utf8'),
  readFile(new URL('../../styles/mobile/playlist-layout.css', import.meta.url), 'utf8'),
])

assert.match(source, /trackIds\?: unknown\[\]/, 'playlist detail exposes full track ids to the hero')
assert.match(source, /detail\?\.trackIds\?\.length \? detail\.trackIds : detail\?\.tracks \|\| \[\]/, 'full playlist ids win over partially loaded tracks')
assert.match(source, /const containsCurrentTrack = \$derived\(/, 'hero derives playback ownership from the current player track')
// 暂停/继续的语义已抽到 playlist-hero-content.ts（行为由 playlist-hero-content.test.ts 覆盖）
assert.match(source, /heroPlayback\(\{/, 'playback semantics come from the tested pure helper')
assert.match(source, /if \(playback\.mode === 'toggle'\) player\.togglePlay\(\)/, 'current playlist track toggles the shared player instead of replaying the queue')
assert.match(source, /disabled=\{playback\.disabled\}/, 'pause and resume remain available even when a search hides all rows')
assert.doesNotMatch(source, /ownsPlayback/, 'hero must not keep a local playback ownership flag that goes stale after external track changes')

assert.match(layout, /width: min\(58vw, 292px\)/, 'mobile cover leaves more of the first viewport for tracks')
assert.match(layout, /font-size: 22px/, 'playlist title keeps clear hierarchy without oversized mobile type')
assert.match(layout, /playlist-mobile-creator[\s\S]*font-size: 14px/, 'creator is supporting metadata rather than a second headline')
assert.match(layout, /playlist-play-btn[\s\S]*min-height: 48px/, 'primary play target remains comfortable after compacting the hero')

console.log('Playlist hero: playback state and compact mobile hierarchy are guarded')
