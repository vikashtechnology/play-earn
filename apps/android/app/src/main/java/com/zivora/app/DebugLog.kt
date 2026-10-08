package com.zivora.app

import android.util.Log

/**
 * Debug-build-only logging.
 *
 * The app reaches the API over cleartext HTTP on a LAN address during
 * development, and Firebase over HTTPS. When either fails on a device the UI can
 * only show a generic message, and several call sites swallow the underlying
 * exception — so without this there is no way to tell "wrong API_BASE_URL" from
 * "sign-up gate closed" from "phone and laptop are on different networks".
 *
 * Nothing is written in a release build, and no token, secret, phone number, or
 * request body is ever logged: only URLs, HTTP statuses, and error codes.
 */
object DebugLog {
    /** Filter logcat with: adb logcat -s Zivora:V */
    const val TAG = "Zivora"

    fun d(message: String) {
        if (BuildConfig.DEBUG) Log.d(TAG, message)
    }

    fun w(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.w(TAG, message, error)
    }

    fun e(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.e(TAG, message, error)
    }
}
