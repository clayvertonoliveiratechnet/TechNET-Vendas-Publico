package br.com.technet.consultivo.tracking

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class TrackingStore(context: Context) {
    private val prefs = context.getSharedPreferences("consultivo_tracking", Context.MODE_PRIVATE)

    var deviceToken: String?
        get() = prefs.getString("device_token", null)
        private set(value) = prefs.edit().putString("device_token", value).apply()

    var apiKey: String?
        get() = prefs.getString("api_key", null)
        private set(value) = prefs.edit().putString("api_key", value).apply()

    var paused: Boolean
        get() = prefs.getBoolean("paused", false)
        set(value) = prefs.edit().putBoolean("paused", value).apply()

    fun configure(token: String, publishableKey: String, isPaused: Boolean) {
        val previousToken = deviceToken
        if (!previousToken.isNullOrBlank() && previousToken != token) {
            prefs.edit().remove("queue").remove("last_position").apply()
        }
        deviceToken = token
        apiKey = publishableKey
        paused = isPaused
        prefs.edit().putLong("configured_at", System.currentTimeMillis()).apply()
    }

    fun isConfigured(): Boolean =
        !deviceToken.isNullOrBlank() && !apiKey.isNullOrBlank()

    fun clear() {
        prefs.edit()
            .remove("device_token")
            .remove("api_key")
            .remove("configured_at")
            .remove("paused")
            .remove("queue")
            .remove("last_position")
            .apply()
    }

    fun saveSnapshot(position: JSONObject) {
        prefs.edit().putString("last_position", position.toString()).apply()
    }

    fun snapshotJson(): String {
        val position = try {
            prefs.getString("last_position", null)?.let(::JSONObject)
        } catch (_: Exception) {
            null
        }
        return JSONObject()
            .put("configured", isConfigured())
            .put("paused", paused)
            .put("last_position", position ?: JSONObject.NULL)
            .toString()
    }

    @Synchronized
    fun enqueue(position: JSONObject) {
        val queue = queue()
        val sourceId = position.optString("source_id")
        if (sourceId.isNotBlank()) {
            for (i in 0 until queue.length()) {
                if (queue.optJSONObject(i)?.optString("source_id") == sourceId) return
            }
        }
        queue.put(position)
        val trimmed = JSONArray()
        val start = maxOf(0, queue.length() - 1000)
        for (i in start until queue.length()) trimmed.put(queue.getJSONObject(i))
        saveQueue(trimmed)
    }

    @Synchronized
    fun queue(): JSONArray = try {
        JSONArray(prefs.getString("queue", "[]"))
    } catch (_: Exception) {
        JSONArray()
    }

    @Synchronized
    fun first(count: Int): JSONArray {
        val queue = queue()
        val result = JSONArray()
        val limit = minOf(count, queue.length())
        for (i in 0 until limit) result.put(queue.getJSONObject(i))
        return result
    }

    @Synchronized
    fun removeFirst(count: Int) {
        val queue = queue()
        val remaining = JSONArray()
        for (i in minOf(count, queue.length()) until queue.length()) {
            remaining.put(queue.getJSONObject(i))
        }
        saveQueue(remaining)
    }

    private fun saveQueue(queue: JSONArray) {
        prefs.edit().putString("queue", queue.toString()).commit()
    }
}
