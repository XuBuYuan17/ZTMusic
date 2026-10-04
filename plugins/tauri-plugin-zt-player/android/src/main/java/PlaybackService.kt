package com.zheting.player

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    companion object { const val COMMAND = "com.zheting.player.EXECUTE" }
    private lateinit var player: ExoPlayer
    private lateinit var resolver: StreamResolver
    private lateinit var journal: ListeningJournal
    private var session: MediaSession? = null
    private var overlay: LyricsOverlayConnection? = null
    private val overlayPrefs by lazy { getSharedPreferences("overlay-lyrics", MODE_PRIVATE) }
    private var revision = 0L
    private val liveActivity = LiveActivityRouter()
    private val handler = Handler(Looper.getMainLooper())
    private val checkpoint = object : Runnable {
        override fun run() { checkpointListening(); handler.postDelayed(this, 5000) }
    }

    override fun onCreate() {
        super.onCreate()
        resolver = StreamResolver(this)
        val source = ResolvingDataSource.Factory(DefaultDataSource.Factory(this,
            DefaultHttpDataSource.Factory().setUserAgent("ZTMusic Android").setAllowCrossProtocolRedirects(false)), resolver)
        player = ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(source)).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
        }
        journal = ListeningJournal(this)
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                checkpointListening()
                liveActivity.update(LivePlayerState(player.currentMediaItem?.mediaId.orEmpty(), player.mediaMetadata.title?.toString().orEmpty(), player.mediaMetadata.artist?.toString().orEmpty(), player.isPlaying, player.currentPosition))
                overlay?.trackChanged()
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                try { journal.transition(player) }
                catch (_: android.database.SQLException) { Log.w("ZTMusic", "[Listening] native storage unavailable") }
            }
            override fun onPlayerError(error: PlaybackException) {
                Log.w("ZTMusic", "[Media3] playback error code=${error.errorCode}")
                if (resolver.rejectCurrent(player.currentMediaItem?.mediaId.orEmpty())) { player.prepare(); player.play() }
            }
        })
        val builder = MediaSession.Builder(this, player).setCallback(object : MediaSession.Callback {
            override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
                val default = super.onConnect(session, controller)
                if (!default.isAccepted) return default
                return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                    .setAvailablePlayerCommands(default.availablePlayerCommands.buildUpon().apply {
                        if (controller.uid != Process.myUid()) {
                            remove(Player.COMMAND_SET_MEDIA_ITEM)
                            remove(Player.COMMAND_CHANGE_MEDIA_ITEMS)
                        }
                    }.build())
                    .setAvailableSessionCommands(default.availableSessionCommands.buildUpon().apply {
                        if (controller.uid == Process.myUid()) add(SessionCommand(COMMAND, Bundle.EMPTY))
                    }.build()).build()
            }
            override fun onCustomCommand(session: MediaSession, controller: MediaSession.ControllerInfo, command: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
                if (controller.uid != Process.myUid() || command.customAction != COMMAND) return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_PERMISSION_DENIED))
                return try {
                    val payload = JSONObject(args.getString("payload") ?: "{}")
                    val result = execute(payload)
                    Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS, Bundle().apply { putString("snapshot", result.toString()) }))
                } catch (_: Exception) {
                    Log.w("ZTMusic", "[Media3] invalid command rejected")
                    Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE))
                }
            }
        })
        packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
            builder.setSessionActivity(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        session = builder.build()
        handler.post(checkpoint)
        Log.i("ZTMusic", "[Media3] standard service created api=${android.os.Build.VERSION.SDK_INT}")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    private fun execute(payload: JSONObject): JSONObject {
        val data = payload.optJSONObject("data") ?: JSONObject()
        when (payload.getString("action")) {
            "state" -> {}
            "queue", "start" -> {
                resolver.configure(data)
                val tracks = data.getJSONArray("tracks")
                require(tracks.length() <= 5000)
                require(tracks.toString().toByteArray(Charsets.UTF_8).size <= 192 * 1024)
                val items = (0 until tracks.length()).map { index -> mediaItem(tracks.getJSONObject(index)) }
                val selected = data.optInt("index", 0)
                require(items.isEmpty() || selected in items.indices)
                val same = items.size == player.mediaItemCount && items.indices.all { player.getMediaItemAt(it).mediaId == items[it].mediaId }
                if (payload.getString("action") == "queue" && same) {
                    // Queue edits must not reset a currently playing source or its position.
                } else {
                    val requested = data.optDouble("position", 0.0)
                    require(requested.isFinite() && requested >= 0)
                    val position = if (payload.getString("action") == "queue") {
                        if (items.getOrNull(selected)?.mediaId == player.currentMediaItem?.mediaId) player.currentPosition else 0L
                    } else requested.toLong()
                    player.setMediaItems(items, selected.coerceAtLeast(0), position)
                    player.prepare()
                }
                applyMode(data.optString("mode", "list"))
                ensureOverlay()
                if (payload.getString("action") == "start") player.play()
            }
            "play" -> { if (player.playbackState == Player.STATE_IDLE) player.prepare(); player.play() }
            "pause" -> player.pause()
            "next" -> player.seekToNextMediaItem()
            "previous" -> player.seekToPreviousMediaItem()
            "seek" -> { val position = data.getDouble("position"); require(position.isFinite() && position >= 0); player.seekTo(position.toLong()) }
            "volume" -> { val value = data.getDouble("volume"); require(value.isFinite()); player.volume = value.toFloat().coerceIn(0f, 1f) }
            "mode" -> applyMode(data.getString("mode"))
            "stop" -> { player.stop(); player.clearMediaItems(); overlay?.close(); overlay = null; liveActivity.stop() }
            "journal" -> { journal.sample(player); return journal.read(data.optLong("cursor", 0)) }
            "overlay" -> {
                if (data.optBoolean("enabled")) {
                    require(android.provider.Settings.canDrawOverlays(this))
                    overlayPrefs.edit().putBoolean("enabled", true).apply()
                    if (overlay == null) overlay = LyricsOverlayConnection(this, player, resolver)
                    overlay?.configure(data)
                } else {
                    overlayPrefs.edit().putBoolean("enabled", false).apply()
                    overlay?.close(); overlay = null
                }
            }
            else -> throw IllegalArgumentException("Unknown playback action")
        }
        return snapshot()
    }

    private fun applyMode(mode: String) {
        require(mode in setOf("list", "shuffle", "repeat"))
        player.shuffleModeEnabled = mode == "shuffle"
        player.repeatMode = if (mode == "repeat") Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL
    }

    private fun ensureOverlay() {
        if (player.mediaItemCount == 0 || overlay != null || !overlayPrefs.getBoolean("enabled", false)) return
        if (!android.provider.Settings.canDrawOverlays(this)) return
        overlay = LyricsOverlayConnection(this, player, resolver)
    }

    private fun mediaItem(track: JSONObject): MediaItem {
        val id = track.get("id").toString()
        require(id.isNotBlank() && id.length <= 256)
        val source = track.optString("nativeUri", "ztmusic://song/$id")
        val uri = Uri.parse(source)
        require(uri.scheme == "ztmusic" && uri.host in setOf("song", "local"))
        val artists = track.optJSONArray("ar") ?: JSONArray()
        val names = (0 until artists.length()).map { artists.optJSONObject(it)?.optString("name").orEmpty() }.joinToString(" / ")
        val album = track.optJSONObject("al") ?: JSONObject()
        val metadata = MediaMetadata.Builder().setTitle(track.optString("name")).setArtist(names).setAlbumTitle(album.optString("name"))
            .setExtras(Bundle().apply { putString("track", track.toString()) })
        val cover = track.optString("picUrl").ifEmpty { album.optString("picUrl") }
        if (cover.startsWith("https://")) metadata.setArtworkUri(Uri.parse(cover))
        return MediaItem.Builder().setMediaId(id).setUri(uri).setMediaMetadata(metadata.build()).build()
    }

    private fun snapshot(): JSONObject = JSONObject().apply {
        put("revision", ++revision)
        put("overlayEnabled", overlayPrefs.getBoolean("enabled", false) && android.provider.Settings.canDrawOverlays(this@PlaybackService))
        put("overlayVisible", overlay?.visible == true)
        put("overlaySettings", JSONObject().apply {
            put("locked", overlayPrefs.getBoolean("locked", false))
            put("through", overlayPrefs.getBoolean("through", false))
            put("bilingual", overlayPrefs.getBoolean("bilingual", true))
            put("opacity", overlayPrefs.getFloat("opacity", 0.9f).toDouble())
            put("fontSize", overlayPrefs.getFloat("fontSize", 18f).toDouble())
            put("font", overlayPrefs.getString("font", "sans-serif") ?: "sans-serif")
        })
        put("anchorPosition", player.currentPosition.coerceAtLeast(0))
        put("anchorTimestamp", System.currentTimeMillis())
        put("playbackSpeed", player.playbackParameters.speed)
        put("duration", player.duration.takeIf { it != C.TIME_UNSET } ?: 0)
        put("playing", player.isPlaying)
        put("loading", player.playbackState == Player.STATE_BUFFERING)
        put("ended", player.playbackState == Player.STATE_ENDED)
        put("index", if (player.mediaItemCount == 0) -1 else player.currentMediaItemIndex)
        put("volume", player.volume)
        put("mode", if (player.shuffleModeEnabled) "shuffle" else if (player.repeatMode == Player.REPEAT_MODE_ONE) "repeat" else "list")
        put("error", player.playerError?.errorCodeName ?: "")
        put("tracks", JSONArray().apply { for (i in 0 until player.mediaItemCount) put(JSONObject(player.getMediaItemAt(i).mediaMetadata.extras?.getString("track") ?: "{}")) })
    }

    private fun checkpointListening() {
        try { journal.sample(player) }
        catch (_: android.database.SQLException) { Log.w("ZTMusic", "[Listening] checkpoint failed; retrying later") }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        checkpointListening(); journal.close()
        overlay?.close(); liveActivity.stop()
        session?.release(); session = null
        player.release()
        super.onDestroy()
    }
}
