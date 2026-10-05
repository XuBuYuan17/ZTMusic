package __PACKAGE__

import android.animation.ValueAnimator
import android.app.UiModeManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.interpolator.view.animation.FastOutSlowInInterpolator
import com.zheting.player.ZtStartupHost

class MainActivity : TauriActivity(), ZtStartupHost {
    private var firstFrameAvailable = false
    private var webView: WebView? = null
    private var startedAt = 0L
    private var currentTheme = "light"

    override fun onCreate(savedInstanceState: Bundle?) {
        startedAt = SystemClock.uptimeMillis()
        currentTheme = if (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        val splash = installSplashScreen()
        // No minimum display time: the local UI/error frame alone releases the system splash.
        splash.setKeepOnScreenCondition { !firstFrameAvailable }
        splash.setOnExitAnimationListener { provider ->
            webView?.evaluateJavascript("window.dispatchEvent(new Event('ztmusic:android-reveal'))", null)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ValueAnimator.areAnimatorsEnabled()) {
                provider.remove()
            } else {
                // Animate the actual system icon in place; never create another logo or Activity.
                provider.iconView.animate().scaleX(0.92f).scaleY(0.92f)
                    .setDuration(200).setInterpolator(FastOutSlowInInterpolator()).start()
                provider.view.animate().alpha(0f).setDuration(200)
                    .setInterpolator(FastOutSlowInInterpolator()).withEndAction { provider.remove() }.start()
            }
        }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        applyBaseBackground()
    }

    override fun onWebViewCreate(view: WebView) {
        super.onWebViewCreate(view)
        webView = view
        view.setBackgroundColor(baseColor())
    }

    private fun baseColor() = Color.parseColor(if (currentTheme == "dark") "#111113" else "#ffffff")

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
            // Persist the app's own mode so the NEXT system starting window matches the saved UI.
            getSystemService(UiModeManager::class.java).setApplicationNightMode(
                if (theme == "dark") UiModeManager.MODE_NIGHT_YES else UiModeManager.MODE_NIGHT_NO
            )
        }
    }

    override fun onStartupFrameReady() {
        if (firstFrameAvailable) return
        val view = webView ?: return
        // Wait for submitted WebView pixels, not network data, image decode or animation completion.
        view.postVisualStateCallback(0, object : WebView.VisualStateCallback() {
            override fun onComplete(requestId: Long) {
                if (isDestroyed || firstFrameAvailable) return
                firstFrameAvailable = true
                Log.i("ZTStartup", "first-frame-ready ms=" + (SystemClock.uptimeMillis() - startedAt))
                window.decorView.invalidate()
            }
        })
    }
}
