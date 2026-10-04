package com.zheting.player

import org.junit.Test

import org.junit.Assert.*

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
class ExampleUnitTest {
    @Test
    fun unavailableOemDisablesEnhancement() {
        var calls = 0
        var stopped = 0
        val state = LivePlayerState("1", "title", "artist", true, 0)
        val failing = object : LiveActivityAdapter {
            override fun isSupported() = true
            override fun start(state: LivePlayerState) { calls++; throw SecurityException("OEM permission missing") }
            override fun update(state: LivePlayerState) { fail("disabled OEM adapter must not update") }
            override fun stop() { stopped++ }
        }
        val router = LiveActivityRouter(failing)
        router.update(state); router.update(state); router.stop()
        assertEquals(1, calls)
        assertEquals(1, stopped)
        assertFalse(OemFeatures.XIAOMI_ISLAND)
        assertFalse(OemFeatures.OPPO_FLUID_CLOUD)
    }
}
