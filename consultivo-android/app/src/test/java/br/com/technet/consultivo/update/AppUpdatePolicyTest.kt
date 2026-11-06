package br.com.technet.consultivo.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdatePolicyTest {
    @Test
    fun newerVersionIsOffered() {
        assertTrue(AppUpdatePolicy.isNewer(currentVersionCode = 10, remoteVersionCode = 11))
    }

    @Test
    fun sameVersionIsIgnored() {
        assertFalse(AppUpdatePolicy.isNewer(currentVersionCode = 10, remoteVersionCode = 10))
    }

    @Test
    fun olderVersionIsIgnored() {
        assertFalse(AppUpdatePolicy.isNewer(currentVersionCode = 10, remoteVersionCode = 9))
    }
}
