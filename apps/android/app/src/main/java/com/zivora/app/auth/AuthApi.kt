package com.zivora.app.auth

import android.net.Uri
import com.zivora.app.BuildConfig
import com.zivora.app.DebugLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AuthApiException(
    val statusCode: Int,
    message: String,
    val code: String? = null,
) : Exception(message)

data class AuthPolicies(
    val firebaseSignInEnabled: Boolean,
    val googleSignInEnabled: Boolean,
    val phoneVerificationEnabled: Boolean,
    val allowedSignInProviders: List<String>,
    val minimumUserAge: Int,
    val termsUrl: String?,
    val privacyUrl: String?,
    val termsVersion: String?,
    val privacyVersion: String?,
) {
    val hasPublishedPolicies: Boolean
        get() = !termsUrl.isNullOrBlank() && !privacyUrl.isNullOrBlank() &&
            !termsVersion.isNullOrBlank() && !privacyVersion.isNullOrBlank()
}

data class UserSession(
    val accessToken: String,
    val expiresInSeconds: Int,
    val userId: String,
    val firebaseUid: String?,
    val email: String?,
    val fullName: String?,
    val phone: String?,
    val emailVerified: Boolean,
    val phoneVerified: Boolean,
    val minimumKycVerified: Boolean,
    val isNewAccount: Boolean,
)

data class OtpRequestResult(
    val expiresInSeconds: Int,
    val resendInSeconds: Int,
)

data class OtpVerificationResult(
    val accessToken: String,
    val expiresInSeconds: Int,
)

data class CashWithdrawalResult(
    val id: String,
    val status: String,
    val amount: Int,
    val payoutType: String,
)

/**
 * Talks to the Zivora API.
 *
 * Authentication is Firebase: the app signs in with Firebase, then exchanges the
 * Firebase ID token for a short-lived platform API session token. Firebase
 * tokens are sent only to this API over HTTPS and are never logged or stored.
 */
class AuthApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {

    suspend fun loadAuthPolicies(): AuthPolicies = withContext(Dispatchers.IO) {
        val response = get("/api/v1/auth/policies")
        AuthPolicies(
            firebaseSignInEnabled = response.optBoolean("firebaseSignInEnabled"),
            googleSignInEnabled = response.optBoolean("googleSignInEnabled"),
            phoneVerificationEnabled = response.optBoolean("phoneVerificationEnabled"),
            allowedSignInProviders = response.optJSONArray("allowedSignInProviders")
                ?.let { array -> (0 until array.length()).mapNotNull { array.optString(it) } }
                .orEmpty(),
            minimumUserAge = response.optInt("minimumUserAge", 18),
            termsUrl = response.optionalString("termsUrl"),
            privacyUrl = response.optionalString("privacyUrl"),
            termsVersion = response.optionalString("termsVersion"),
            privacyVersion = response.optionalString("privacyVersion"),
        )
    }

    /**
     * Exchanges a Firebase ID token for a platform session. [consent] is sent on
     * first sign-up only; returning users omit it and the API reuses the stored,
     * versioned consent.
     */
    suspend fun exchangeFirebaseSession(
        firebaseIdToken: String,
        consent: ConsentRecord? = null,
    ): UserSession = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("idToken", firebaseIdToken)
        consent?.let { payload.put("consent", it.toJson()) }
        parseUserSession(post("/api/v1/auth/firebase/session", payload))
    }

    /**
     * Confirms Minimum KYC for cash payouts. Firebase verified the phone on the
     * device; the API only trusts the phone_number claim in this ID token.
     */
    suspend fun verifyWithdrawalPhone(
        accessToken: String,
        firebaseIdToken: String,
        phone: String? = null,
    ): Boolean = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("idToken", firebaseIdToken)
        phone?.let { payload.put("phone", it) }
        post("/api/v1/auth/withdrawal/phone/verify", payload, accessToken).optBoolean("minimumKycVerified")
    }

    suspend fun revokeSession(accessToken: String): Unit = withContext(Dispatchers.IO) {
        post("/api/v1/auth/session/revoke", JSONObject(), accessToken)
        Unit
    }

    suspend fun requestCashWithdrawal(
        userId: String,
        amount: Int,
        payoutType: String,
        idempotencyKey: String,
        accessToken: String,
    ): CashWithdrawalResult = withContext(Dispatchers.IO) {
        val response = post(
            "/api/v1/payouts/${Uri.encode(userId)}",
            JSONObject()
                .put("amount", amount)
                .put("payoutType", payoutType)
                .put("idempotencyKey", idempotencyKey),
            accessToken,
        ).getJSONObject("payout")

        CashWithdrawalResult(
            id = response.getString("id"),
            status = response.getString("status"),
            amount = response.getInt("amount"),
            payoutType = response.getString("payoutType"),
        )
    }

    // Legacy self-hosted OTP fallback. Disabled on the API unless an SMS
    // provider and DLT templates are configured; Firebase phone auth is primary.
    suspend fun requestOtp(phone: String): OtpRequestResult = withContext(Dispatchers.IO) {
        val response = post("/api/v1/auth/otp/request", JSONObject().put("phone", phone))
        OtpRequestResult(
            expiresInSeconds = response.getInt("expiresInSeconds"),
            resendInSeconds = response.getInt("resendInSeconds"),
        )
    }

    suspend fun verifyOtp(phone: String, code: String): OtpVerificationResult = withContext(Dispatchers.IO) {
        val response = post("/api/v1/auth/otp/verify", JSONObject().put("phone", phone).put("code", code))
        OtpVerificationResult(
            accessToken = response.getString("accessToken"),
            expiresInSeconds = response.getInt("expiresInSeconds"),
        )
    }

    private fun parseUserSession(response: JSONObject): UserSession {
        val user = response.getJSONObject("user")
        return UserSession(
            accessToken = response.getString("accessToken"),
            expiresInSeconds = response.getInt("expiresInSeconds"),
            userId = user.getString("id"),
            firebaseUid = user.optionalString("firebaseUid"),
            email = user.optionalString("email"),
            fullName = user.optionalString("fullName"),
            phone = user.optionalString("phone"),
            emailVerified = user.optBoolean("emailVerified"),
            phoneVerified = user.optBoolean("phoneVerified"),
            minimumKycVerified = user.optBoolean("minimumKycVerified"),
            isNewAccount = response.optBoolean("isNewAccount"),
        )
    }

    private fun get(path: String, accessToken: String? = null): JSONObject {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.setRequestProperty("Accept", "application/json")
        accessToken?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        return readResponse(connection)
    }

    private fun post(path: String, payload: JSONObject, accessToken: String? = null): JSONObject {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.doOutput = true
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        accessToken?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

        try {
            connection.outputStream.use { output ->
                output.write(payload.toString().toByteArray(Charsets.UTF_8))
            }

            return readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    private fun readResponse(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = if (body.isBlank()) JSONObject() else JSONObject(body)

            if (status !in 200..299) {
                val code = response.optionalString("code")
                DebugLog.w("API ${connection.url} -> $status${code?.let { " code=$it" } ?: ""}")
                throw AuthApiException(
                    statusCode = status,
                    message = response.optString("error").ifBlank { defaultMessage(status) },
                    code = code,
                )
            }

            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun defaultMessage(status: Int): String = when (status) {
        401 -> "Please sign in again."
        403 -> "That action is not available for this account."
        409 -> "That email or phone number is already linked to another account."
        429 -> "Too many attempts. Please wait and try again."
        in 500..599 -> "The service is temporarily unavailable. Please try again later."
        else -> "Request failed. Please try again."
    }
}

private fun JSONObject.optionalString(key: String): String? =
    optString(key).takeUnless { it.isBlank() || it == "null" }
