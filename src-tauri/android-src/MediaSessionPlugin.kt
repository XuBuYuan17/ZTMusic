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
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
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
import kotlin.math.max

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
            // 耳机拔出 → 暂停
            AudioManager.ACTION_AUDIO_BECOMING_NOISY -> "pause"
            // 蓝牙 A2DP / Headset 断开 → 暂停
            "android.bluetooth.a2dp.profile.action.CONNECTION_STATE_CHANGED" -> {
                val state = intent.getIntExtra("android.bluetooth.a2dp.profile.extra.STATE", -1)
                if (state == 0) "pause" else null  // 0 = DISCONNECTED
            }
            "android.bluetooth.headset.profile.action.CONNECTION_STATE_CHANGED" -> {
                val state = intent.getIntExtra("android.bluetooth.headset.profile.extra.STATE", -1)
                if (state == 0) "pause" else null  // 0 = DISCONNECTED
            }
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
        private const val TAG = "ZhetingMediaSession"
        private const val MAX_COVER_SIZE = 512

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
    private var audioFocusRequest: AudioFocusRequest? = null
    private val audioManager get() = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager

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
                // 耳机拔出暂停
                addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
                // 蓝牙 A2DP / Headset 断开
                addAction("android.bluetooth.a2dp.profile.action.CONNECTION_STATE_CHANGED")
                addAction("android.bluetooth.headset.profile.action.CONNECTION_STATE_CHANGED")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.registerReceiver(MediaButtonReceiver(), filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                activity.registerReceiver(MediaButtonReceiver(), filter)
            }
            receiverRegistered = true
        } catch (_: Exception) {}
    }

    /** 请求音频焦点——其他 App 播放时自动暂停 */
    private fun requestAudioFocus(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
                audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener { focusChange ->
                        when (focusChange) {
                            AudioManager.AUDIOFOCUS_LOSS -> pendingAction = "pause"
                            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pendingAction = "pause"
                            AudioManager.AUDIOFOCUS_GAIN -> { /* 恢复播放由用户触发 */ }
                        }
                    }
                    .build()
            }
            val result = audioManager.requestAudioFocus(audioFocusRequest!!)
            return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        @Suppress("DEPRECATION")
        val result = audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    /** 释放音频焦点——暂停/停止时调用，让其他 App 可以播放 */
    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        audioFocusRequest = null
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

        // 音频焦点管理：播放时请求，暂停/停止时释放
        if (isPlaying) requestAudioFocus() else abandonAudioFocus()

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
        // 播放时持续更新通知（支持 Android 13+ 进度条），暂停时仅更新状态
        if (shouldRefreshPlaybackNotification(title, artist, isPlaying) || isPlaying) {
            startPlaybackService(title, artist, isPlaying)
            updateNotification(title, artist, null, isPlaying, position)
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
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(serviceIntent)
            } else {
                activity.startService(serviceIntent)
            }
            foregroundServiceStarted = true
        } catch (error: Exception) {
            Log.w(TAG, "Unable to start media foreground service", error)
            foregroundServiceStarted = false
        }
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
        isPlaying: Boolean,
        positionMs: Long = 0
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
                val conn = openCoverConnection(url)
                val bytes = try {
                    conn.inputStream.use { input -> input.readBytes() }
                } finally {
                    conn.disconnect()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                val sampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight)
                val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
                // 解码超时保护：大图解码不应超过 3 秒
                val bitmap = java.util.concurrent.Callable {
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                }.let { callable ->
                    val future = java.util.concurrent.Executors.newSingleThreadExecutor().submit(callable)
                    try {
                        future.get(3, java.util.concurrent.TimeUnit.SECONDS)
                    } catch (e: Exception) {
                        future.cancel(true)
                        null
                    }
                }
                callback(bitmap)
            } catch (_: Exception) {
                callback(null)
            }
        }
    }

    private fun openCoverConnection(url: String): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000
            readTimeout = 5000
            instanceFollowRedirects = true
        }
    }

    private fun calculateSampleSize(width: Int, height: Int): Int {
        val largest = max(width, height)
        if (largest <= MAX_COVER_SIZE || largest <= 0) return 1
        var sampleSize = 1
        while (largest / sampleSize > MAX_COVER_SIZE) sampleSize *= 2
        return sampleSize
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

