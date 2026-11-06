import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val signingPropertiesPath = providers.gradleProperty("SIGNING_PROPERTIES").orNull
val signingProperties = Properties()
if (!signingPropertiesPath.isNullOrBlank()) {
    val signingFile = file(signingPropertiesPath)
    if (signingFile.exists()) signingFile.inputStream().use(signingProperties::load)
}

android {
    namespace = "br.com.technet.consultivo"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.technet.consultivo"
        minSdk = 26
        targetSdk = 35
        versionCode = (project.findProperty("VERSION_CODE") as String?)?.toIntOrNull() ?: 7
        versionName = (project.findProperty("VERSION_NAME") as String?) ?: "0.3.2"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        val updateManifestUrl = (
            project.findProperty("APP_UPDATE_MANIFEST_URL") as String?
                ?: "https://technet-vendas-2026.web.app/downloads/consultivo/consultivo-app-update.json"
            ).trim()
        buildConfigField("String", "APP_UPDATE_MANIFEST_URL", "\"$updateManifestUrl\"")
        buildConfigField(
            "String",
            "TRACKING_FUNCTION_URL",
            "\"https://zpapjeqjpthaxrefrcey.supabase.co/functions/v1/tv-consultivo-location\""
        )
    }

    signingConfigs {
        create("stableRelease") {
            if (signingProperties.isNotEmpty()) {
                storeFile = file(signingProperties.getProperty("storeFile"))
                storePassword = signingProperties.getProperty("storePassword")
                keyAlias = signingProperties.getProperty("keyAlias")
                keyPassword = signingProperties.getProperty("keyPassword")
            }
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingProperties.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("stableRelease")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    testImplementation("junit:junit:4.13.2")
}
