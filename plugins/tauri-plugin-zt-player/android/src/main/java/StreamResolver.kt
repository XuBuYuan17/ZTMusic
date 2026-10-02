package com.zheting.player

import android.content.Context
import android.net.Uri
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.ResolvingDataSource
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class StreamResolver(private val context: Context) : ResolvingDataSource.Resolver {
    @Volatile var base = "https://music.xubuyuan.top"
    @Volatile var cookie = ""
    @Volatile var quality = "standard"
    private val cache = LinkedHashMap<String, Pair<Uri, Long>>()
    private val attemptsUsed = mutableMapOf<String, Int>()
    fun rejectCurrent(id: String): Boolean = synchronized(cache) {
        cache.remove(id)
        val next = (attemptsUsed[id] ?: 0) + 1
        attemptsUsed[id] = next
        next < 5
    }

    fun configure(data: JSONObject) {
        val uri = Uri.parse(data.optString("base", base))
        require(uri.scheme == "https" && uri.userInfo == null && uri.port == -1)
        require(uri.host in setOf("music.xubuyuan.top", "music.163.com", "interface.music.163.com", "interface3.music.163.com"))
        base = uri.toString().trimEnd('/')
        cookie = data.optString("cookie", "")
        quality = data.optString("quality", "standard").takeIf { it in setOf("standard", "higher", "exhigh", "lossless") } ?: "standard"
        synchronized(cache) { cache.clear(); attemptsUsed.clear() }
    }

    fun request(path: String, parameters: JSONObject): JSONObject {
        val address = Uri.parse(base + path).buildUpon()
        parameters.keys().forEach { key -> address.appendQueryParameter(key, parameters.optString(key)) }
        if (cookie.isNotEmpty()) address.appendQueryParameter("cookie", cookie)
        val connection = URL(address.build().toString()).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8000; connection.readTimeout = 8000
            connection.instanceFollowRedirects = false
            if (connection.responseCode != 200) throw IOException("Music API request failed")
            val bytes = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break; output.write(buffer, 0, count); if (output.size() > 2 * 1024 * 1024) throw IOException("Music API response too large") }
                output.toByteArray()
            }
            return JSONObject(String(bytes, Charsets.UTF_8))
        } finally { connection.disconnect() }
    }

    override fun resolveDataSpec(dataSpec: DataSpec): DataSpec {
        val uri = dataSpec.uri
        if (uri.scheme != "ztmusic") return dataSpec
        val id = uri.lastPathSegment ?: throw IOException("Missing track")
        if (uri.host == "local") {
            require(id.matches(Regex("[a-f0-9]{64}")))
            val file = File(context.filesDir, "native-audio/$id")
            if (!file.isFile) throw IOException("Local track is not yet available in native storage")
            return dataSpec.withUri(Uri.fromFile(file))
        }
        if (!id.matches(Regex("[1-9][0-9]{0,18}"))) throw IOException("Invalid online track")
        synchronized(cache) { cache[id]?.takeIf { System.currentTimeMillis() - it.second < 60000 }?.let { return dataSpec.withUri(it.first) } }
        val attempts = listOf(
            "/song/url/v1" to JSONObject().put("id", id).put("level", quality),
            "/song/url/v1" to JSONObject().put("id", id).put("level", "standard"),
            "/song/url/v1" to JSONObject().put("id", id).put("level", "standard").put("unblock", "true"),
            "/song/url/match" to JSONObject().put("id", id),
            "/song/url" to JSONObject().put("id", id).put("br", 128000)
        )
        val first = synchronized(cache) { attemptsUsed[id] ?: 0 }
        for (index in first until attempts.size) {
            val (path, params) = attempts[index]
            try {
                val response = request(path, params)
                val item = response.optJSONArray("data")?.optJSONObject(0) ?: response.optJSONObject("data") ?: response
                val raw = item.optString("url")
                if (raw.isEmpty() || item.optJSONObject("freeTrialInfo") != null) continue
                val resolved = Uri.parse(if (raw.startsWith("http://")) "https://" + raw.substring(7) else raw)
                if (resolved.scheme != "https" || resolved.host.isNullOrEmpty() || resolved.userInfo != null) continue
                synchronized(cache) { attemptsUsed[id] = index; cache[id] = resolved to System.currentTimeMillis(); while (cache.size > 24) { val oldest = cache.keys.first(); cache.remove(oldest); attemptsUsed.remove(oldest) } }
                return dataSpec.withUri(resolved)
            } catch (_: IOException) { /* Try the next supported source without logging URLs or cookies. */ }
        }
        throw IOException("No playable source for this track")
    }
}
