package br.com.technet.consultivo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppConfigTest {
    @Test
    fun packageAndVersionAreStable() {
        assertEquals("br.com.technet.consultivo", BuildConfig.APPLICATION_ID)
        assertTrue(BuildConfig.VERSION_NAME.isNotBlank())
        assertTrue(BuildConfig.VERSION_CODE >= 1)
    }
}
