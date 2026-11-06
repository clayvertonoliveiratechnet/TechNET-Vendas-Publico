package br.com.technet.consultivo

import java.net.URI

object TrustedNavigation {
    private val allowedHosts = setOf("technet-vendas-2026.web.app")

    fun isAllowed(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        return uri.scheme.equals("https", ignoreCase = true) &&
            uri.host?.lowercase() in allowedHosts
    }
}
