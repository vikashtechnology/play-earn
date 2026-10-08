package com.rewardsplatform.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** Sign-up state kept between "send email link" and the link arriving. */
data class PendingSignup(val email: String, val consent: ConsentRecord)

/**
 * Encrypted on-device storage for the platform API session and for pending
 * sign-up consent. Firebase keeps its own session; nothing here is a Firebase
 * credential. Values are sealed with an AES/GCM key that never leaves the
 * Android Keystore, so personal data is not stored in plaintext.
 */
class SessionTokenStore(context: Context) {
    private val preferences = context.getSharedPreferences("auth_session", Context.MODE_PRIVATE)

    fun saveAccessToken(
        token: String,
        expiresInSeconds: Int,
        userId: String = "",
        phoneVerified: Boolean = false,
        minimumKycVerified: Boolean = false,
    ) {
        preferences.edit()
            .putString(TOKEN_KEY, encrypt(token))
            .putLong(EXPIRY_KEY, System.currentTimeMillis() + expiresInSeconds * 1_000L)
            .putString(USER_ID_KEY, userId)
            .putBoolean(PHONE_VERIFIED_KEY, phoneVerified)
            .putBoolean(MINIMUM_KYC_KEY, minimumKycVerified)
            .apply()
    }

    fun readAccessToken(): String? {
        if (preferences.getLong(EXPIRY_KEY, 0L) <= System.currentTimeMillis()) {
            clearAccessToken()
            return null
        }
        return decrypt(preferences.getString(TOKEN_KEY, null) ?: return null)
    }

    fun readUserId(): String? = preferences.getString(USER_ID_KEY, null)?.takeUnless { it.isBlank() }

    fun isMinimumKycVerified(): Boolean =
        readAccessToken() != null && preferences.getBoolean(MINIMUM_KYC_KEY, false)

    fun markMinimumKycVerified() {
        preferences.edit()
            .putBoolean(PHONE_VERIFIED_KEY, true)
            .putBoolean(MINIMUM_KYC_KEY, true)
            .apply()
    }

    /** Firebase email links arrive later, so consent must survive the wait. */
    fun savePendingSignup(signup: PendingSignup) {
        val payload = JSONObject()
            .put("email", signup.email)
            .put("consent", signup.consent.toJson())
        preferences.edit().putString(PENDING_SIGNUP_KEY, encrypt(payload.toString())).apply()
    }

    fun readPendingSignup(): PendingSignup? {
        val raw = decrypt(preferences.getString(PENDING_SIGNUP_KEY, null) ?: return null) ?: return null
        return runCatching {
            val payload = JSONObject(raw)
            PendingSignup(
                email = payload.getString("email"),
                consent = ConsentRecord.fromJson(payload.getJSONObject("consent")),
            )
        }.getOrNull()
    }

    fun clearPendingSignup() {
        preferences.edit().remove(PENDING_SIGNUP_KEY).apply()
    }

    /** Drops the platform session but keeps nothing else behind. */
    fun clearAccessToken() {
        preferences.edit()
            .remove(TOKEN_KEY)
            .remove(EXPIRY_KEY)
            .remove(USER_ID_KEY)
            .remove(PHONE_VERIFIED_KEY)
            .remove(MINIMUM_KYC_KEY)
            .apply()
    }

    fun clear() {
        clearAccessToken()
        clearPendingSignup()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String? = runCatching {
        val encrypted = Base64.decode(encoded, Base64.NO_WRAP)
        if (encrypted.size <= IV_LENGTH) {
            return@runCatching null
        }

        val iv = encrypted.copyOfRange(0, IV_LENGTH)
        val ciphertext = encrypted.copyOfRange(IV_LENGTH, encrypted.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
        cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
    }.getOrNull()

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEY_STORE = "AndroidKeyStore"
        const val KEY_ALIAS = "play_earn_session_key"
        const val TOKEN_KEY = "access_token"
        const val EXPIRY_KEY = "access_token_expires_at"
        const val USER_ID_KEY = "user_id"
        const val PHONE_VERIFIED_KEY = "phone_verified"
        const val MINIMUM_KYC_KEY = "minimum_kyc_verified"
        const val PENDING_SIGNUP_KEY = "pending_signup"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
        const val TAG_LENGTH_BITS = 128
    }
}
