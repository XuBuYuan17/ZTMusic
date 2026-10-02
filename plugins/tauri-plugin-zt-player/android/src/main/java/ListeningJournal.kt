package com.zheting.player

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.SystemClock
import androidx.media3.common.Player
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class ListeningJournal(context: Context) : SQLiteOpenHelper(context, "native-listening.db", null, 1) {
    private var lastMono = SystemClock.elapsedRealtime()
    private var running = false
    private var previousId = ""
    private var session = ""
    private var total = 0L
    private var counted = false
    private var previousTrack = JSONObject()
    private var duration = 0L
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("CREATE TABLE records (key TEXT PRIMARY KEY, sequence INTEGER NOT NULL, value TEXT NOT NULL)") }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun sample(player: Player) {
        val mono = SystemClock.elapsedRealtime()
        val now = System.currentTimeMillis()
        val elapsed = (mono - lastMono).coerceIn(0, 10000)
        if (running && previousId.isNotEmpty() && elapsed > 0) {
            val nextTotal = total + elapsed
            val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            val hour = SimpleDateFormat("H", Locale.US).format(Date(now))
            val key = "$session/$day"
            val db = writableDatabase
            val old = db.rawQuery("SELECT value FROM records WHERE key=?", arrayOf(key)).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else null }
            val row = old ?: JSONObject().put("key", key).put("session", session).put("day", day).put("track", previousTrack).put("milliseconds", 0).put("plays", 0).put("hours", JSONObject())
            row.put("milliseconds", row.getLong("milliseconds") + elapsed).put("lastAt", now)
            val hours = row.getJSONObject("hours"); hours.put(hour, hours.optLong(hour) + elapsed)
            val threshold = if (duration > 0) minOf(30000L, duration / 2) else 30000L
            val countNow = !counted && nextTotal >= threshold
            if (countNow) row.put("plays", 1)
            val sequence = db.rawQuery("SELECT COALESCE(MAX(sequence),0)+1 FROM records", null).use { it.moveToFirst(); it.getLong(0) }
            db.replaceOrThrow("records", null, ContentValues().apply { put("key", key); put("sequence", sequence); put("value", row.toString()) })
            total = nextTotal
            counted = counted || countNow
        }
        val item = player.currentMediaItem
        val id = item?.mediaId.orEmpty()
        if (id != previousId) {
            previousId = id; session = "android:${UUID.randomUUID()}"; total = 0; counted = false
            val raw = JSONObject(item?.mediaMetadata?.extras?.getString("track") ?: "{}")
            val ar = raw.optJSONArray("ar") ?: JSONArray()
            val artists = JSONArray(); for (i in 0 until ar.length()) artists.put(ar.optJSONObject(i)?.optString("name").orEmpty())
            previousTrack = JSONObject().put("key", "${raw.optString("source", "online")}:$id").put("name", raw.optString("name")).put("artists", artists).put("cover", raw.optString("picUrl"))
            duration = raw.optLong("dt")
        }
        lastMono = mono; running = player.isPlaying
    }

    fun transition(player: Player) {
        sample(player)
        previousId = ""
        sample(player)
    }

    fun read(after: Long): JSONObject {
        val rows = JSONArray()
        var cursorValue = after
        readableDatabase.rawQuery("SELECT sequence,value FROM records WHERE sequence > ? ORDER BY sequence LIMIT 500", arrayOf(after.toString())).use { cursor ->
            while (cursor.moveToNext()) { cursorValue = cursor.getLong(0); rows.put(JSONObject(cursor.getString(1))) }
        }
        return JSONObject().put("cursor", cursorValue).put("rows", rows)
    }
}
