package com.zheting.player

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

internal object NativeListeningSync {
    class Account(val base: String, val token: String, @Volatile var cookie: String)

    @Volatile var account: Account? = null
        private set
    @Volatile private var failure: Account? = null

    // ponytail: uploads are attempted once, with a bounded queue. Retrying would need upstream deduplication.
    private val executor = ThreadPoolExecutor(0, 1, 30, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(8))

    @Synchronized fun configure(base: String, cookie: String) {
        val token = cookie.split(';').firstOrNull { it.trim().startsWith("MUSIC_U=") }
            ?.substringAfter('=')?.trim().orEmpty()
        val address = if (token.isEmpty()) null else runCatching { StreamResolver.validatedBase(base) }.getOrNull()
        val previous = account
        if (address != null && previous != null && previous.base == address && previous.token == token) {
            previous.cookie = cookie
            return
        }
        account = address?.let { Account(it, token, cookie) }
        failure = null
    }

    fun failed(): Boolean = account?.let { failure === it } ?: false

    fun submit(owner: Account?, id: String, track: JSONObject, milliseconds: Long, duration: Long) {
        if (owner == null || owner !== account || !id.matches(Regex("[1-9][0-9]{0,18}")) || !track.optString("key").startsWith("online:")) return
        val seconds = ((milliseconds + 500) / 1000).coerceAtLeast(1)
        val name = track.optString("name")
        val artists = track.optJSONArray("artists")
        val artist = if (artists == null) "" else (0 until artists.length()).joinToString("/") { artists.optString(it) }
        try {
            executor.execute {
                if (owner !== account) return@execute
                val success = runCatching { upload(owner, id, seconds, duration, name, artist) }.getOrDefault(false)
                if (owner === account) failure = if (success) null else owner
                if (!success) Log.w("ZTMusic", "[Listening] NetEase did not confirm upload")
            }
        } catch (_: RejectedExecutionException) {
            if (owner === account) failure = owner
        }
    }

    private fun upload(owner: Account, id: String, seconds: Long, duration: Long, name: String, artist: String): Boolean {
        val fields = mutableMapOf("id" to id, "time" to seconds.toString(), "name" to name, "artist" to artist, "cookie" to owner.cookie)
        if (duration > 0) fields["total"] = ((duration + 500) / 1000).coerceAtLeast(1).toString()
        val body = fields.entries.joinToString("&") { (key, value) -> "$key=${URLEncoder.encode(value, "UTF-8")}" }.toByteArray(Charsets.UTF_8)
        val connection = URL("${owner.base}/scrobble/v1?timestamp=${System.currentTimeMillis()}").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            connection.setFixedLengthStreamingMode(body.size)
            if (owner !== account) return false
            connection.outputStream.use { it.write(body) }
            if (connection.responseCode != 200) return false
            val response = JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
            return response.optInt("code") == 200 && response.opt("data") is String
        } finally {
            connection.disconnect()
        }
    }
}
