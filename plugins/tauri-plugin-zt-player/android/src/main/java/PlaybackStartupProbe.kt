package com.zheting.player

import android.content.Context
import android.content.pm.ApplicationInfo
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.core.content.ContextCompat
import com.google.common.util.concurrent.ListenableFuture

/** Explicit debug-only A/B probe, isolated from the real service and queue. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal class PlaybackStartupProbe(private val context: Context) {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null
    private var controller: ListenableFuture<MediaController>? = null

    fun step(stage: String) {
        require(context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        require(!PlaybackService.active) { "Stop real playback before running an audio startup probe" }
        PlaybackDiagnostics.mark(context, "probe.$stage.begin")
        when (stage) {
            "player" -> { close(); player = ExoPlayer.Builder(context).build() }
            "attributes" -> requireNotNull(player).setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            "session" -> {
                check(session == null)
                session = MediaSession.Builder(context, requireNotNull(player)).setId("startup-debug-probe").build()
            }
            "controller" -> {
                check(controller == null)
                controller = MediaController.Builder(context, requireNotNull(session).token).buildAsync().also { pending ->
                    pending.addListener({
                        try {
                            pending.get().playbackState // read state without preparing or playing
                            PlaybackDiagnostics.mark(context, "probe.controller.connected state.read")
                        } catch (_: Exception) { PlaybackDiagnostics.mark(context, "probe.controller.failed") }
                    }, ContextCompat.getMainExecutor(context))
                }
            }
            "release" -> close()
            else -> throw IllegalArgumentException("Unknown audio startup probe stage")
        }
        PlaybackDiagnostics.mark(context, "probe.$stage.end")
    }

    fun close() {
        controller?.let { MediaController.releaseFuture(it) }; controller = null
        session?.release(); session = null
        player?.release(); player = null
    }
}
