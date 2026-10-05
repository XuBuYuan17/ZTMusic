package com.zheting.player

import android.content.Context
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/** The service owns this checkpoint; the UI can read it without creating a player. */
internal class NativePlaybackStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("native-playback", Context.MODE_PRIVATE)

    fun configuration(): JSONObject = decode("configuration")

    fun configure(data: JSONObject) {
        // Resolver credentials stay in app-private native storage and never enter a UI snapshot.
        prefs.edit().putString("configuration", data.toString()).apply()
    }

    fun save(snapshot: JSONObject) { prefs.edit().putString("snapshot", snapshot.toString()).apply() }

    private fun decode(key: String): JSONObject = try {
        JSONObject(prefs.getString(key, "{}") ?: "{}")
    } catch (_: Exception) { JSONObject() }

    fun silentSnapshot(): JSONObject {
        val saved = decode("snapshot")
        val tracks = saved.optJSONArray("tracks") ?: JSONArray()
        val index = saved.optInt("index", -1).takeIf { it in 0 until tracks.length() } ?: -1
        val overlay = context.getSharedPreferences("overlay-lyrics", Context.MODE_PRIVATE)
        val permission = Settings.canDrawOverlays(context)
        return saved.apply {
            put("tracks", if (index >= 0) tracks else JSONArray())
            put("index", index)
            put("revision", optLong("revision", 0).coerceAtLeast(0))
            put("anchorPosition", optLong("anchorPosition", 0).coerceAtLeast(0))
            put("anchorTimestamp", System.currentTimeMillis())
            put("playbackSpeed", 1)
            put("duration", optLong("duration", 0).coerceAtLeast(0))
            // A persisted playing flag is not evidence that a killed service is still playing.
            put("playing", false); put("loading", false); put("ended", false); put("error", "")
            put("volume", optDouble("volume", 1.0).coerceIn(0.0, 1.0))
            put("mode", optString("mode", "list").takeIf { it in setOf("list", "shuffle", "repeat") } ?: "list")
            put("overlayPermission", permission)
            put("overlayRequested", overlay.getBoolean("enabled", false))
            put("overlayEnabled", false); put("overlayVisible", false)
            put("bluetoothLyricsEnabled", context.getSharedPreferences("bluetooth-lyrics", Context.MODE_PRIVATE).getBoolean("enabled", false))
            put("overlaySettings", JSONObject().apply {
                put("locked", overlay.getBoolean("locked", false)); put("through", overlay.getBoolean("through", false))
                put("bilingual", overlay.getBoolean("bilingual", true))
                put("opacity", overlay.getFloat("opacity", 0.9f).toDouble())
                put("fontSize", overlay.getFloat("fontSize", 18f).toDouble())
                put("font", overlay.getString("font", "sans-serif"))
            })
        }
    }
}
