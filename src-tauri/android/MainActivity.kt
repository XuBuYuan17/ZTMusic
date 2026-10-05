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
    private var transitionQueued = false
    private var transitionStarted = false
    private var reducedMotion = false

    override fun onCreate(savedInstanceState: Bundle?) {
        startedAt = SystemClock.uptimeMillis()
        currentTheme = if (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        val splash = installSplashScreen()
        // Release pre-draw once the shell mounts; retain the overlay until WebView
        // confirms pixels. Keeping pre-draw blocked would deadlock that callback.
        splash.setKeepOnScreenCondition { !uiFrameSubmitted }
        splash.setOnExitAnimationListener { provider ->
            if (transitionStarted) provider.remove()
            else {
                splashProvider = provider
                if (firstFrameAvailable) queueTransition()
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
        // Alpha preserves layout/drawing without exposing an unprepared WebView.
        view.alpha = 0f
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
            getSystemService(UiModeManager::class.java).setApplicationNightMode(
                if (theme == "dark") UiModeManager.MODE_NIGHT_YES else UiModeManager.MODE_NIGHT_NO
            )
        }
    }

    private fun revealDocument(animate: Boolean) {
        val view = webView ?: return
        view.evaluateJavascript("window.dispatchEvent(new CustomEvent('ztmusic:android-reveal', {detail:{animate:" + animate + "}}))") {
            // Install the content animations before exposing the WebView.
            view.alpha = 1f
        }
    }

    private fun animationsEnabled() =
        !reducedMotion && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled())

    private fun queueTransition() {
        if (transitionQueued || transitionStarted) return
        transitionQueued = true
        val view = webView ?: return
        val remaining = if (animationsEnabled() && splashProvider != null)
            (320L - (SystemClock.uptimeMillis() - startedAt)).coerceAtLeast(0L) else 0L
        view.postDelayed({
            if (isDestroyed) { splashProvider?.remove(); return@postDelayed }
            transitionStarted = true
            val provider = splashProvider
            splashProvider = null
            val animate = animationsEnabled()
            Log.i("ZTStartup", "splash-exit ms=" + (SystemClock.uptimeMillis() - startedAt) + " animate=" + animate)
            if (!animate || provider == null) {
                revealDocument(animate)
                provider?.remove()
            } else {
                provider.iconView.animate().scaleX(0.97f).scaleY(0.97f)
                    .setDuration(200).setInterpolator(FastOutSlowInInterpolator()).start()
                provider.view.animate().alpha(0f).setDuration(200)
                    .setInterpolator(FastOutSlowInInterpolator()).withEndAction { provider.remove() }.start()
                // 200ms exit and 260ms reveal overlap for the final 80ms.
                view.postDelayed({ if (!isDestroyed) revealDocument(true) }, 120)
            }
        }, remaining)
    }

    override fun onStartupFrameReady(reducedMotion: Boolean) {
        this.reducedMotion = reducedMotion
        if (firstFrameAvailable) {
            // Reloading a document does not receive another system Splash.
            revealDocument(false)
            return
        }
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
                            queueTransition()
                        }
                    })
                }
            }
        }
        view.viewTreeObserver.addOnDrawListener(listener)
        view.invalidate()
    }
}
