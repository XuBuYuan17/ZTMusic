package com.zheting.player

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class NativePlaybackStoreTest {
    private val context get() = RuntimeEnvironment.getApplication()
    @Before fun clear() { context.getSharedPreferences("native-playback", 0).edit().clear().commit() }

    @Test fun killedPlayerRestoresNativeQueuePausedWithoutExposingCredentials() {
        val store = NativePlaybackStore(context)
        store.configure(JSONObject().put("base", "https://example.invalid").put("cookie", "private"))
        store.save(JSONObject().put("tracks", JSONArray().put(JSONObject().put("id", "1").put("nativeUri", "ztmusic://song/1")))
            .put("index", 0).put("anchorPosition", 12345).put("revision", 9)
            .put("volume", 0.4).put("mode", "repeat").put("playing", true).put("loading", true))
        val restored = NativePlaybackStore(context).silentSnapshot()
        assertEquals("1", restored.getJSONArray("tracks").getJSONObject(0).getString("id"))
        assertEquals(12345L, restored.getLong("anchorPosition"))
        assertEquals(9L, restored.getLong("revision"))
        assertEquals("repeat", restored.getString("mode"))
        assertEquals(0.4, restored.getDouble("volume"), 0.001)
        assertFalse(restored.getBoolean("playing")); assertFalse(restored.getBoolean("loading"))
        assertFalse(restored.has("cookie")); assertFalse(restored.has("base"))
        assertEquals("private", NativePlaybackStore(context).configuration().getString("cookie"))
    }

    @Test fun freshInstallAndCorruptCheckpointRemainUsable() {
        val fresh = NativePlaybackStore(context).silentSnapshot()
        assertEquals(-1, fresh.getInt("index")); assertEquals(0, fresh.getJSONArray("tracks").length())
        context.getSharedPreferences("native-playback", 0).edit().putString("snapshot", "invalid json").commit()
        val restored = NativePlaybackStore(context).silentSnapshot()
        assertEquals(-1, restored.getInt("index")); assertFalse(restored.getBoolean("playing"))
    }
}
