plugins {
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    // Firebase Auth is the app's identity provider. Check for a newer
    // google-services plugin before a release build.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
