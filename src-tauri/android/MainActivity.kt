package __PACKAGE__

import android.app.UiModeManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.zheting.player.ZtStartupHost

class MainActivity : TauriActivity(), ZtStartupHost {
    private var uiFrameSubmitted = false
    private var webView: WebView? = null
    private var currentTheme = "light"

    override fun onCreate(savedInstanceState: Bundle?) {
        currentTheme = if (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        val splash = installSplashScreen()
        // Android requires a launch surface. Keep only the static system surface until
        // the WebView shell mounts, then remove it immediately with no custom exit motion.
        splash.setKeepOnScreenCondition { !uiFrameSubmitted }
        splash.setOnExitAnimationListener { provider -> provider.remove() }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        applyBaseBackground()
    }

    override fun onWebViewCreate(view: WebView) {
        super.onWebViewCreate(view)
        webView = view
        view.setBackgroundColor(baseColor())
        // Do not hide the WebView behind a second branded transition. The mounted shell
        // can paint as soon as its JS/CSS are ready.
        view.postDelayed({
            if (isDestroyed || uiFrameSubmitted) return@postDelayed
            Log.w("ZTStartup", "shell-ready timeout; releasing system splash")
            uiFrameSubmitted = true
            window.decorView.invalidate()
        }, 3000L)
    }

    private fun baseColor() = Color.parseColor(if (currentTheme == "dark") "#111113" else "#ffffff")

    override fun startupTheme(): String = currentTheme

    private fun applyBaseBackground() {
        window.setBackgroundDrawable(ColorDrawable(baseColor()))
        window.decorView.setBackgroundColor(baseColor())
        webView?.setBackgroundColor(baseColor())
    }

    override fun onAppThemeChanged(theme: String) {
        if (theme != "dark" && theme != "light") return
        currentTheme = theme
        applyBaseBackground()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(UiModeManager::class.java).setApplicationNightMode(
                if (theme == "dark") UiModeManager.MODE_NIGHT_YES else UiModeManager.MODE_NIGHT_NO
            )
        }
    }

    override fun onStartupFrameReady(reducedMotion: Boolean) {
        if (uiFrameSubmitted) return
        uiFrameSubmitted = true
        Log.i("ZTStartup", "shell-ready; release system splash")
        window.decorView.invalidate()
    }
}
