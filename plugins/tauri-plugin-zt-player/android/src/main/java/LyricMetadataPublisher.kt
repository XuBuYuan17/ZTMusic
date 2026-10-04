package com.zheting.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.Player
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Publishes the current track's complete timed lyrics through the player-owned
 * MediaSession metadata. Consumers such as LyricInfo-compatible SystemUI modules
 * can then render lyrics using the normal MediaSession playback clock.
 */
class LyricMetadataPublisher(
    private val player: Player,
    private val resolver: StreamResolver,
) {
    companion object {
        private const val METADATA_KEY_LYRIC_INFO = "lyricInfo"
        private const val MAX_PAYLOAD_BYTES = 256 * 1024
        private val TIMED_LYRIC = Regex("[\\[<]\\d{1,3}:\\d{2}(?:[.:]\\d{1,3})?[\\]>]")
    }

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var currentTrackId = ""
    private var generation = 0L
    private var closed = false

    /**
     * Cheap to call from Player.Listener.onEvents: network work starts only when
     * the authoritative current media id changes.
     */
    fun trackChanged() {
        if (closed) return
        val mediaItem = player.currentMediaItem
        val trackId = mediaItem?.mediaId.orEmpty()
        if (trackId == currentTrackId) return

        currentTrackId = trackId
        val requestGeneration = ++generation
        if (!trackId.matches(Regex("[1-9][0-9]{0,18}"))) return

        val title = mediaItem?.mediaMetadata?.title?.toString().orEmpty()
        val artist = mediaItem?.mediaMetadata?.artist?.toString().orEmpty()
        val album = mediaItem?.mediaMetadata?.albumTitle?.toString().orEmpty()

        executor.execute {
            try {
                val response = resolver.request(
                    "/lyric",
                    JSONObject()
                        .put("id", trackId)
                        .put("lv", -1)
                        .put("tv", -1)
                        .put("rv", -1)
                        .put("yv", -1)
                        .put("ytv", -1),
                )
                val lyric = response.optJSONObject("lrc")?.optString("lyric").orEmpty()
                if (!hasTimedLyrics(lyric)) return@execute

                val payload = JSONObject()
                    .put("songName", title)
                    .put("artist", artist)
                    .put("songId", trackId)
                    .put("lyricType", 0)
                    .put("lyric", lyric)
                    .put("noLyric", false)

                if (album.isNotBlank()) payload.put("album", album)

                response.optJSONObject("yrc")?.optString("lyric").orEmpty()
                    .takeIf(::hasTimedLyrics)
                    ?.let { payload.put("rawLyric", it) }
                response.optJSONObject("tlyric")?.optString("lyric").orEmpty()
                    .takeIf(::hasTimedLyrics)
                    ?.let { payload.put("translation", it) }
                response.optJSONObject("romalrc")?.optString("lyric").orEmpty()
                    .takeIf(::hasTimedLyrics)
                    ?.let { payload.put("roma", it) }

                val encoded = payload.toString()
                if (encoded.toByteArray(Charsets.UTF_8).size > MAX_PAYLOAD_BYTES) {
                    Log.w("ZTMusic", "[Lyrics] lyricInfo payload skipped: too large")
                    return@execute
                }

                handler.post {
                    publishIfCurrent(trackId, requestGeneration, encoded)
                }
            } catch (_: Exception) {
                // Lyrics are optional metadata. Playback must keep working if they fail.
                Log.d("ZTMusic", "[Lyrics] lyricInfo unavailable for current track")
            }
        }
    }

    private fun publishIfCurrent(trackId: String, requestGeneration: Long, encoded: String) {
        if (closed || requestGeneration != generation || currentTrackId != trackId) return
        val index = player.currentMediaItemIndex
        if (index !in 0 until player.mediaItemCount) return
        val current = player.getMediaItemAt(index)
        if (current.mediaId != trackId) return

        val metadata = current.mediaMetadata
        val extras = metadata.extras?.let(::Bundle) ?: Bundle()
        if (extras.getString(METADATA_KEY_LYRIC_INFO) == encoded) return
        extras.putString(METADATA_KEY_LYRIC_INFO, encoded)

        val updatedMetadata = metadata.buildUpon().setExtras(extras).build()
        player.replaceMediaItem(index, current.buildUpon().setMediaMetadata(updatedMetadata).build())
    }

    private fun hasTimedLyrics(value: String): Boolean = value.isNotBlank() && TIMED_LYRIC.containsMatchIn(value)

    fun close() {
        if (closed) return
        closed = true
        generation++
        handler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
    }
}
