package com.zheting.player

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.util.Log

/** Debug-only stage markers; never log payloads, URLs, cookies or track metadata. */
internal object PlaybackDiagnostics {
    fun mark(context: Context, event: String) {
        if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            Log.d("ZTAudioStartup", "ms=${SystemClock.elapsedRealtime()} $event")
        }
    }
}
