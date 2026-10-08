package com.zivora.app.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.zivora.app.BuildConfig
import com.zivora.app.ui.theme.RewardsTokens
import java.security.SecureRandom
import kotlinx.coroutines.launch

/**
 * Firebase-backed sign-up and sign-in.
 *
 * Firebase performs the authentication (email link or Google). The resulting
 * Firebase ID token is exchanged with the Play & Earn API for a short-lived
 * platform session, and consent captured here is stored server-side in Neon
 * against the exact policy versions the user saw.
 */
@Composable
fun SignupScreen(
    incomingVerificationLink: Uri?,
    onVerificationLinkHandled: () -> Unit,
    onBack: () -> Unit,
    onVerified: (UserSession) -> Unit,
) {
    var authPolicies by remember { mutableStateOf<AuthPolicies?>(null) }
    var loadingPolicies by remember { mutableStateOf(true) }
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var linkEmail by remember { mutableStateOf("") }
    var linkSent by remember { mutableStateOf(false) }
    var waitingForLinkEmail by remember { mutableStateOf(false) }
    var adultConfirmed by remember { mutableStateOf(false) }
    var termsAccepted by remember { mutableStateOf(false) }
    var privacyAccepted by remember { mutableStateOf(false) }
    var analyticsOptIn by remember { mutableStateOf(false) }
    var personalizedOffersOptIn by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val api = remember { AuthApi() }
    val firebase = remember { FirebaseAuthClient() }
    val tokenStore = remember(context) { SessionTokenStore(context) }
    val credentialManager = remember(context) { CredentialManager.create(context) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            authPolicies = api.loadAuthPolicies()
        } catch (_: Exception) {
            errorMessage = "Sign-in options could not be loaded. Check your connection and try again."
        } finally {
            loadingPolicies = false
        }
    }

    // Completes an email sign-in when Firebase redirects the link back into the app.
    LaunchedEffect(incomingVerificationLink) {
        val link = incomingVerificationLink ?: return@LaunchedEffect
        val linkString = link.toString()

        if (!firebase.isEmailSignInLink(linkString)) {
            onVerificationLinkHandled()
            return@LaunchedEffect
        }

        val pending = tokenStore.readPendingSignup()
        if (pending == null) {
            // The link was opened on a fresh install or after data was cleared,
            // so the email used for the request has to be entered again.
            waitingForLinkEmail = true
            loading = false
            onVerificationLinkHandled()
            return@LaunchedEffect
        }

        loading = true
        errorMessage = null
        try {
            val session = completeEmailLinkSignIn(
                api = api,
                firebase = firebase,
                tokenStore = tokenStore,
                email = pending.email,
                link = linkString,
                consent = pending.consent,
            )
            onVerified(session)
        } catch (error: AuthApiException) {
            errorMessage = error.message
        } catch (error: FirebaseAuthClientException) {
            errorMessage = error.message
        } catch (_: Exception) {
            errorMessage = "This sign-in link is invalid or expired. Request a new email."
        } finally {
            loading = false
            onVerificationLinkHandled()
        }
    }

    val policies = authPolicies
    val legalReady = policies?.hasPublishedPolicies == true && policies.firebaseSignInEnabled
    val consentRecord = ConsentRecord(
        fullName = fullName.trim(),
        adultConfirmed = adultConfirmed,
        termsAccepted = termsAccepted,
        privacyAccepted = privacyAccepted,
        termsVersion = policies?.termsVersion.orEmpty(),
        privacyVersion = policies?.privacyVersion.orEmpty(),
        analyticsOptIn = analyticsOptIn,
        personalizedOffersOptIn = personalizedOffersOptIn,
    )
    val canSubmit = !loading && !loadingPolicies && legalReady && consentRecord.isComplete

    Surface(modifier = Modifier.fillMaxSize(), color = RewardsTokens.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onBack, enabled = !loading) { Text("Back") }
            Text("PLAY & EARN REAL CASH", style = MaterialTheme.typography.labelLarge, color = RewardsTokens.accent)
            Text(
                text = when {
                    waitingForLinkEmail -> "Finish signing in"
                    linkSent -> "Check your email"
                    else -> "Create your account"
                },
                style = MaterialTheme.typography.headlineMedium,
                color = RewardsTokens.text,
            )
            Text(
                text = "Sign in with Firebase using an email link or Google. Phone verification is requested separately before a cash withdrawal.",
                style = MaterialTheme.typography.bodyMedium,
                color = RewardsTokens.muted,
            )

            if (loadingPolicies) {
                CircularProgressIndicator()
            } else if (!legalReady) {
                Text(
                    text = "Sign-up is unavailable until Firebase Auth is configured and the approved Terms and Privacy Notice are published.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RewardsTokens.warning,
                )
            }

            if (waitingForLinkEmail) {
                OutlinedTextField(
                    value = linkEmail,
                    onValueChange = { linkEmail = it.trim().take(255) },
                    label = { Text("Email used for the sign-in link") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "Enter the same email address you requested the link with, then open the link again from that email.",
                    style = MaterialTheme.typography.bodySmall,
                    color = RewardsTokens.muted,
                )
                Button(
                    onClick = { waitingForLinkEmail = false; linkSent = false },
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Start again")
                }
            } else if (!linkSent) {
                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it.take(255) },
                    label = { Text("Full name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.trim().take(255) },
                    label = { Text("Email address") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                ConsentCheckbox(
                    checked = adultConfirmed,
                    onCheckedChange = { adultConfirmed = it },
                    label = "I confirm that I am ${policies?.minimumUserAge ?: 18} years of age or older.",
                )
                ConsentCheckbox(
                    checked = termsAccepted,
                    onCheckedChange = { termsAccepted = it },
                    label = "I agree to the Terms.",
                )
                policies?.termsUrl?.let { PolicyLink("Read Terms", it) }
                ConsentCheckbox(
                    checked = privacyAccepted,
                    onCheckedChange = { privacyAccepted = it },
                    label = "I have read the Privacy Notice.",
                )
                policies?.privacyUrl?.let { PolicyLink("Read Privacy Notice", it) }

                PreferenceSwitch(
                    title = "Product analytics",
                    checked = analyticsOptIn,
                    onCheckedChange = { analyticsOptIn = it },
                )
                PreferenceSwitch(
                    title = "Personalized partner offers",
                    checked = personalizedOffersOptIn,
                    onCheckedChange = { personalizedOffersOptIn = it },
                )

                Button(
                    onClick = {
                        scope.launch {
                            loading = true
                            errorMessage = null
                            statusMessage = null
                            try {
                                // Consent is stored locally first: the link may
                                // arrive after this process is gone.
                                tokenStore.savePendingSignup(PendingSignup(email.trim(), consentRecord))
                                firebase.sendEmailSignInLink(email)
                                linkSent = true
                                statusMessage = "Firebase sent a sign-in link to ${maskEmail(email)}. Open it on this device to finish creating your account."
                            } catch (error: FirebaseAuthClientException) {
                                errorMessage = error.message
                                tokenStore.clearPendingSignup()
                            } catch (_: Exception) {
                                errorMessage = "Could not send the sign-in email. Check your connection and try again."
                                tokenStore.clearPendingSignup()
                            } finally {
                                loading = false
                            }
                        }
                    },
                    enabled = canSubmit && fullName.isNotBlank() && email.contains('@'),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (loading) CircularProgressIndicator() else Text("Email me a sign-in link")
                }

                Button(
                    onClick = {
                        scope.launch {
                            loading = true
                            errorMessage = null
                            try {
                                val googleIdToken = requestGoogleIdToken(context, credentialManager)
                                firebase.signInWithGoogleIdToken(googleIdToken)
                                val firebaseIdToken = firebase.currentIdToken()
                                val session = api.exchangeFirebaseSession(
                                    firebaseIdToken = firebaseIdToken,
                                    consent = consentRecord,
                                )
                                tokenStore.clearPendingSignup()
                                tokenStore.saveAccessToken(
                                    token = session.accessToken,
                                    expiresInSeconds = session.expiresInSeconds,
                                    userId = session.userId,
                                    phoneVerified = session.phoneVerified,
                                    minimumKycVerified = session.minimumKycVerified,
                                )
                                onVerified(session)
                            } catch (error: AuthApiException) {
                                errorMessage = describeSessionError(error)
                            } catch (error: FirebaseAuthClientException) {
                                errorMessage = error.message
                            } catch (_: GetCredentialException) {
                                errorMessage = "Google sign-in was cancelled or unavailable."
                            } catch (_: Exception) {
                                errorMessage = "Google sign-in could not be completed. Try the email link instead."
                            } finally {
                                loading = false
                            }
                        }
                    },
                    enabled = canSubmit && policies?.googleSignInEnabled == true
                        && BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() && !loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Continue with Google")
                }
            } else {
                Text(
                    text = "Sign-in link sent to ${maskEmail(email)}. It expires in a few minutes and can be used once.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RewardsTokens.muted,
                )
                Text(
                    text = "Open the link in the email on this device. The app finishes sign-in automatically and then creates your wallet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = RewardsTokens.muted,
                )
                TextButton(
                    onClick = {
                        linkSent = false
                        tokenStore.clearPendingSignup()
                    },
                    enabled = !loading,
                ) {
                    Text("Use a different email")
                }
            }

            if (!statusMessage.isNullOrBlank()) {
                Text(statusMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.success)
            }
            if (!errorMessage.isNullOrBlank()) {
                Text(errorMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.danger)
            }
        }
    }
}

private suspend fun completeEmailLinkSignIn(
    api: AuthApi,
    firebase: FirebaseAuthClient,
    tokenStore: SessionTokenStore,
    email: String,
    link: String,
    consent: ConsentRecord,
): UserSession {
    firebase.signInWithEmailLink(email, link)
    val firebaseIdToken = firebase.currentIdToken()
    val session = api.exchangeFirebaseSession(
        firebaseIdToken = firebaseIdToken,
        // Returning accounts ignore consent; new accounts are created with it.
        consent = if (consent.isComplete) consent else null,
    )

    tokenStore.clearPendingSignup()
    tokenStore.saveAccessToken(
        token = session.accessToken,
        expiresInSeconds = session.expiresInSeconds,
        userId = session.userId,
        phoneVerified = session.phoneVerified,
        minimumKycVerified = session.minimumKycVerified,
    )
    return session
}

private suspend fun requestGoogleIdToken(
    context: Context,
    credentialManager: CredentialManager,
): String {
    val nonce = ByteArray(32).also { SecureRandom().nextBytes(it) }
        .joinToString("") { "%02x".format(it) }

    val googleOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false)
        .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
        .setNonce(nonce)
        .setAutoSelectEnabled(false)
        .build()
    val request = GetCredentialRequest.Builder()
        .addCredentialOption(googleOption)
        .build()

    val response = credentialManager.getCredential(context, request)
    val credential = response.credential as? CustomCredential
        ?: throw IllegalStateException("Google did not return an ID token")
    if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        throw IllegalStateException("Google did not return an ID token")
    }

    return GoogleIdTokenCredential.createFrom(credential.data).idToken
}

private fun describeSessionError(error: AuthApiException): String = when (error.code) {
    "consent_required", "stale_policy_version" ->
        "Please review and accept the current Terms and Privacy Notice, then sign in again."
    "account_conflict" -> error.message
    "unsupported_sign_in_provider" -> error.message
    "identity_rate_limited" -> error.message
    "firebase_unavailable", "firebase_sign_in_disabled" ->
        "Sign-in is temporarily unavailable. Please try again later."
    else -> error.message
}

private fun maskEmail(email: String): String =
    email.replace(Regex("^(.).+(@.+)$"), "$1***$2")

@Composable
private fun ConsentCheckbox(checked: Boolean, onCheckedChange: (Boolean) -> Unit, label: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(
            text = label,
            modifier = Modifier.weight(1f).padding(top = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = RewardsTokens.text,
        )
    }
}

@Composable
private fun PreferenceSwitch(title: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.text)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun PolicyLink(label: String, url: String) {
    val context = LocalContext.current
    TextButton(onClick = {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }) {
        Text(label)
    }
}
