package com.zivora.app.auth

import android.app.Activity
import com.google.firebase.FirebaseException
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.ActionCodeSettings
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.zivora.app.BuildConfig
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await

/** Raised for any Firebase Auth failure that the UI should show as a message. */
class FirebaseAuthClientException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** Result of starting a Firebase phone verification. */
sealed interface PhoneVerificationStart {
    /** A code was sent by SMS and must be entered by the user. */
    data class CodeSent(
        val verificationId: String,
        val resendToken: PhoneAuthProvider.ForceResendingToken?,
    ) : PhoneVerificationStart

    /** Firebase verified the number silently (instant verification). */
    data class AutoVerified(val credential: PhoneAuthCredential) : PhoneVerificationStart
}

/**
 * Thin coroutine wrapper over Firebase Auth.
 *
 * Firebase owns authentication: email link, Google, and phone OTP all happen
 * here. The platform API only ever receives the resulting short-lived Firebase
 * ID token, which it verifies against Google's published signing certificates.
 * No API key or provider secret lives in this app.
 */
class FirebaseAuthClient(private val auth: FirebaseAuth = FirebaseAuth.getInstance()) {

    val currentUser: FirebaseUser?
        get() = auth.currentUser

    val currentUid: String?
        get() = auth.currentUser?.uid

    fun isEmailSignInLink(link: String): Boolean =
        runCatching { auth.isSignInWithEmailLink(link) }.getOrDefault(false)

    fun hasVerifiedPhone(): Boolean = auth.currentUser?.providerData
        ?.any { it.providerId == PhoneAuthProvider.PROVIDER_ID } == true

    private fun emailActionCodeSettings(): ActionCodeSettings = ActionCodeSettings.newBuilder()
        .setUrl(BuildConfig.EMAIL_LINK_URL)
        .setHandleCodeInApp(true)
        .setAndroidPackageName(BuildConfig.APPLICATION_ID, true, null)
        .build()

    /** Sends the Firebase email sign-in link. Firebase delivers the email. */
    suspend fun sendEmailSignInLink(email: String) {
        runAuthCall("Firebase could not send the sign-in email") {
            auth.sendSignInLinkToEmail(email.trim(), emailActionCodeSettings()).await()
        }
    }

    suspend fun signInWithEmailLink(email: String, link: String): FirebaseUser =
        runAuthCall("This sign-in link is invalid or expired") {
            auth.signInWithEmailLink(email.trim(), link).await().requireUser()
        }

    /** Completes Google sign-in using the ID token from Credential Manager. */
    suspend fun signInWithGoogleIdToken(googleIdToken: String): FirebaseUser =
        runAuthCall("Google sign-in could not be completed") {
            auth.signInWithCredential(GoogleAuthProvider.getCredential(googleIdToken, null)).await().requireUser()
        }

    suspend fun startPhoneVerification(
        activity: Activity,
        phoneNumber: String,
        resendToken: PhoneAuthProvider.ForceResendingToken? = null,
        timeoutSeconds: Long = 60L,
    ): PhoneVerificationStart = suspendCancellableCoroutine { continuation ->
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
            override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                if (continuation.isActive) {
                    continuation.resume(PhoneVerificationStart.AutoVerified(credential))
                }
            }

            override fun onVerificationFailed(exception: FirebaseException) {
                if (continuation.isActive) {
                    continuation.resumeWithException(
                        FirebaseAuthClientException(describeAuthError(exception), exception),
                    )
                }
            }

            override fun onCodeSent(
                verificationId: String,
                token: PhoneAuthProvider.ForceResendingToken,
            ) {
                if (continuation.isActive) {
                    continuation.resume(PhoneVerificationStart.CodeSent(verificationId, token))
                }
            }
        }

        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .setActivity(activity)
            .apply { resendToken?.let { setForceResendingToken(it) } }
            .setCallbacks(callbacks)
            .build()

        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    fun phoneCredential(verificationId: String, code: String): PhoneAuthCredential =
        PhoneAuthProvider.getCredential(verificationId, code)

    /**
     * Attaches a verified phone number to the signed-in account. This is the
     * Minimum-KYC step required before a cash payout; the API confirms it with
     * the phone_number claim inside the next Firebase ID token.
     */
    suspend fun linkPhoneCredential(credential: PhoneAuthCredential): FirebaseUser =
        runAuthCall("That phone number is already linked to another account") {
            val user = auth.currentUser
                ?: throw FirebaseAuthClientException("Sign in again before verifying a phone number")
            user.linkWithCredential(credential).await().requireUser()
        }

    suspend fun signInWithPhoneCredential(credential: PhoneAuthCredential): FirebaseUser =
        runAuthCall("Phone sign-in could not be completed") {
            auth.signInWithCredential(credential).await().requireUser()
        }

    /**
     * Returns a fresh Firebase ID token for the API exchange.
     * Force a refresh after linking a phone number so the new claim is present.
     */
    suspend fun currentIdToken(forceRefresh: Boolean = false): String {
        val user = auth.currentUser
            ?: throw FirebaseAuthClientException("You are signed out. Please sign in again.")
        return runAuthCall("Your session could not be refreshed") {
            user.getIdToken(forceRefresh).await().token
                ?: throw FirebaseAuthClientException("Firebase did not return an ID token")
        }
    }

    fun signOut() {
        runCatching { auth.signOut() }
    }

    private suspend fun <T> runAuthCall(fallbackMessage: String, block: suspend () -> T): T {
        return try {
            block()
        } catch (error: FirebaseAuthClientException) {
            throw error
        } catch (error: Exception) {
            throw FirebaseAuthClientException(describeAuthError(error) ?: fallbackMessage, error)
        }
    }

    private fun AuthResult.requireUser(): FirebaseUser =
        user ?: throw FirebaseAuthClientException("Firebase did not return a signed-in user")
}

/** User-facing messages only: never surface raw Firebase error codes. */
fun describeAuthError(error: Throwable?): String? = when (error) {
    is FirebaseAuthClientException -> error.message
    is FirebaseAuthInvalidCredentialsException -> "That code is not valid or has expired. Request a new one."
    is FirebaseAuthInvalidUserException -> "This account is no longer available. Please sign in again."
    is FirebaseTooManyRequestsException -> "Too many attempts. Please wait a while and try again."
    is FirebaseNetworkException -> "Network problem. Check your connection and try again."
    is FirebaseException -> null
    else -> null
}
