package com.zheting.player

import android.util.Log
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.os.PowerManager
import org.json.JSONObject

object AndroidSystemAdapter {
    fun overlayWindowType(): Int = if (Build.VERSION.SDK_INT >= 26) android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") android.view.WindowManager.LayoutParams.TYPE_PHONE
    fun overlayOpacity(context: Context, through: Boolean): Float =
        if (through && Build.VERSION.SDK_INT >= 31) (context.getSystemService(Context.INPUT_SERVICE) as android.hardware.input.InputManager).maximumObscuringOpacityForTouch.coerceAtMost(0.7f) else 1f
    fun describe(context: Context): JSONObject = JSONObject().apply {
        put("apiLevel", Build.VERSION.SDK_INT)
        put("manufacturer", Build.MANUFACTURER)
        put("brand", Build.BRAND)
        put("model", Build.MODEL)
        put("rom", Build.DISPLAY)
        put("overlayPermission", Settings.canDrawOverlays(context))
        put("supportsNotificationPermission", Build.VERSION.SDK_INT >= 33)
        put("supportsPredictiveBack", Build.VERSION.SDK_INT >= 33)
        put("supportsLiveUpdate", Build.VERSION.SDK_INT >= 36)
        put("batteryOptimized", !(context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName))
        put("liveActivity", "Fallback")
        put("liveActivityReason", "No verified and authorized OEM integration enabled")
    }
}

interface LiveActivityAdapter {
    fun isSupported(): Boolean
    fun start(state: LivePlayerState)
    fun update(state: LivePlayerState)
    fun stop()
}

data class LivePlayerState(val id: String, val title: String, val artist: String, val playing: Boolean, val position: Long)

object OemFeatures {
    const val XIAOMI_ISLAND = false
    const val OPPO_FLUID_CLOUD = false
    const val VIVO_LIVE_ACTIVITY = false
    const val HONOR_LIVE_ACTIVITY = false
    const val HUAWEI_LIVE_ACTIVITY = false
}

class LiveActivityRouter(private var enhancement: LiveActivityAdapter? = null) {
    private var started = false
    // Standard media notification is always owned by MediaSessionService, independently of this router.
    fun update(state: LivePlayerState) {
        val adapter = enhancement ?: return
        try {
            if (!adapter.isSupported()) disable()
            else if (started) adapter.update(state)
            else { adapter.start(state); started = true }
        } catch (_: RuntimeException) { disable() }
        catch (_: LinkageError) { disable() }
    }
    fun stop() { disable() }
    private fun disable() {
        val adapter = enhancement
        enhancement = null
        try { adapter?.stop() }
        catch (_: RuntimeException) { Log.w("ZTMusic", "[OEM] fallback: enhancement unavailable") }
        catch (_: LinkageError) { Log.w("ZTMusic", "[OEM] fallback: SDK unavailable") }
    }
}
