import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [share, player, nativePlugin, manifest, paths, secondary] = await Promise.all([
  readFile(new URL('../src/lib/share/song-share.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/components/AppleMusicPlayer.svelte', import.meta.url), 'utf8'),
  readFile(new URL('../plugins/tauri-plugin-zt-player/android/src/main/java/ZtPlayerPlugin.kt', import.meta.url), 'utf8'),
  readFile(new URL('../plugins/tauri-plugin-zt-player/android/src/main/AndroidManifest.xml', import.meta.url), 'utf8'),
  readFile(new URL('../plugins/tauri-plugin-zt-player/android/src/main/res/xml/zt_share_paths.xml', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/components/PlayerSecondarySheet.svelte', import.meta.url), 'utf8'),
])

assert.match(share, /POSTER_WIDTH = 1080/)
assert.match(share, /POSTER_HEIGHT = 1440/)
assert.match(share, /QRCode\.toDataURL/)
assert.match(share, /ZTMUSIC \/ 折听/)
assert.match(share, /折听音乐/)
assert.match(share, /action: 'shareImage'/)
assert.match(share, /files: \[file\]/, 'web share should prefer the generated poster image')
assert.match(player, /import \{ shareSong \} from '\.\.\/share\/song-share\.ts'/)
assert.match(player, /await shareSong\(\{/)

assert.match(nativePlugin, /action == "shareImage"/)
assert.match(nativePlugin, /Intent\(Intent\.ACTION_SEND\)/)
assert.match(nativePlugin, /Intent\.EXTRA_STREAM/)
assert.match(nativePlugin, /FLAG_GRANT_READ_URI_PERMISSION/)
assert.match(nativePlugin, /FileProvider\.getUriForFile/)
assert.match(manifest, /androidx\.core\.content\.FileProvider/)
assert.match(manifest, /@xml\/zt_share_paths/)
assert.match(paths, /<cache-path name="zt-share" path="zt-share\/" \/>/)

assert.match(secondary, /grid-template-columns: 38px minmax\(0, 1fr\) auto/)
assert.match(secondary, /margin: 7px 0 0 48px/)
assert.match(secondary, /line-height: 1\.55/)
assert.match(secondary, /\.ly-context-comments\) \{[\s\S]*height: 100%/, 'comments own the secondary sheet height')
assert.match(secondary, /\.ly-context-comments \.ly-context-comment-list\) \{[\s\S]*flex: 1 1 auto/, 'comment list scrolls inside the remaining space')
assert.match(secondary, /\.ly-context-comment-form\) \{[\s\S]*flex: 0 0 auto/, 'composer stays visible above the bottom safe area')

console.log('Mobile share poster, Android native share bridge and compact hot comments are guarded')
