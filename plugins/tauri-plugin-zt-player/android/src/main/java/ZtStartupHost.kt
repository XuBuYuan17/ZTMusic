package com.zheting.player

/** Implemented by the single launcher Activity; independent of the generated app package. */
interface ZtStartupHost {
    fun onStartupFrameReady()
    fun onAppThemeChanged(theme: String)
}
