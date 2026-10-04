package com.zheting.player

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.Player
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Mirrors the currently sung lyric line into the active MediaSession metadata.
 *
 * Android's Bluetooth AVRCP, lock-screen and many OEM lyric modules consume the
 * session title rather than an app-specific lyric field. While lyric publishing
 * is enabled we therefore expose the lyric as the single primary text tier and
 * temporarily clear artist/album secondary tiers. This avoids OEM island UIs
 * rendering the same media item as mismatched large/small text. Canonical track
 * metadata is restored when the feature is disabled, playback stops, or tracks
 * change.
 */
class BluetoothLyricsPublisher(
    private val player: Player,
    private val resolver: StreamResolver,
) {
    private data class Line(val at: Long, val text: String)
    private data class Identity(val title: String, val artist: String, val album: String)

    companion object {
        private const val TICK_MS = 180L
        private val LRC_TAG = Regex("\\[(\\d+):(\\d+(?:\\.\\d+)?)\\]")
    }

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var enabled = false
    private var closed = false
    private var ticking = false
    private var generation = 0L
    private var trackId = ""
    private var identity = Identity("", "", "")
    private var lines: List<Line> = emptyList()
    private var lastPublishedTitle: String? = null

    private val tick = object : Runnable {
        override fun run() {
            ticking = false
            if (closed || !enabled) return
            syncTrack()
            publishCurrentLine()
            scheduleTick()
        }
    }

    val isEnabled: Boolean get() = enabled

    fun setEnabled(value: Boolean) {
        if (closed || enabled == value) return
        enabled = value
        generation++
        if (value) {
            syncTrack(force = true)
            scheduleTick()
        } else {
            restoreTrack(trackId, identity)
            resetTrack()
            stopTicking()
        }
    }

    /** Cheap to call from Player.Listener; network work starts only per track. */
    fun sync() {
        if (closed || !enabled) return
        syncTrack()
        scheduleTick()
    }

    fun playbackStopped() {
        if (closed) return
        restoreTrack(trackId, identity)
        generation++
        resetTrack()
    }

    private fun syncTrack(force: Boolean = false) {
        val item = player.currentMediaItem
        val nextId = item?.mediaId.orEmpty()
        if (!force && nextId == trackId) return

        val previousId = trackId
        val previousIdentity = identity
        if (previousId.isNotEmpty() && previousId != nextId) restoreTrack(previousId, previousIdentity)

        generation++
        trackId = nextId
        lines = emptyList()
        lastPublishedTitle = null
        identity = identityOf(
            item?.mediaMetadata?.extras?.getString("track"),
            item?.mediaMetadata?.title?.toString().orEmpty(),
            item?.mediaMetadata?.artist?.toString().orEmpty(),
            item?.mediaMetadata?.albumTitle?.toString().orEmpty(),
        )

        if (!nextId.matches(Regex("[1-9][0-9]{0,18}"))) return
        val requestGeneration = generation
        executor.execute {
            try {
                val response = resolver.request("/lyric", JSONObject().put("id", nextId).put("lv", -1))
                val parsed = parse(response.optJSONObject("lrc")?.optString("lyric").orEmpty())
                handler.post {
                    if (!closed && enabled && requestGeneration == generation && trackId == nextId) {
                        lines = parsed
                        lastPublishedTitle = null
                        publishCurrentLine()
                    }
                }
            } catch (_: Exception) {
                Log.d("ZTMusic", "[BluetoothLyrics] lyrics unavailable for current track")
            }
        }
    }

    private fun publishCurrentLine() {
        if (!enabled || trackId.isEmpty() || lines.isEmpty()) return
        val position = player.currentPosition.coerceAtLeast(0)
        val index = lines.binarySearchBy(position) { it.at }.let { found ->
            if (found >= 0) found else (-found - 2)
        }
        val line = lines.getOrNull(index)?.text?.trim().orEmpty()
        if (line.isEmpty() || line == lastPublishedTitle) return

        val itemIndex = findTrack(trackId)
        if (itemIndex < 0 || itemIndex != player.currentMediaItemIndex) return
        val item = player.getMediaItemAt(itemIndex)
        val metadata = item.mediaMetadata.buildUpon()
            .setTitle(line)
            .setDisplayTitle(line)
            .setArtist(null)
            .setAlbumTitle(null)
            .build()
        player.replaceMediaItem(itemIndex, item.buildUpon().setMediaMetadata(metadata).build())
        lastPublishedTitle = line
    }

    private fun restoreTrack(id: String, canonical: Identity) {
        if (id.isEmpty() || canonical.title.isEmpty()) return
        val index = findTrack(id)
        if (index < 0) return
        val item = player.getMediaItemAt(index)
        val metadata = item.mediaMetadata
        if (
            metadata.title?.toString().orEmpty() == canonical.title &&
            metadata.displayTitle == null &&
            metadata.artist?.toString().orEmpty() == canonical.artist &&
            metadata.albumTitle?.toString().orEmpty() == canonical.album
        ) return
        val restored = metadata.buildUpon()
            .setTitle(canonical.title)
            .setDisplayTitle(null)
            .setArtist(canonical.artist)
            .setAlbumTitle(canonical.album)
            .build()
        player.replaceMediaItem(index, item.buildUpon().setMediaMetadata(restored).build())
    }

    private fun findTrack(id: String): Int {
        for (index in 0 until player.mediaItemCount) if (player.getMediaItemAt(index).mediaId == id) return index
        return -1
    }

    private fun identityOf(
        rawTrack: String?,
        fallbackTitle: String,
        fallbackArtist: String,
        fallbackAlbum: String,
    ): Identity {
        return try {
            val track = JSONObject(rawTrack ?: "{}")
            val title = track.optString("name").ifBlank { fallbackTitle }
            val artists = track.optJSONArray("ar") ?: JSONArray()
            val artist = (0 until artists.length())
                .map { artists.optJSONObject(it)?.optString("name").orEmpty() }
                .filter { it.isNotBlank() }
                .joinToString(" / ")
                .ifBlank { fallbackArtist }
            val album = track.optJSONObject("al")?.optString("name").orEmpty().ifBlank { fallbackAlbum }
            Identity(title, artist, album)
        } catch (_: Exception) {
            Identity(fallbackTitle, fallbackArtist, fallbackAlbum)
        }
    }

    private fun parse(raw: String): List<Line> = raw.lineSequence().flatMap { source ->
        val tags = LRC_TAG.findAll(source).toList()
        val text = source.replace(Regex("\\[[^]]*\\]"), "").trim()
        if (text.isEmpty()) emptySequence() else tags.asSequence().map { match ->
            val at = match.groupValues[1].toLong() * 60000 + (match.groupValues[2].toDouble() * 1000).toLong()
            Line(at, text)
        }
    }.sortedBy { it.at }.toList()

    private fun scheduleTick() {
        if (closed || !enabled || ticking) return
        ticking = true
        handler.postDelayed(tick, TICK_MS)
    }

    private fun stopTicking() {
        ticking = false
        handler.removeCallbacks(tick)
    }

    private fun resetTrack() {
        trackId = ""
        identity = Identity("", "", "")
        lines = emptyList()
        lastPublishedTitle = null
    }

    fun close() {
        if (closed) return
        restoreTrack(trackId, identity)
        closed = true
        enabled = false
        generation++
        stopTicking()
        executor.shutdownNow()
        resetTrack()
    }
}
