package com.zheting.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LoudnessTest {
    @Test fun validAndInvalidMetadata() {
        assertEquals(-9.82, Loudness.attenuationDb(-9.82, 1.0)!!, 0.000001)
        assertEquals(0.0, Loudness.attenuationDb(5.0, 0.5)!!, 0.000001)
        assertEquals(-1.0, Loudness.attenuationDb(0.0, 1.0)!!, 0.000001)
        assertNull(Loudness.attenuationDb(1.5, 0.0))
        assertNull(Loudness.attenuationDb(Double.NaN, 1.0))
        assertNull(Loudness.attenuationDb(null, 1.0))
        assertEquals(1f, Loudness.factor(null), 0.00001f)
        assertEquals(0.501187f, Loudness.factor(-6.0), 0.00001f)
    }
}
