package com.zheting.player

import org.junit.After
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NativeListeningSyncTest {
    private val backend = "https://music.xubuyuan.top"

    @After fun clearAccount() { NativeListeningSync.configure(backend, "") }

    @Test fun cookieRefreshKeepsTheAccountButSwitchingAccountsInvalidatesIt() {
        NativeListeningSync.configure(backend, "MUSIC_U=test-one; os=pc")
        val account = checkNotNull(NativeListeningSync.account)

        NativeListeningSync.configure(backend, "MUSIC_U=test-one; os=pc; __csrf=test")
        assertSame(account, NativeListeningSync.account)

        NativeListeningSync.configure(backend, "MUSIC_U=test-two; os=pc")
        assertNotSame(account, checkNotNull(NativeListeningSync.account))

        NativeListeningSync.configure(backend, "")
        assertNull(NativeListeningSync.account)
    }

    @Test fun untrustedBackendCannotReceiveCloudListeningRecords() {
        NativeListeningSync.configure("https://example.test", "MUSIC_U=test")
        assertNull(NativeListeningSync.account)
    }
}
