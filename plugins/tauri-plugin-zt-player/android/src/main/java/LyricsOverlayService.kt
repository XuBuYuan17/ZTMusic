package com.zheting.player

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.content.ServiceConnection
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Binder
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import androidx.media3.common.Player
import org.json.JSONObject
import java.util.concurrent.Executors

class LyricsOverlayConnection(private val context: Context, private val player: Player, private val resolver: StreamResolver) : ServiceConnection {
    private var service: LyricsOverlayService? = null
    private var options = JSONObject()
    private var closed = false
    private val bound = context.bindService(Intent(context, LyricsOverlayService::class.java), this, Context.BIND_AUTO_CREATE)
    override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        if (closed) return
        service = (binder as LyricsOverlayService.LocalBinder).service
        service?.attach(player, resolver, options)
    }
    override fun onServiceDisconnected(name: ComponentName) { service = null }
    val visible get() = service?.visible == true
    fun configure(data: JSONObject) {
        options = data
        service?.let { if (it.visible) it.configure(data) else it.attach(player, resolver, data) }
    }
    fun trackChanged() { service?.trackChanged() }
    fun close() { if (closed) return; closed = true; service?.hide(); service = null; if (bound) context.unbindService(this) }
}

class LyricsOverlayService : Service() {
    inner class LocalBinder : Binder() { val service get() = this@LyricsOverlayService }
    private class LyricsText(context: Context) : androidx.appcompat.widget.AppCompatTextView(context) {
        override fun onDraw(canvas: Canvas) {
            val fill = paint.color
            paint.style = Paint.Style.STROKE; paint.strokeWidth = 3f; paint.color = Color.BLACK
            canvas.save(); canvas.translate(totalPaddingLeft.toFloat(), totalPaddingTop.toFloat()); layout?.draw(canvas); canvas.restore()
            paint.style = Paint.Style.FILL; paint.color = fill; super.onDraw(canvas)
        }
    }
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var player: Player? = null
    private var resolver: StreamResolver? = null
    private var text: LyricsText? = null
    val visible get() = text != null
    private var window: WindowManager? = null
    private var params: WindowManager.LayoutParams? = null
    private var id = ""
    private var lines: List<Pair<Long, String>> = emptyList()
    private var translations: Map<Long, String> = emptyMap()
    private var version = 0
    private var bilingual = true
    private var locked = false
    private var through = false
    private val prefs by lazy { getSharedPreferences("overlay-lyrics", MODE_PRIVATE) }
    private val tick = object : Runnable {
        override fun run() {
            if (!Settings.canDrawOverlays(this@LyricsOverlayService)) { hide(); return }
            trackChanged()
            val position = player?.currentPosition ?: 0
            val index = lines.indexOfLast { it.first <= position }
            val line = lines.getOrNull(index)
            val next = lines.getOrNull(index + 1)?.second.orEmpty()
            val translation = if (bilingual && line != null) translations[line.first].orEmpty() else ""
            val value = listOf(line?.second ?: player?.mediaMetadata?.title?.toString().orEmpty(), translation, next).filter { it.isNotBlank() }.joinToString("\n")
            if (text?.text?.toString() != value) text?.text = value
            handler.postDelayed(this, 250)
        }
    }
    override fun onBind(intent: Intent): IBinder = LocalBinder()
    fun attach(player: Player, resolver: StreamResolver, data: JSONObject) {
        this.player = player; this.resolver = resolver
        if (!Settings.canDrawOverlays(this)) return
        window = getSystemService(WINDOW_SERVICE) as WindowManager
        val view = LyricsText(this).apply { gravity = Gravity.CENTER; setTextColor(Color.WHITE); setPadding(12, 8, 12, 8); maxLines = 3 }
        text = view
        val type = AndroidSystemAdapter.overlayWindowType()
        params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, android.graphics.PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.LEFT
            x = prefs.getInt("x", 0).coerceIn(0, resources.displayMetrics.widthPixels - 48)
            y = prefs.getInt("y", 200).coerceIn(0, resources.displayMetrics.heightPixels - 48)
            width = resources.displayMetrics.widthPixels.coerceAtMost((360 * resources.displayMetrics.density).toInt())
        }
        try { window?.addView(view, params); configure(data); handler.post(tick) }
        catch (_: RuntimeException) { hide() }
    }
    fun configure(data: JSONObject) {
        bilingual = data.optBoolean("bilingual", prefs.getBoolean("bilingual", true))
        locked = data.optBoolean("locked", prefs.getBoolean("locked", false))
        through = data.optBoolean("through", prefs.getBoolean("through", false))
        val opacity = data.optDouble("opacity", prefs.getFloat("opacity", 0.9f).toDouble()).toFloat().coerceIn(0.2f, 1f)
        val size = data.optDouble("fontSize", prefs.getFloat("fontSize", 18f).toDouble()).toFloat().coerceIn(14f, 36f)
        require(opacity.isFinite() && size.isFinite())
        val font = data.optString("font", prefs.getString("font", "sans-serif") ?: "sans-serif").takeIf { it in setOf("sans-serif", "serif", "monospace") } ?: "sans-serif"
        text?.apply { alpha = opacity; textSize = size; typeface = Typeface.create(font, Typeface.BOLD) }
        prefs.edit().putBoolean("bilingual", bilingual).putBoolean("locked", locked).putBoolean("through", through).putFloat("opacity", opacity).putFloat("fontSize", size).putString("font", font).apply()
        params?.let { it.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or if (through) WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else 0 }
        params?.alpha = AndroidSystemAdapter.overlayOpacity(this, through)
        var startX = 0f; var startY = 0f; var x = 0; var y = 0
        text?.setOnTouchListener { _, event ->
            if (locked || through) false else {
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { startX = event.rawX; startY = event.rawY; x = params?.x ?: 0; y = params?.y ?: 0 }
                    MotionEvent.ACTION_MOVE -> { params?.x = (x + event.rawX - startX).toInt().coerceIn(0, resources.displayMetrics.widthPixels - 48); params?.y = (y + event.rawY - startY).toInt().coerceIn(0, resources.displayMetrics.heightPixels - 48); updateLayout() }
                    MotionEvent.ACTION_UP -> prefs.edit().putInt("x", params?.x ?: 0).putInt("y", params?.y ?: 0).apply()
                }
                true
            }
        }
        updateLayout()
    }
    private fun updateLayout() { text?.let { try { window?.updateViewLayout(it, params) } catch (_: RuntimeException) { hide() } } }
    fun trackChanged() {
        val track = player?.currentMediaItem?.mediaId.orEmpty()
        if (track == id) return
        id = track; lines = emptyList(); translations = emptyMap()
        val current = ++version
        if (!track.matches(Regex("[1-9][0-9]*"))) return
        executor.execute {
            try {
                val response = resolver?.request("/lyric", JSONObject().put("id", track)) ?: return@execute
                val primary = parse(response.optJSONObject("lrc")?.optString("lyric").orEmpty())
                val translated = parse(response.optJSONObject("tlyric")?.optString("lyric").orEmpty()).toMap()
                handler.post { if (version == current) { lines = primary; translations = translated } }
            } catch (_: Exception) { /* Metadata remains visible when lyrics are unavailable. */ }
        }
    }
    private fun parse(raw: String): List<Pair<Long, String>> = raw.lineSequence().flatMap { line ->
        val tags = Regex("\\[(\\d+):(\\d+(?:\\.\\d+)?)\\]").findAll(line).toList()
        val value = line.replace(Regex("\\[[^]]*\\]"), "").trim()
        tags.asSequence().map { (it.groupValues[1].toLong() * 60000 + (it.groupValues[2].toDouble() * 1000).toLong()) to value }
    }.sortedBy { it.first }.toList()
    fun hide() {
        version++; handler.removeCallbacksAndMessages(null)
        text?.let { try { window?.removeView(it) } catch (_: RuntimeException) {} }
        text = null; player = null; resolver = null
    }
    override fun onDestroy() { hide(); executor.shutdownNow(); super.onDestroy() }
}
