import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const native = 'plugins/tauri-plugin-zt-player/android/src/main/java/'
const [manifest, service, overlay, bluetoothLyrics, plugin, system, resolver, engine, settings, cargo, capability] = await Promise.all([
  read('plugins/tauri-plugin-zt-player/android/src/main/AndroidManifest.xml'),
  read(native + 'PlaybackService.kt'), read(native + 'LyricsOverlayService.kt'), read(native + 'BluetoothLyricsPublisher.kt'), read(native + 'ZtPlayerPlugin.kt'), read(native + 'AndroidSystemAdapter.kt'), read(native + 'StreamResolver.kt'),
  read('src/lib/player/engine.ts'), read('src/lib/components/AndroidPlayerSettings.svelte'), read('src-tauri/Cargo.toml'), read('src-tauri/capabilities/android-player.json'),
])
assert.match(service, /class PlaybackService : MediaSessionService/)
assert.equal((service.match(/ExoPlayer\.Builder\(/g) || []).length, 1, 'one player is owned by the service')
assert.ok(!plugin.includes('ExoPlayer.Builder'), 'Activity controller never constructs a player')
assert.ok(plugin.includes('MediaController.releaseFuture'), 'Activity destruction only releases the controller')
assert.ok(!plugin.includes('player.release()'), 'Activity destruction must not release the service player')
for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK']) assert.ok(manifest.includes(`android.permission.${permission}"`))
assert.ok(manifest.includes('android.permission.SYSTEM_ALERT_WINDOW"'), 'overlay lyrics require the explicit Android overlay permission')
assert.match(manifest, /foregroundServiceType="mediaPlayback"/)
assert.ok(!manifest.includes('BOOT_COMPLETED'), 'no automatic background resurrection')
assert.ok(!manifest.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), 'no forced battery exemption')
assert.ok(service.includes('setHandleAudioBecomingNoisy(true)'))
assert.match(service, /setAudioAttributes\([\s\S]*?, true\)/)
assert.ok(service.includes('controller.uid != Process.myUid()'), 'custom commands reject external callers')
assert.ok(resolver.includes('connection.instanceFollowRedirects = false'), 'API redirects cannot leak credentials')
assert.ok(engine.includes('new AndroidEngine() : new AudioEngine()'), 'native and web audio ownership are mutually exclusive')
assert.match(cargo, /cfg\(target_os = "android"\)[\s\S]*?tauri-plugin-zt-player/)
assert.deepEqual(JSON.parse(capability).platforms, ['android'])
assert.ok(service.includes('ensureOverlay()') && service.includes('putBoolean("enabled", true)'), 'overlay preference must survive playback restarts')
assert.ok(service.includes('put("overlayVisible"'), 'requested and currently visible overlay states must remain distinguishable')
assert.ok(service.includes('put("overlaySettings"'), 'saved overlay appearance must be returned to the settings UI')
assert.ok(overlay.includes('Settings.canDrawOverlays') && overlay.includes('AndroidSystemAdapter.overlayWindowType()'), 'overlay service must gate rendering on system permission and use the platform adapter')
assert.ok(overlay.includes('handler.postDelayed(this, 250)') && overlay.includes('request("/lyric"'), 'native lyrics must follow player time without keeping the WebView active')
assert.ok(settings.includes("androidCommand('overlayPermission')") && settings.includes('awaitingPermission'), 'permission must only be requested from the Android settings action')
assert.ok(service.includes('BluetoothLyricsPublisher(player, resolver)') && service.includes('bluetoothLyrics.sync()'), 'Bluetooth lyric bridge must follow the authoritative native player')
assert.ok(service.includes('put("bluetoothLyricsEnabled"') && service.includes('getSharedPreferences("bluetooth-lyrics"'), 'Bluetooth lyric preference must persist and be returned to settings')
assert.ok(service.includes('id == lastJournalTrackId'), 'metadata-only lyric updates must not be counted as track transitions')
assert.ok(bluetoothLyrics.includes('request("/lyric"') && bluetoothLyrics.includes('player.currentPosition'), 'Bluetooth lyrics must use native lyrics and the native playback clock')
assert.ok(
  bluetoothLyrics.includes('.setTitle(line)') &&
  bluetoothLyrics.includes('.setDisplayTitle(line)') &&
  bluetoothLyrics.includes('.setArtist(null)') &&
  bluetoothLyrics.includes('.setAlbumTitle(null)'),
  'Bluetooth/island lyrics must expose one primary lyric tier without secondary media text',
)
assert.ok(
  bluetoothLyrics.includes('.setTitle(canonical.title)') &&
  bluetoothLyrics.includes('.setDisplayTitle(null)') &&
  bluetoothLyrics.includes('.setArtist(canonical.artist)') &&
  bluetoothLyrics.includes('.setAlbumTitle(canonical.album)'),
  'canonical title, artist and album metadata must be restored after lyric publishing',
)
assert.ok(bluetoothLyrics.includes('player.replaceMediaItem') && bluetoothLyrics.includes('restoreTrack('), 'MediaSession metadata updates must preserve playback and restore canonical metadata')
assert.ok(bluetoothLyrics.includes('line == lastPublishedTitle'), 'metadata must update only when the lyric line changes')
assert.ok(settings.includes("androidCommand<OverlayState>('bluetoothLyrics'") && settings.includes('蓝牙 / 灵动岛歌词'), 'Android settings must expose an explicit Bluetooth/island lyric toggle')
assert.ok(!system.includes('XiaomiIslandAdapter('), 'unverified OEM APIs cannot be silently enabled')
assert.match(system, /XIAOMI_ISLAND = false/)
assert.match(system, /OPPO_FLUID_CLOUD = false/)
console.log('Android native boundaries: service ownership, foreground declaration, focus, media controls, overlay lyrics, Bluetooth/island single-tier metadata, OEM defaults and Android-only permissions passed (not an APK/device test)')
