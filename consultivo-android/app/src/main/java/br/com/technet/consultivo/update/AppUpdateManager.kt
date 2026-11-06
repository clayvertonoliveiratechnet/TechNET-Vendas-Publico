package br.com.technet.consultivo.update

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import br.com.technet.consultivo.BuildConfig
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

data class AppUpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val packageUrl: String,
    val notes: String,
    val mandatory: Boolean
)

object AppUpdatePolicy {
    fun isNewer(currentVersionCode: Int, remoteVersionCode: Int): Boolean =
        remoteVersionCode > currentVersionCode
}

object AppUpdateManager {
    private const val APK_MIME = "application/vnd.android.package-archive"
    private const val MIN_VALID_APK_BYTES = 100_000L
    private val executor = Executors.newSingleThreadExecutor()

    fun checkForUpdate(onResult: (AppUpdateInfo?) -> Unit) {
        executor.execute {
            val result = runCatching {
                val connection =
                    URL(BuildConfig.APP_UPDATE_MANIFEST_URL).openConnection() as HttpURLConnection
                connection.apply {
                    requestMethod = "GET"
                    connectTimeout = 6_000
                    readTimeout = 8_000
                    useCaches = false
                    setRequestProperty("Cache-Control", "no-cache, no-store")
                    setRequestProperty("Pragma", "no-cache")
                    setRequestProperty("Accept", "application/json")
                }

                try {
                    if (connection.responseCode !in 200..299) return@runCatching null
                    val payload = BufferedReader(connection.inputStream.reader()).use { it.readText() }
                    val json = JSONObject(payload)
                    val versionCode = json.optInt("versionCode", 0)
                    val packageUrl = json.optString("apkUrl", "").trim()

                    if (!AppUpdatePolicy.isNewer(BuildConfig.VERSION_CODE, versionCode) ||
                        packageUrl.isBlank()
                    ) {
                        null
                    } else {
                        AppUpdateInfo(
                            versionCode = versionCode,
                            versionName = json.optString("versionName", "nova versão"),
                            packageUrl = packageUrl,
                            notes = json.optString(
                                "notes",
                                "Nova versão do TECHNET - CONSULTIVO disponível."
                            ),
                            mandatory = json.optBoolean("mandatory", false)
                        )
                    }
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()

            onResult(result)
        }
    }

    fun canInstallPackages(activity: Activity): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        activity.startActivity(
            Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}")
            )
        )
    }

    fun downloadAndInstall(
        activity: Activity,
        info: AppUpdateInfo,
        onFinished: () -> Unit = {}
    ) {
        executor.execute {
            try {
                activity.runOnUiThread {
                    Toast.makeText(
                        activity,
                        "Baixando atualização ${info.versionName}…",
                        Toast.LENGTH_LONG
                    ).show()
                }

                val directory =
                    activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                        ?: activity.filesDir
                directory.mkdirs()

                val safeVersion = info.versionName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val remoteIsZip =
                    info.packageUrl.substringBefore('?').lowercase().endsWith(".zip")
                val extension = if (remoteIsZip) "zip" else "apk"
                val downloaded = File(
                    directory,
                    "TECHNET-CONSULTIVO-update-${safeVersion}.${extension}"
                )
                if (downloaded.exists()) downloaded.delete()

                download(info.packageUrl, downloaded)

                val apkFile = if (remoteIsZip) {
                    extractApk(
                        downloaded,
                        File(directory, "TECHNET-CONSULTIVO-${safeVersion}.apk")
                    )
                } else {
                    downloaded
                }

                if (!apkFile.exists() || apkFile.length() < MIN_VALID_APK_BYTES) {
                    error("Pacote de atualização inválido.")
                }

                val uri = FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.fileprovider",
                    apkFile
                )

                activity.runOnUiThread {
                    try {
                        val install = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, APK_MIME)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        }
                        activity.startActivity(install)
                    } catch (_: Exception) {
                        Toast.makeText(
                            activity,
                            "Não foi possível abrir o instalador do Android.",
                            Toast.LENGTH_LONG
                        ).show()
                    } finally {
                        onFinished()
                    }
                }
            } catch (_: Exception) {
                activity.runOnUiThread {
                    Toast.makeText(
                        activity,
                        "Não foi possível baixar a atualização agora.",
                        Toast.LENGTH_LONG
                    ).show()
                    onFinished()
                }
            }
        }
    }

    private fun download(url: String, destination: File) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            useCaches = false
            setRequestProperty("Cache-Control", "no-cache, no-store")
        }

        try {
            if (connection.responseCode !in 200..299) {
                error("Falha HTTP ${connection.responseCode}")
            }
            connection.inputStream.use { input ->
                FileOutputStream(destination).use { output ->
                    input.copyTo(output, 64 * 1024)
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun extractApk(zipFile: File, destination: File): File {
        if (destination.exists()) destination.delete()

        ZipInputStream(FileInputStream(zipFile)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (!entry.isDirectory && entry.name.lowercase().endsWith(".apk")) {
                    FileOutputStream(destination).use { output ->
                        zip.copyTo(output, 64 * 1024)
                    }
                    zip.closeEntry()
                    return destination
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }

        error("APK não encontrado no pacote de atualização.")
    }
}
