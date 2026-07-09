package com.zheting.music

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors

class MediaSessionService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "哲听"
        val artist = intent?.getStringExtra("artist") ?: "正在播放"
        val isPlaying = intent?.getBooleanExtra("isPlaying", false) ?: false
        val notification = NotificationCompat.Builder(this, "zheting_playback")
            .setContentTitle(title.ifEmpty { "哲听" })
            .setContentText(artist.ifEmpty { if (isPlaying) "正在播放" else "已暂停" })
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "上一首", mediaButtonIntent("MEDIA_PREV", 0))
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "暂停" else "播放",
                mediaButtonIntent(if (isPlaying) "MEDIA_PAUSE" else "MEDIA_PLAY", 1)
            )
            .addAction(android.R.drawable.ic_media_next, "下一首", mediaButtonIntent("MEDIA_NEXT", 2))
            .setStyle(androidx.media.app.NotificationCompat.MediaStyle().setShowActionsInCompactView(0, 1, 2))
            .build()
        startForeground(1001, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun mediaButtonIntent(action: String, requestCode: Int): PendingIntent {
        return PendingIntent.getBroadcast(
            this,
            requestCode,
            Intent(action).setPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }
}

class MediaButtonReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val pluginAction = when (action) {
            "MEDIA_PLAY" -> "play"
            "MEDIA_PAUSE" -> "pause"
            "MEDIA_NEXT" -> "next"
            "MEDIA_PREV" -> "prev"
            else -> null
        }
        if (pluginAction != null) {
            MediaSessionPlugin.pendingAction = pluginAction
        }
    }
}

@InvokeArg
data class MetadataArgs(
    val title: String? = null,
    val artist: String? = null,
    val coverUrl: String? = null,
    val duration: Double? = null
)

@InvokeArg
data class PlaybackStateArgs(
    val playing: Boolean? = null,
    val position: Double? = null,
    val duration: Double? = null
)

@TauriPlugin(
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "postNotification")]
)
class MediaSessionPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    companion object {
        @Volatile
        var pendingAction: String? = null
    }

    private var mediaSession: MediaSession? = null
    private val coverCache = Collections.synchronizedMap(object : LinkedHashMap<String, Bitmap>(20, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>): Boolean {
            return size > 20
        }
    })
    private val executor = Executors.newSingleThreadExecutor()
    private var receiverRegistered = false
    private var foregroundServiceStarted = false
    private var lastNotificationTitle = ""
    private var lastNotificationArtist = ""
    private var lastNotificationPlaying: Boolean? = null

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        createNotificationChannel()
        requestNotificationPermissionIfNeeded()
        initMediaSession()
        registerMediaReceiver()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
    }

    private fun initMediaSession() {
        mediaSession = MediaSession(activity, "zheting_session").apply {
            setFlags(
                MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            isActive = true

            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    pendingAction = "play"
                    trigger("media_button", JSObject().apply { put("action", "play") })
                }

                override fun onPause() {
                    pendingAction = "pause"
                    trigger("media_button", JSObject().apply { put("action", "pause") })
                }

                override fun onSkipToNext() {
                    pendingAction = "next"
                    trigger("media_button", JSObject().apply { put("action", "next") })
                }

                override fun onSkipToPrevious() {
                    pendingAction = "prev"
                    trigger("media_button", JSObject().apply { put("action", "prev") })
                }
            })
        }
    }

    private fun registerMediaReceiver() {
        if (receiverRegistered) return
        try {
            val filter = IntentFilter().apply {
                addAction("MEDIA_PLAY")
                addAction("MEDIA_PAUSE")
                addAction("MEDIA_NEXT")
                addAction("MEDIA_PREV")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.registerReceiver(MediaButtonReceiver(), filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                activity.registerReceiver(MediaButtonReceiver(), filter)
            }
            receiverRegistered = true
        } catch (_: Exception) {}
    }

    @Command
    fun updateMetadata(invoke: Invoke) {
        val args = invoke.parseArgs(MetadataArgs::class.java)
        val title = args.title ?: ""
        val artist = args.artist ?: ""

        val builder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, ((args.duration ?: 0.0) * 1000).toLong())

        val coverUrl = args.coverUrl ?: ""
        if (coverUrl.isNotEmpty()) {
            val cached = coverCache[coverUrl]
            if (cached != null) {
                builder.putBitmap(MediaMetadata.METADATA_KEY_ART, cached)
                mediaSession?.setMetadata(builder.build())
                // 确保通知始终更新，无论播放状态
                val isPlaying = mediaSession?.controller?.playbackState?.state == PlaybackState.STATE_PLAYING
                updateNotification(title, artist, cached, isPlaying)
                invoke.resolve()
                return
            }
            loadCoverAsync(coverUrl) { bitmap ->
                if (bitmap != null) {
                    coverCache[coverUrl] = bitmap
                    builder.putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap)
                    mediaSession?.setMetadata(builder.build())
                    val isPlaying = mediaSession?.controller?.playbackState?.state == PlaybackState.STATE_PLAYING
                    updateNotification(title, artist, bitmap, isPlaying)
                }
            }
        }

        mediaSession?.setMetadata(builder.build())
        val isPlaying = mediaSession?.controller?.playbackState?.state == PlaybackState.STATE_PLAYING
        updateNotification(title, artist, null, isPlaying)
        invoke.resolve()
    }

    @Command
    fun updatePlaybackState(invoke: Invoke) {
        val args = invoke.parseArgs(PlaybackStateArgs::class.java)
        val isPlaying = args.playing ?: false
        val position = ((args.position ?: 0.0) * 1000).toLong()

        val state = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
        val actions = (PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or
            PlaybackState.ACTION_STOP).toLong()

        mediaSession?.setPlaybackState(
            PlaybackState.Builder()
                .setState(state, position, 1.0f)
                .setActions(actions)
                .build()
        )

        // 启动前台服务以保持通知常驻（即使暂停也显示）
        val meta = mediaSession?.controller?.metadata
        val title = meta?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: ""
        val artist = meta?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: ""
        if (shouldRefreshPlaybackNotification(title, artist, isPlaying)) {
            startPlaybackService(title, artist, isPlaying)
            updateNotification(title, artist, null, isPlaying)
            rememberPlaybackNotification(title, artist, isPlaying)
        }
        invoke.resolve()
    }

    private fun shouldRefreshPlaybackNotification(title: String, artist: String, isPlaying: Boolean): Boolean {
        return !foregroundServiceStarted ||
            title != lastNotificationTitle ||
            artist != lastNotificationArtist ||
            isPlaying != lastNotificationPlaying
    }

    private fun startPlaybackService(title: String, artist: String, isPlaying: Boolean) {
        val serviceIntent = Intent(activity, MediaSessionService::class.java).apply {
            putExtra("title", title)
            putExtra("artist", artist)
            putExtra("isPlaying", isPlaying)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(serviceIntent)
        } else {
            activity.startService(serviceIntent)
        }
        foregroundServiceStarted = true
    }

    private fun rememberPlaybackNotification(title: String, artist: String, isPlaying: Boolean) {
        lastNotificationTitle = title
        lastNotificationArtist = artist
        lastNotificationPlaying = isPlaying
    }

    private fun updateNotification(
        title: String,
        artist: String,
        art: Bitmap?,
        isPlaying: Boolean
    ) {
        val ctx = activity

        val prevIntent = PendingIntent.getBroadcast(
            ctx, 0,
            Intent("MEDIA_PREV").setPackage(ctx.packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val playPauseIntent = PendingIntent.getBroadcast(
            ctx, 1,
            Intent(if (isPlaying) "MEDIA_PAUSE" else "MEDIA_PLAY").setPackage(ctx.packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val nextIntent = PendingIntent.getBroadcast(
            ctx, 2,
            Intent("MEDIA_NEXT").setPackage(ctx.packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val mediaStyle = androidx.media.app.NotificationCompat.MediaStyle()
            .setMediaSession(
                mediaSession?.sessionToken?.let { android.support.v4.media.session.MediaSessionCompat.Token.fromToken(it) }
            )
            .setShowActionsInCompactView(0, 1, 2)

        val notification = NotificationCompat.Builder(ctx, "zheting_playback")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title.ifEmpty { "哲听" })
            .setContentText(artist)
            .setLargeIcon(art)
            .setOngoing(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setStyle(mediaStyle)
            .setContentIntent(
                PendingIntent.getActivity(
                    ctx, 3,
                    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            .addAction(android.R.drawable.ic_media_previous, "上一首", prevIntent)
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "暂停" else "播放",
                playPauseIntent
            )
            .addAction(android.R.drawable.ic_media_next, "下一首", nextIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(1001, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            "zheting_playback",
            "播放控制",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "显示当前播放的歌曲和控制按钮"
            setShowBadge(false)
        }
        val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(channel)
    }

    private fun loadCoverAsync(url: String, callback: (Bitmap?) -> Unit) {
        executor.execute {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.instanceFollowRedirects = true
                val input = conn.inputStream
                val bitmap = BitmapFactory.decodeStream(input)
                input.close()
                callback(bitmap)
            } catch (_: Exception) {
                callback(null)
            }
        }
    }

    @Command
    fun pollPendingAction(invoke: Invoke) {
        val action = pendingAction
        pendingAction = null
        val ret = JSObject()
        ret.put("action", action ?: "")
        invoke.resolve(ret)
    }
}

