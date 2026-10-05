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
import android.view.ViewTreeObserver
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.splashscreen.SplashScreenViewProvider
import androidx.interpolator.view.animation.FastOutSlowInInterpolator
import com.zheting.player.ZtStartupHost

class MainActivity : TauriActivity(), ZtStartupHost {
    private var uiFrameSubmitted = false
    private var firstFrameAvailable = false
    private var webView: WebView? = null
    private var startedAt = 0L
    private var currentTheme = "light"
    private var splashProvider: SplashScreenViewProvider? = null
    private var frameCallbackQueued = false

    override fun onCreate(savedInstanceState: Bundle?) {
        startedAt = SystemClock.uptimeMillis()
        currentTheme = if (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        val splash = installSplashScreen()
        // No minimum display time: the local UI/error frame alone releases the system splash.
        splash.setKeepOnScreenCondition { !uiFrameSubmitted }
        splash.setOnExitAnimationListener { provider ->
            splashProvider = provider
            if (firstFrameAvailable) removeSplash(provider)
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

    private fun revealDocument(animate: Boolean) {
        webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('ztmusic:android-reveal', {detail:{animate:" + animate + "}}))", null)
    }

    private fun animationsEnabled() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled()

    private fun removeSplash(provider: SplashScreenViewProvider) {
        splashProvider = null
        if (!animationsEnabled()) {
            provider.remove()
        } else {
            provider.iconView.animate().scaleX(0.92f).scaleY(0.92f)
                .setDuration(200).setInterpolator(FastOutSlowInInterpolator()).start()
            provider.view.animate().alpha(0f).setDuration(200)
                .setInterpolator(FastOutSlowInInterpolator()).withEndAction { provider.remove() }.start()
        }
    }

    override fun onStartupFrameReady() {
        if (firstFrameAvailable) {
            revealDocument(false)
            return
        }
        // Unlock native drawing before waiting for WebView pixels. The frame callback must
        // also run when Android does not supply a splash (reload / Activity recreation).
        uiFrameSubmitted = true
        window.decorView.invalidate()
        if (frameCallbackQueued) return
        val view = webView ?: return
        frameCallbackQueued = true
        val listener = object : ViewTreeObserver.OnDrawListener {
            private var posted = false
            override fun onDraw() {
                if (posted) return
                posted = true
                view.post {
                    if (view.viewTreeObserver.isAlive) view.viewTreeObserver.removeOnDrawListener(this)
                    view.postVisualStateCallback(0, object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            if (isDestroyed) { splashProvider?.remove(); return }
                            firstFrameAvailable = true
                            Log.i("ZTStartup", "first-frame-ready ms=" + (SystemClock.uptimeMillis() - startedAt))
                            revealDocument(animationsEnabled())
                            splashProvider?.let { removeSplash(it) }
                        }
                    })
                }
            }
        }
        view.viewTreeObserver.addOnDrawListener(listener)
        view.invalidate()
    }
}
