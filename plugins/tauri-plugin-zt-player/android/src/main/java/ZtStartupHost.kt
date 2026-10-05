package com.zheting.player

/** Implemented by the single launcher Activity; independent of the generated app package. */
interface ZtStartupHost {
    fun onStartupFrameReady(reducedMotion: Boolean = false)
    fun onAppThemeChanged(theme: String)
}
