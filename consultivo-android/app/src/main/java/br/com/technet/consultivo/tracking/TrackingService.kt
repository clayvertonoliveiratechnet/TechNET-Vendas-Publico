package br.com.technet.consultivo.tracking

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import br.com.technet.consultivo.MainActivity
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

class TrackingService : Service() {
    private lateinit var client: FusedLocationProviderClient
    private val locationExecutor = Executors.newSingleThreadExecutor()
    private val uploadExecutor = Executors.newSingleThreadExecutor()
    private val heartbeatExecutor = Executors.newSingleThreadScheduledExecutor()
    private val watchdogExecutor = Executors.newSingleThreadScheduledExecutor()
    private val flushRunning = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var updatesRunning = false
    @Volatile private var heartbeatStarted = false
    @Volatile private var watchdogStarted = false
    @Volatile private var lastLocationReceivedElapsed = 0L
    private var lastAcceptedLocation: Location? = null
    private var lastSentLocation: Location? = null
    private var lastSentElapsed = 0L

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.sortedBy { it.time }.forEach { location ->
                lastLocationReceivedElapsed = SystemClock.elapsedRealtime()
                locationExecutor.execute { processLocation(location) }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIFICATION_ID, notification())
        client = LocationServices.getFusedLocationProviderClient(this)
        lastLocationReceivedElapsed = SystemClock.elapsedRealtime()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = TrackingStore(this)
        if (!store.isConfigured()) {
            stopSelf()
            return START_NOT_STICKY
        }
        startHeartbeat()
        startWatchdog()
        if (store.paused) stopUpdates() else startUpdates()
        triggerQueueFlush()
        return START_STICKY
    }

    private fun startHeartbeat() {
        if (heartbeatStarted) return
        heartbeatStarted = true
        heartbeatExecutor.scheduleAtFixedRate({
            val store = TrackingStore(this)
            TrackingApi.heartbeat(this, batteryPercent(), networkType())
            mainHandler.post {
                if (!store.isConfigured()) stopSelf()
                else if (store.paused) stopUpdates()
                else {
                    startUpdates()
                    triggerQueueFlush()
                }
            }
        }, 0, 20, TimeUnit.SECONDS)
    }

    private fun startWatchdog() {
        if (watchdogStarted) return
        watchdogStarted = true
        watchdogExecutor.scheduleAtFixedRate({
            if (!updatesRunning) return@scheduleAtFixedRate
            val silentFor = SystemClock.elapsedRealtime() - lastLocationReceivedElapsed
            if (silentFor >= 75_000L) {
                recoverCurrentLocation()
                mainHandler.post {
                    stopUpdates()
                    startUpdates()
                }
            }
        }, 45, 45, TimeUnit.SECONDS)
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun startUpdates() {
        if (updatesRunning || !hasLocationPermission()) return
        try {
            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
                .setMinUpdateIntervalMillis(5_000L)
                .setMinUpdateDistanceMeters(8f)
                .setMaxUpdateDelayMillis(15_000L)
                .setMaxUpdateAgeMillis(12_000L)
                .setWaitForAccurateLocation(true)
                .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
                .build()
            client.requestLocationUpdates(request, callback, mainLooper)
            updatesRunning = true
            lastLocationReceivedElapsed = SystemClock.elapsedRealtime()
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun stopUpdates() {
        if (!updatesRunning) return
        client.removeLocationUpdates(callback)
        updatesRunning = false
    }

    private fun recoverCurrentLocation() {
        if (!hasLocationPermission()) return
        try {
            val cancellation = CancellationTokenSource()
            client.getCurrentLocation(
                CurrentLocationRequest.Builder()
                    .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                    .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
                    .setMaxUpdateAgeMillis(10_000L)
                    .setDurationMillis(20_000L)
                    .build(),
                cancellation.token
            ).addOnSuccessListener { location ->
                if (location != null) {
                    lastLocationReceivedElapsed = SystemClock.elapsedRealtime()
                    locationExecutor.execute { processLocation(location) }
                }
            }
        } catch (_: SecurityException) {
            // A permissão pode ser removida durante a execução.
        }
    }

    private fun processLocation(location: Location) {
        if (!isUsableLocation(location)) return
        val store = TrackingStore(this)
        if (store.paused || !store.isConfigured()) return
        val nowElapsed = SystemClock.elapsedRealtime()
        val previousSent = lastSentLocation
        val metersFromLast = previousSent?.distanceTo(location)?.toDouble() ?: Double.MAX_VALUE
        val secondsSinceLast = if (lastSentElapsed > 0) (nowElapsed - lastSentElapsed) / 1000.0 else Double.MAX_VALUE
        val effectiveSpeed = effectiveMovementSpeed(location, previousSent) ?: 0.0
        val shouldSend =
            previousSent == null ||
            metersFromLast >= 8.0 ||
            effectiveSpeed >= 0.8 ||
            secondsSinceLast >= 60.0

        val snapshot = positionJson(location, effectiveSpeed)
        store.saveSnapshot(snapshot)
        lastAcceptedLocation = Location(location)
        if (!shouldSend) return

        TrackingApi.queuePosition(this, snapshot)
        lastSentLocation = Location(location)
        lastSentElapsed = nowElapsed
        triggerQueueFlush()
    }

    private fun effectiveMovementSpeed(location: Location, previous: Location?): Double? {
        val gpsSpeed =
            if (location.hasSpeed() && location.speed.isFinite() && location.speed >= 0f) location.speed.toDouble()
            else null
        if (previous == null) return gpsSpeed
        val seconds = (location.time - previous.time) / 1000.0
        if (seconds <= 0.0) return gpsSpeed
        val distance = previous.distanceTo(location).toDouble()
        val calculated = distance / seconds
        val plausibleVehicle =
            seconds >= 8.0 &&
            seconds <= 10 * 60.0 &&
            distance >= 60.0 &&
            calculated in 3.3..45.0
        return when {
            plausibleVehicle -> max(gpsSpeed ?: 0.0, calculated)
            gpsSpeed != null -> gpsSpeed
            calculated <= 45.0 -> calculated
            else -> null
        }
    }

    private fun isUsableLocation(location: Location): Boolean {
        if (isMock(location)) return false
        if (!location.hasAccuracy() || !location.accuracy.isFinite() || location.accuracy <= 0f) return false
        if (location.accuracy > 80f) return false
        if (max(0L, System.currentTimeMillis() - location.time) > 2 * 60_000L) return false
        val previous = lastAcceptedLocation ?: return true
        val seconds = (location.time - previous.time) / 1000.0
        if (seconds <= 0) return false
        val distance = previous.distanceTo(location).toDouble()
        val calculatedSpeed = distance / seconds
        val previousGpsSpeed = if (previous.hasSpeed()) previous.speed.toDouble() else 0.0
        val currentGpsSpeed = if (location.hasSpeed()) location.speed.toDouble() else 0.0
        val worstAccuracy = max(previous.accuracy.toDouble(), location.accuracy.toDouble())
        val stationaryJumpLimit = max(100.0, (previous.accuracy + location.accuracy) * 3.0)
        val plausibleVehicle =
            seconds >= 8.0 &&
            distance >= 60.0 &&
            calculatedSpeed in 3.3..45.0 &&
            worstAccuracy <= 35.0

        if (seconds <= 60 &&
            previousGpsSpeed < 2.0 &&
            currentGpsSpeed < 2.0 &&
            distance > stationaryJumpLimit &&
            !plausibleVehicle
        ) return false
        if (worstAccuracy > 35.0 && seconds <= 90 && distance > max(180.0, worstAccuracy * 4.0)) return false
        if (seconds <= 120 && calculatedSpeed > 50.0) return false
        return !(seconds <= 30 && distance > 1200)
    }
    @Suppress("DEPRECATION")
    private fun isMock(location: Location): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) location.isMock else location.isFromMockProvider

    private fun positionJson(location: Location, speed: Double): JSONObject {
        val activity = when {
            speed >= 3.3 -> "vehicle"
            speed >= 0.5 -> "walking"
            else -> "stopped"
        }
        return JSONObject()
            .put("source_id", UUID.randomUUID().toString())
            .put("recorded_at", Instant.ofEpochMilli(location.time).toString())
            .put("latitude", location.latitude)
            .put("longitude", location.longitude)
            .put("accuracy", location.accuracy.toDouble())
            .put("speed", speed)
            .put("heading", if (location.hasBearing()) location.bearing.toDouble() else JSONObject.NULL)
            .put("battery_level", batteryPercent() ?: JSONObject.NULL)
            .put("activity_type", activity)
    }

    private fun triggerQueueFlush() {
        if (!flushRunning.compareAndSet(false, true)) return
        uploadExecutor.execute {
            try {
                TrackingApi.flushQueuedPositions(this)
            } finally {
                flushRunning.set(false)
            }
        }
    }

    private fun networkType(): String {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return "Sem rede"
        val network = manager.activeNetwork ?: return "Sem rede"
        val capabilities = manager.getNetworkCapabilities(network) ?: return "Sem rede"
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Dados móveis"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
            else -> "Internet"
        }
    }

    private fun batteryPercent(): Int? {
        val battery = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) level * 100 / scale else null
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TECHNET - CONSULTIVO",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun notification(): Notification {
        val pending = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("TECHNET - CONSULTIVO")
            .setContentText("Localização de campo ativa")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pending)
            .build()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        stopUpdates()
        heartbeatExecutor.shutdownNow()
        watchdogExecutor.shutdownNow()
        uploadExecutor.shutdownNow()
        locationExecutor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "consultivo_tracking"
        private const val NOTIFICATION_ID = 1201

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}
