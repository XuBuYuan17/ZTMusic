import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, mini, sheet] = await Promise.all([
  read('src/App.svelte'),
  read('src/lib/components/MobileMiniPlayer.svelte'),
  read('src/lib/components/LyricsPageV2.svelte'),
])

// Startup may own the shell while its splash is visible, but once the mini player can
// receive input it must not gate the normal player-sheet enter lifecycle.
assert.match(app, /player-bar-wrap" inert=\{isMobile && startupActive\}/, 'startup keeps the mini player non-interactive until handoff completes')
assert.match(app, /<LyricsPageV2 show=\{showSheet\} startupPending=\{startupActive\}/, 'the startup state remains observable by the player sheet')
assert.match(sheet, /aria-busy=\{startupPending\}/, 'startup state is metadata only after the sheet mounts')
assert.match(sheet, /use:enter use:dialogFocus=\{close\}/, 'player sheet enter motion and focus lifecycle mount together')
assert.doesNotMatch(sheet, /inert=\{startupPending\}/, 'startup must not inert an opening player sheet')
assert.doesNotMatch(sheet, /aria-hidden=\{startupPending\}/, 'startup must not hide an opening player sheet from the normal lifecycle')
assert.doesNotMatch(sheet, /use:playerFocus/, 'startup-specific focus gating must not replace the normal dialog action')

// Lock the continuous mini-player -> fullscreen choreography instead of merely checking
// that the fullscreen player eventually appears.
assert.match(sheet, /function miniGhost\(\)/, 'mini player visual continuity uses the cloned shell ghost')
assert.match(sheet, /animate\(sheet, \[\{ clipPath: miniClip\(\) \}, \{ clipPath: 'inset\(0px 0px 0px 0px round 0px\)' \}\], timing\)/, 'fullscreen sheet expands from the mini-player bounds')
assert.match(sheet, /animate\(cover, \[coverFrames\(cover, mini\.getBoundingClientRect\(\)\), \{ transform: 'none' \}\], timing\)/, 'cover grows continuously from the mini-player artwork')
assert.match(sheet, /animate\(nav, \[\{ transform: 'translateY\(0%\)' \}, \{ transform: 'translateY\(100%\)' \}\], timing\)/, 'bottom navigation leaves with the sheet expansion')
assert.match(sheet, /animate\(background, \[\{ opacity: 0 \}, \{ opacity: 1, offset: \.16 \}, \{ opacity: 1 \}\], timing\)/, 'player background fades in as part of the same transition')
assert.match(sheet, /animate\(element, \[\{ opacity: 0, transform: `translateY\(\$\{contentOffset\}px\)` \}, \{ opacity: 1, transform: 'none' \}\], timing\)/, 'player controls enter with the sheet instead of popping in')

assert.match(mini, /onOpenSheet\(artwork!\)/, 'tap opens the sheet from the real mini-player artwork')
assert.match(mini, /onOpenSheet\(artwork!, gesture\)/, 'upward drag hands the live gesture to the sheet motion')

console.log('mobile player sheet transition: startup isolation and continuous mini-player morph are guarded')
