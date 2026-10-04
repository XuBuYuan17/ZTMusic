import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./PlaylistHero.svelte', import.meta.url), 'utf8')

assert.match(source, /trackIds\?: unknown\[\]/, 'playlist detail exposes full track ids to the hero')
assert.match(source, /detail\?\.trackIds\?\.length \? detail\.trackIds : detail\?\.tracks \|\| \[\]/, 'full playlist ids win over partially loaded tracks')
assert.match(source, /const containsCurrentTrack = \$derived\(/, 'hero derives playback ownership from the current player track')
assert.match(source, /if \(containsCurrentTrack\) player\.togglePlay\(\)/, 'current playlist track toggles the shared player instead of replaying the queue')
assert.match(source, /disabled=\{!visibleCount && !containsCurrentTrack\}/, 'pause and resume remain available even when a search hides all rows')
assert.doesNotMatch(source, /ownsPlayback/, 'hero must not keep a local playback ownership flag that goes stale after external track changes')

console.log('Playlist hero: playback state follows the active track across external queue changes')
