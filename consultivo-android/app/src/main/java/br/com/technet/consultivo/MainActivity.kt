package br.com.technet.consultivo

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import br.com.technet.consultivo.databinding.ActivityMainBinding
import br.com.technet.consultivo.tracking.TrackingApi
import br.com.technet.consultivo.tracking.TrackingService
import br.com.technet.consultivo.tracking.TrackingStore
import br.com.technet.consultivo.update.AppUpdateInfo
import br.com.technet.consultivo.update.AppUpdateManager
import java.util.concurrent.Executors
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var firstPageFinished = false
    private var lastUpdateCheckAt = 0L
    private val trackingExecutor = Executors.newSingleThreadExecutor()
    private var pendingUpdate: AppUpdateInfo? = null
    private var updateDownloading = false
    private var updateDialog: AlertDialog? = null
    private var lastPausedAt = 0L
    private var hasResumedOnce = false
    private var backgroundPermissionPrompted = false

    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (hasLocationPermission()) requestNativeTrackingPermissionsAndStart()
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private val backgroundLocationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        configureSystemInsets()

        configureWebView()
        binding.retryButton.setOnClickListener { loadHome() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) binding.webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            loadHome()
        } else {
            binding.webView.restoreState(savedInstanceState)
            hideSplash()
        }

        checkForAppUpdate(force = true)
    }

    private fun configureSystemInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, 0, 0, systemBars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(binding.root)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        binding.webView.apply {
            isVerticalScrollBarEnabled = true
            isHorizontalScrollBarEnabled = false
            isNestedScrollingEnabled = true
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        }

        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(false)
            cacheMode = WebSettings.LOAD_NO_CACHE
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            useWideViewPort = false
            loadWithOverviewMode = false
            textZoom = 100
            userAgentString = userAgentString + " TechNET-Consultivo/" + BuildConfig.VERSION_NAME
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(binding.webView, false)
        }

        binding.webView.webChromeClient = WebChromeClient()
        binding.webView.addJavascriptInterface(NativeTrackingBridge(), "TechNETNativeTracking")

        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                binding.errorView.visibility = View.GONE
                binding.webView.visibility = View.VISIBLE
                binding.pageProgress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                binding.pageProgress.visibility = View.GONE
                if (url?.contains("consultivoReturn=1") == true) {
                    installConsultivoLoginReturn(view)
                }
                if (!firstPageFinished) {
                    firstPageFinished = true
                    binding.splashView.postDelayed({ hideSplash() }, 250)
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString()
                if (TrustedNavigation.isAllowed(url)) return false

                if (!url.isNullOrBlank()) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                }
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) showLoadError()
            }
        }
    }

    private fun installConsultivoLoginReturn(view: WebView?) {
        val script = """
            (() => {
              if (window.__technetConsultivoReturnTimer) return;
              window.__technetConsultivoReturnTimer = setInterval(() => {
                try {
                  const raw = localStorage.getItem('technet-vendas-comercial-session');
                  const stored = raw ? JSON.parse(raw) : null;
                  if (stored && stored.access_token) {
                    clearInterval(window.__technetConsultivoReturnTimer);
                    window.__technetConsultivoReturnTimer = null;
                    location.replace('/consultivo.html?nativeReturn=' + Date.now());
                  }
                } catch (_) {}
              }, 500);
            })();
        """.trimIndent()
        view?.evaluateJavascript(script, null)
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestNativeTrackingPermissionsAndStart() {
        if (!hasLocationPermission()) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        startNativeTrackingIfConfigured()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) !=
                PackageManager.PERMISSION_GRANTED && !backgroundPermissionPrompted
        ) {
            backgroundPermissionPrompted = true
            AlertDialog.Builder(this)
                .setTitle("Localização em segundo plano")
                .setMessage("Para retomar o rastreamento após reiniciar o celular, permita a localização o tempo todo nas configurações do CONSULTIVO.")
                .setPositiveButton("Configurar") { _, _ ->
                    if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
                        backgroundLocationPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    } else {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                    }
                }
                .setNegativeButton("Agora não", null)
                .show()
        }
    }

    private fun startNativeTrackingIfConfigured() {
        if (!hasLocationPermission() || !TrackingStore(this).isConfigured()) return
        runCatching { TrackingService.start(this) }
    }

    private inner class NativeTrackingBridge {
        @JavascriptInterface
        fun configure(deviceToken: String, publishableKey: String, paused: Boolean): Boolean {
            if (!deviceToken.matches(Regex("^[0-9a-fA-F]{64}$")) ||
                !publishableKey.startsWith("sb_")
            ) return false
            TrackingStore(this@MainActivity).configure(deviceToken, publishableKey, paused)
            runOnUiThread { requestNativeTrackingPermissionsAndStart() }
            return true
        }

        @JavascriptInterface
        fun setPaused(paused: Boolean) {
            val store = TrackingStore(this@MainActivity)
            if (!store.isConfigured()) return
            store.paused = paused
            trackingExecutor.execute { TrackingApi.syncPause(this@MainActivity, paused) }
            runOnUiThread { startNativeTrackingIfConfigured() }
        }

        @JavascriptInterface
        fun snapshot(): String = JSONObject(TrackingStore(this@MainActivity).snapshotJson())
            .put("location_permission", hasLocationPermission())
            .toString()

        @JavascriptInterface
        fun clear() {
            TrackingStore(this@MainActivity).clear()
            runOnUiThread { TrackingService.stop(this@MainActivity) }
        }
    }

    private fun loadHome() {
        firstPageFinished = false
        binding.errorView.visibility = View.GONE
        binding.splashView.visibility = View.VISIBLE
        binding.webView.visibility = View.VISIBLE
        loadFreshShell()
    }

    private fun loadFreshShell(showSplash: Boolean = true) {
        if (!showSplash) {
            binding.splashView.visibility = View.GONE
            binding.pageProgress.visibility = View.VISIBLE
        }
        val separator = if (HOME_URL.contains("?")) "&" else "?"
        val freshUrl =
            HOME_URL + separator + "nativeVersion=" + BuildConfig.VERSION_CODE +
                "&fresh=" + System.currentTimeMillis()
        binding.webView.loadUrl(
            freshUrl,
            mapOf(
                "Cache-Control" to "no-cache, no-store, must-revalidate",
                "Pragma" to "no-cache"
            )
        )
    }

    private fun refreshShellAfterResumeIfSafe() {
        if (!firstPageFinished || binding.webView.visibility != View.VISIBLE) return
        binding.webView.evaluateJavascript(
            "(document.getElementById('cvContent')?.dataset.screen || '')"
        ) { rawScreen ->
            val screen = rawScreen
                ?.trim()
                ?.trim('"')
                ?.lowercase()
                .orEmpty()
            if (screen == "sales") return@evaluateJavascript
            loadFreshShell(showSplash = false)
        }
    }

    private fun hideSplash() {
        binding.splashView.animate()
            .alpha(0f)
            .setDuration(180)
            .withEndAction {
                binding.splashView.visibility = View.GONE
                binding.splashView.alpha = 1f
            }
            .start()
    }

    private fun showLoadError() {
        binding.pageProgress.visibility = View.GONE
        binding.splashView.visibility = View.GONE
        binding.webView.visibility = View.GONE
        binding.errorView.visibility = View.VISIBLE
    }

    override fun onResume() {
        super.onResume()

        val now = System.currentTimeMillis()
        if (hasResumedOnce &&
            lastPausedAt > 0L &&
            now - lastPausedAt >= SHELL_REFRESH_BACKGROUND_MS
        ) {
            refreshShellAfterResumeIfSafe()
        }
        hasResumedOnce = true
        startNativeTrackingIfConfigured()

        val queuedUpdate = pendingUpdate
        if (queuedUpdate != null &&
            AppUpdateManager.canInstallPackages(this) &&
            !updateDownloading
        ) {
            pendingUpdate = null
            startUpdateDownload(queuedUpdate)
        } else {
            checkForAppUpdate()
        }
    }

    override fun onPause() {
        lastPausedAt = System.currentTimeMillis()
        super.onPause()
    }

    private fun checkForAppUpdate(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return
        lastUpdateCheckAt = now

        AppUpdateManager.checkForUpdate { info ->
            runOnUiThread {
                if (isFinishing || isDestroyed || info == null) return@runOnUiThread
                if (shouldDeferOptionalUpdate(info)) return@runOnUiThread
                showUpdateDialog(info)
            }
        }
    }

    private fun shouldDeferOptionalUpdate(info: AppUpdateInfo): Boolean {
        if (info.mandatory) return false
        val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
        val deferredVersion = prefs.getInt(KEY_DEFERRED_VERSION, 0)
        val deferredUntil = prefs.getLong(KEY_DEFERRED_UNTIL, 0L)
        return deferredVersion == info.versionCode && System.currentTimeMillis() < deferredUntil
    }

    private fun showUpdateDialog(info: AppUpdateInfo) {
        val existing = updateDialog
        if (existing?.isShowing == true) return

        val message = buildString {
            append("Versão instalada: ")
            append(BuildConfig.VERSION_NAME)
            append("\nNova versão: ")
            append(info.versionName)
            if (info.notes.isNotBlank()) {
                append("\n\n")
                append(info.notes)
            }
            append("\n\nA atualização é baixada pelo próprio TECHNET - CONSULTIVO.")
        }

        val builder = AlertDialog.Builder(this)
            .setTitle(if (info.mandatory) "Atualização obrigatória" else "Nova versão disponível")
            .setMessage(message)
            .setPositiveButton("Atualizar agora") { _, _ ->
                clearDeferredUpdate()
                if (!AppUpdateManager.canInstallPackages(this)) {
                    pendingUpdate = info
                    Toast.makeText(
                        this,
                        "Ative “Permitir desta fonte”. Ao voltar, o download começa automaticamente.",
                        Toast.LENGTH_LONG
                    ).show()
                    AppUpdateManager.openInstallPermission(this)
                } else {
                    startUpdateDownload(info)
                }
            }

        if (!info.mandatory) {
            builder.setNegativeButton("Depois") { _, _ ->
                val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
                prefs.edit()
                    .putInt(KEY_DEFERRED_VERSION, info.versionCode)
                    .putLong(
                        KEY_DEFERRED_UNTIL,
                        System.currentTimeMillis() + OPTIONAL_REMINDER_DELAY_MS
                    )
                    .apply()
            }
        } else {
            builder.setCancelable(false)
        }

        updateDialog = builder.create().also { dialog ->
            dialog.setCanceledOnTouchOutside(false)
            dialog.setOnDismissListener {
                if (updateDialog === dialog) updateDialog = null
            }
            dialog.show()
        }
    }

    private fun clearDeferredUpdate() {
        getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
            .edit()
            .remove(KEY_DEFERRED_VERSION)
            .remove(KEY_DEFERRED_UNTIL)
            .apply()
    }

    private fun startUpdateDownload(info: AppUpdateInfo) {
        if (updateDownloading) return
        updateDownloading = true
        Toast.makeText(
            this,
            "Preparando atualização ${info.versionName}…",
            Toast.LENGTH_SHORT
        ).show()
        AppUpdateManager.downloadAndInstall(this, info) {
            updateDownloading = false
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        updateDialog?.dismiss()
        updateDialog = null
        trackingExecutor.shutdownNow()
        binding.webView.apply {
            removeJavascriptInterface("TechNETNativeTracking")
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        const val HOME_URL = "https://technet-vendas-2026.web.app/consultivo.html"
        private const val UPDATE_CHECK_INTERVAL_MS = 30_000L
        private const val SHELL_REFRESH_BACKGROUND_MS = 3_000L
        private const val OPTIONAL_REMINDER_DELAY_MS = 6 * 60 * 60 * 1000L
        private const val UPDATE_PREFS = "consultivo_updates"
        private const val KEY_DEFERRED_VERSION = "deferred_version"
        private const val KEY_DEFERRED_UNTIL = "deferred_until"
    }
}
