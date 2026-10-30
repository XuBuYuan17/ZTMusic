package com.zheting.player

import kotlin.math.log10
import kotlin.math.min
import kotlin.math.pow

internal object Loudness {
    fun attenuationDb(gain: Double?, peak: Double?): Double? {
        if (gain == null || peak == null || !gain.isFinite() || !peak.isFinite()) return null
        if (gain !in -24.0..24.0 || peak <= 0.0 || peak > 2.0) return null
        return maxOf(-24.0, min(0.0, min(gain, -1.0 - 20.0 * log10(peak))))
    }

    fun factor(gain: Double?): Float = if (gain == null || !gain.isFinite()) 1f else 10.0.pow(gain.coerceIn(-24.0, 0.0) / 20.0).toFloat()
}
