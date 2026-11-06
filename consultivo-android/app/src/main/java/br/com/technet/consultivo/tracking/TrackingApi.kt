package br.com.technet.consultivo.tracking

import android.content.Context
import br.com.technet.consultivo.BuildConfig
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

object TrackingApi {
    private const val BATCH_SIZE = 100
    private const val MAX_BATCHES_PER_FLUSH = 8

    private fun post(context: Context, body: JSONObject): JSONObject {
        val store = TrackingStore(context)
        val token = store.deviceToken ?: throw IllegalStateException("Aparelho não vinculado.")
        val apiKey = store.apiKey ?: throw IllegalStateException("Chave pública indisponível.")
        val connection = (URL(BuildConfig.TRACKING_FUNCTION_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", apiKey)
            setRequestProperty("x-technet-device-token", token)
        }
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = BufferedReader(stream.reader()).use { it.readText() }
        val response = if (text.isBlank()) JSONObject() else JSONObject(text)
        if (connection.responseCode !in 200..299) {
            throw IllegalStateException(response.optString("code", "Falha HTTP " + connection.responseCode))
        }
        return response
    }

    fun heartbeat(context: Context, batteryLevel: Int?, networkType: String): Boolean {
        return try {
            val body = JSONObject()
                .put("action", "heartbeat")
                .put("network_type", networkType)
                .put("app_version", BuildConfig.VERSION_NAME)
            if (batteryLevel != null) body.put("battery", batteryLevel)
            post(context, body)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun syncPause(context: Context, paused: Boolean): Boolean {
        return try {
            post(
                context,
                JSONObject()
                    .put("action", if (paused) "pause" else "resume")
                    .put("reason", "manual")
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    fun queuePosition(context: Context, position: JSONObject) {
        TrackingStore(context).enqueue(position)
    }

    fun flushQueuedPositions(context: Context): Boolean {
        val store = TrackingStore(context)
        if (!store.isConfigured() || store.paused) return false
        return try {
            var batches = 0
            while (store.queue().length() > 0 && batches < MAX_BATCHES_PER_FLUSH) {
                val batch = store.first(BATCH_SIZE)
                if (batch.length() == 0) break
                post(
                    context,
                    JSONObject()
                        .put("action", "batch")
                        .put("positions", batch)
                )
                store.removeFirst(batch.length())
                batches += 1
            }
            true
        } catch (_: Exception) {
            false
        }
    }
}
