import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const native = 'plugins/tauri-plugin-zt-player/android/src/main/java/'
const [manifest, service, plugin, system, resolver, engine, cargo, capability] = await Promise.all([
  read('plugins/tauri-plugin-zt-player/android/src/main/AndroidManifest.xml'),
  read(native + 'PlaybackService.kt'), read(native + 'ZtPlayerPlugin.kt'), read(native + 'AndroidSystemAdapter.kt'), read(native + 'StreamResolver.kt'),
  read('src/lib/player/engine.ts'), read('src-tauri/Cargo.toml'), read('src-tauri/capabilities/android-player.json'),
])
assert.match(service, /class PlaybackService : MediaSessionService/)
assert.equal((service.match(/ExoPlayer\.Builder\(/g) || []).length, 1, 'one player is owned by the service')
assert.ok(!plugin.includes('ExoPlayer.Builder'), 'Activity controller never constructs a player')
assert.ok(plugin.includes('MediaController.releaseFuture'), 'Activity destruction only releases the controller')
assert.ok(!plugin.includes('player.release()'), 'Activity destruction must not release the service player')
for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK']) assert.ok(manifest.includes(`android.permission.${permission}"`))
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
assert.ok(!system.includes('XiaomiIslandAdapter('), 'unverified OEM APIs cannot be silently enabled')
assert.match(system, /XIAOMI_ISLAND = false/)
assert.match(system, /OPPO_FLUID_CLOUD = false/)
console.log('Android native boundaries: service ownership, foreground declaration, focus, media controls, OEM defaults and Android-only permissions passed (not an APK/device test)')
