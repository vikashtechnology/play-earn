import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

val apiBaseUrl = providers.gradleProperty("API_BASE_URL").orElse("http://10.0.2.2:4000").get()
val googleWebClientId = providers.gradleProperty("GOOGLE_WEB_CLIENT_ID").orElse("").get()
// HTTPS page that receives Firebase email sign-in links. It must be registered
// as an authorized domain in the Firebase console and must redirect back into
// the app. Override with -PEMAIL_LINK_URL=https://your-domain/auth/verify-email
val emailLinkUrl = providers.gradleProperty("EMAIL_LINK_URL")
    .orElse("https://playearn.example/auth/verify-email")
    .get()
val emailLinkUri = URI.create(emailLinkUrl)

android {
    namespace = "com.rewardsplatform.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.rewardsplatform.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
        buildConfigField("String", "EMAIL_LINK_URL", "\"$emailLinkUrl\"")

        manifestPlaceholders["emailLinkScheme"] = emailLinkUri.scheme ?: "https"
        manifestPlaceholders["emailLinkHost"] = emailLinkUri.host ?: "playearn.example"
        manifestPlaceholders["emailLinkPath"] = emailLinkUri.path ?: "/auth/verify-email"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.01.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // Firebase BoM keeps every Firebase library on one tested version set.
    val firebaseBom = platform("com.google.firebase:firebase-bom:33.7.0")
    implementation(firebaseBom)
    implementation("com.google.firebase:firebase-auth")

    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Bridges Firebase Task<T> results into coroutines.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
