package com.zheting.player

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.media3.session.SessionCommand
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.io.File

@TauriPlugin
class ZtPlayerPlugin(private val activity: Activity): Plugin(activity) {
    private var future: ListenableFuture<MediaController>? = null
    private var destroyed = false
    private val startupProbe = PlaybackStartupProbe(activity)
    private val cacheExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) { publish() }
    }

    private fun connect(): ListenableFuture<MediaController> {
        future?.takeIf { it.isDone && !it.isCancelled }?.let { pending ->
            val connected = try { pending.get().isConnected } catch (_: Exception) { false }
            if (!connected) { MediaController.releaseFuture(pending); future = null }
        }
        PlaybackDiagnostics.mark(activity, "controller.connect")
        return future ?: MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java)))
            .buildAsync().also { pending ->
                future = pending
                pending.addListener({
                    if (!destroyed) try { pending.get().addListener(listener); publish() }
                    catch (_: Exception) { trigger("error", JSObject().put("message", "Native media controller connection failed") as JSObject) }
                }, ContextCompat.getMainExecutor(activity))
            }
    }

    private fun publish() {
        val controller = future?.takeIf { it.isDone && !it.isCancelled } ?: return
        val request = controller.get().sendCustomCommand(SessionCommand(PlaybackService.COMMAND, android.os.Bundle.EMPTY),
            android.os.Bundle().apply { putString("payload", "{\"action\":\"state\"}") })
        request.addListener({
            if (!destroyed) try {
                val value = request.get().extras.getString("snapshot") ?: return@addListener
                trigger("state", JSObject(value))
            } catch (_: Exception) { /* A disconnected UI will reconnect on its next load. */ }
        }, ContextCompat.getMainExecutor(activity))
    }

    private fun shareImage(invoke: Invoke, args: JSONObject) {
        cacheExecutor.execute {
            try {
                val data = args.getJSONObject("data")
                val encoded = data.getString("bytes")
                require(encoded.length <= 16_000_000)
                val bytes = Base64.decode(encoded, Base64.DEFAULT)
                require(bytes.isNotEmpty() && bytes.size <= 12 * 1024 * 1024)

                val directory = File(activity.cacheDir, "zt-share").apply { mkdirs() }
                val now = System.currentTimeMillis()
                directory.listFiles()?.forEach { file ->
                    if (now - file.lastModified() > 24L * 60 * 60 * 1000) file.delete()
                }

                val requestedName = data.optString("fileName", "zheting-song.png")
                val safeName = requestedName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(96).ifBlank { "zheting-song.png" }
                val stem = safeName.substringBeforeLast('.').take(72).ifBlank { "zheting-song" }
                // Receivers can keep reading the granted URI after another share begins, so never overwrite an in-flight poster.
                val file = File(directory, "$stem-$now.png")
                file.writeBytes(bytes)

                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.ztshare", file)
                val title = data.optString("title", "分享歌曲").ifBlank { "分享歌曲" }
                val text = data.optString("text").trim()
                val url = data.optString("url").trim()
                val extraText = listOf(text, url).filter { it.isNotBlank() }.distinct().joinToString("\n")
                val share = Intent(Intent.ACTION_SEND).apply {
                    type = data.optString("mime", "image/png").ifBlank { "image/png" }
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_TITLE, title)
                    if (extraText.isNotBlank()) putExtra(Intent.EXTRA_TEXT, extraText)
                    clipData = ClipData.newRawUri(title, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

                activity.runOnUiThread {
                    try {
                        activity.startActivity(Intent.createChooser(share, title))
                        invoke.resolve(JSObject().apply { put("shared", true) })
                    } catch (_: Exception) {
                        invoke.reject("Unable to open Android share sheet")
                    }
                }
            } catch (_: Exception) {
                invoke.reject("Unable to prepare shared image")
            }
        }
    }

    @Command
    fun execute(invoke: Invoke) {
        val args = invoke.getArgs()
        val action = args.optString("action")
        PlaybackDiagnostics.mark(activity, "plugin.command=$action")
        if (action == "startupTheme") {
            activity.runOnUiThread {
                invoke.resolve(JSObject().put("theme", (activity as? ZtStartupHost)?.startupTheme() ?: "light") as JSObject)
            }
            return
        }
        if (action == "audioStartupProbe") {
            activity.runOnUiThread {
                try { startupProbe.step(args.getJSONObject("data").getString("stage")); invoke.resolve() }
                catch (_: Exception) { invoke.reject("Audio probe requires a debug build, no active service and ordered stages") }
            }
            return
        }
        if (action == "startupTrace") {
            PlaybackDiagnostics.mark(activity, "AndroidEngine.connect")
            invoke.resolve(); return
        }
        if (action == "state" && !PlaybackService.active) {
            PlaybackDiagnostics.mark(activity, "state.restore silent=true service=false")
            invoke.resolve(JSObject(NativePlaybackStore(activity).silentSnapshot().toString()))
            return
        }
        if (action == "journal" && !PlaybackService.active) {
            cacheExecutor.execute {
                try {
                    val journal = ListeningJournal(activity)
                    val result = try { journal.read(args.optJSONObject("data")?.optLong("cursor", 0) ?: 0) }
                        finally { journal.close() }
                    invoke.resolve(JSObject(result.toString()))
                } catch (_: Exception) { invoke.reject("Native listening journal unavailable") }
            }
            return
        }
        if (action == "startupReady" || action == "appTheme") {
            val theme = args.optJSONObject("data")?.optString("theme").orEmpty()
            activity.runOnUiThread {
                val host = activity as? ZtStartupHost
                if (theme == "light" || theme == "dark") host?.onAppThemeChanged(theme)
                if (action == "startupReady") host?.onStartupFrameReady(args.optJSONObject("data")?.optBoolean("reducedMotion", false) == true)
                invoke.resolve()
            }
            return
        }
        if (action == "capabilities") { invoke.resolve(JSObject(AndroidSystemAdapter.describe(activity).toString())); return }
        if (action == "overlayPermission") {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}")))
            invoke.resolve(); return
        }
        if (action == "shareImage") { shareImage(invoke, args); return }
        if (action == "cacheStatus") {
            val key = args.optJSONObject("data")?.optString("key").orEmpty()
            if (!key.matches(Regex("[a-f0-9]{64}"))) { invoke.reject("Invalid audio cache key"); return }
            invoke.resolve(JSObject().apply { put("exists", File(activity.filesDir, "native-audio/$key").isFile) }); return
        }
        if (action == "cacheChunk") {
            cacheExecutor.execute {
            try {
                val data = args.getJSONObject("data")
                val key = data.getString("key")
                require(key.matches(Regex("[a-f0-9]{64}")))
                val encoded = data.getString("bytes")
                require(encoded.length <= 1500000)
                val directory = File(activity.filesDir, "native-audio").apply { mkdirs() }
                val file = File(directory, "$key.part")
                val offset = data.getLong("offset")
                require(offset >= 0 && offset <= 1024L * 1024 * 1024)
                if (offset == 0L) file.outputStream().close()
                require(file.length() == offset)
                file.appendBytes(Base64.decode(encoded, Base64.NO_WRAP))
                if (data.optBoolean("last")) {
                    val destination = File(directory, key)
                    check(file.renameTo(destination))
                }
                invoke.resolve()
            } catch (_: Exception) { invoke.reject("Unable to cache native audio"); }
            }
            return
        }
        val pending = connect()
        pending.addListener({
            if (destroyed) { invoke.reject("Controller disposed"); return@addListener }
            try {
                val command = pending.get().sendCustomCommand(SessionCommand(PlaybackService.COMMAND, android.os.Bundle.EMPTY),
                    android.os.Bundle().apply { putString("payload", args.toString()) })
                command.addListener({
                    try {
                        val result = command.get()
                        if (result.resultCode != 0) invoke.reject("Native playback command rejected")
                        else invoke.resolve(JSObject(result.extras.getString("snapshot") ?: "{}"))
                    } catch (_: Exception) { invoke.reject("Native playback command failed") }
                }, ContextCompat.getMainExecutor(activity))
            } catch (_: Exception) { invoke.reject("Native playback controller unavailable") }
        }, ContextCompat.getMainExecutor(activity))
    }

    override fun onDestroy(activity: AppCompatActivity) {
        destroyed = true
        startupProbe.close()
        cacheExecutor.shutdown()
        future?.let { MediaController.releaseFuture(it) }
        future = null
    }
}
