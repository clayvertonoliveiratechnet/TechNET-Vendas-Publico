package br.com.technet.consultivo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrustedNavigationTest {
    @Test
    fun allowsProductionHostOnlyOverHttps() {
        assertTrue(TrustedNavigation.isAllowed("https://technet-vendas-2026.web.app/"))
        assertTrue(TrustedNavigation.isAllowed("https://technet-vendas-2026.web.app/#dashboard"))
        assertFalse(TrustedNavigation.isAllowed("http://technet-vendas-2026.web.app/"))
        assertFalse(TrustedNavigation.isAllowed("https://evil.example/"))
        assertFalse(TrustedNavigation.isAllowed("javascript:alert(1)"))
        assertFalse(TrustedNavigation.isAllowed(null))
    }
}
