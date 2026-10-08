package com.zivora.app.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthProvider
import com.zivora.app.ui.theme.RewardsTokens
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val CODE_EXPIRY_SECONDS = 60
private const val RESEND_COOLDOWN_SECONDS = 45

/**
 * Firebase phone verification for cash payout Minimum KYC.
 *
 * Firebase runs the OTP challenge on the device. The verified phone number is
 * then linked to the signed-in Firebase account, and the API confirms Minimum
 * KYC from the phone_number claim inside a freshly refreshed Firebase ID token.
 */
@Composable
fun PhoneVerificationScreen(
    accessToken: String,
    onBack: () -> Unit,
    onVerified: () -> Unit,
) {
    var phoneDigits by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var verificationId by remember { mutableStateOf<String?>(null) }
    var resendToken by remember { mutableStateOf<PhoneAuthProvider.ForceResendingToken?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var resendInSeconds by remember { mutableIntStateOf(0) }
    var expiresInSeconds by remember { mutableIntStateOf(0) }

    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val api = remember { AuthApi() }
    val firebase = remember { FirebaseAuthClient() }
    val tokenStore = remember(context) { SessionTokenStore(context) }
    val scope = rememberCoroutineScope()

    val phoneNumber = "+91$phoneDigits"

    suspend fun completeVerification(credential: PhoneAuthCredential, phone: String) {
        if (!firebase.hasVerifiedPhone()) {
            firebase.linkPhoneCredential(credential)
        }

        // Force a refresh so the phone_number claim is present for the API.
        val firebaseIdToken = firebase.currentIdToken(forceRefresh = true)
        val verified = api.verifyWithdrawalPhone(
            accessToken = accessToken,
            firebaseIdToken = firebaseIdToken,
            phone = phone,
        )

        if (!verified) {
            throw IllegalStateException("Phone verification was not confirmed by the server")
        }

        tokenStore.markMinimumKycVerified()
    }

    LaunchedEffect(resendInSeconds, expiresInSeconds) {
        if (resendInSeconds > 0 || expiresInSeconds > 0) {
            delay(1_000)
            if (resendInSeconds > 0) resendInSeconds -= 1
            if (expiresInSeconds > 0) expiresInSeconds -= 1
        }
    }

    fun requestCode(forceResend: Boolean = false) {
        val currentActivity = activity
        if (currentActivity == null) {
            errorMessage = "Phone verification needs the app in the foreground. Try again."
            return
        }

        scope.launch {
            isLoading = true
            errorMessage = null
            statusMessage = null
            try {
                val result = firebase.startPhoneVerification(
                    activity = currentActivity,
                    phoneNumber = phoneNumber,
                    resendToken = if (forceResend) resendToken else null,
                )

                when (result) {
                    is PhoneVerificationStart.CodeSent -> {
                        verificationId = result.verificationId
                        resendToken = result.resendToken
                        code = ""
                        expiresInSeconds = CODE_EXPIRY_SECONDS
                        resendInSeconds = RESEND_COOLDOWN_SECONDS
                        statusMessage = "Firebase sent a code to $phoneNumber. Never share it with anyone."
                    }

                    is PhoneVerificationStart.AutoVerified -> {
                        completeVerification(result.credential, phoneNumber)
                        onVerified()
                    }
                }
            } catch (error: AuthApiException) {
                errorMessage = error.message
            } catch (error: FirebaseAuthClientException) {
                errorMessage = error.message
            } catch (_: Exception) {
                errorMessage = "Phone verification could not be completed. Please try again."
            } finally {
                isLoading = false
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = RewardsTokens.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            TextButton(onClick = onBack, enabled = !isLoading) { Text("Back") }
            Text("MINIMUM KYC", style = MaterialTheme.typography.labelLarge, color = RewardsTokens.accent)
            Text(
                text = if (verificationId == null) "Verify your phone number" else "Enter the code",
                style = MaterialTheme.typography.headlineMedium,
                color = RewardsTokens.text,
            )
            Text(
                text = "Cash payouts require a phone number verified by Firebase. This is the Minimum KYC step; full KYC is collected before larger payouts.",
                style = MaterialTheme.typography.bodyMedium,
                color = RewardsTokens.muted,
            )

            if (verificationId == null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = "+91",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Country") },
                        modifier = Modifier.weight(0.3f),
                    )
                    OutlinedTextField(
                        value = phoneDigits,
                        onValueChange = { value -> phoneDigits = value.filter(Char::isDigit).take(10) },
                        label = { Text("Mobile number") },
                        supportingText = { Text("Indian mobile number") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                        modifier = Modifier.weight(0.7f),
                    )
                }
                Button(
                    onClick = { requestCode(forceResend = false) },
                    enabled = phoneDigits.length == 10 && !isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (isLoading) CircularProgressIndicator() else Text("Send code")
                }
            } else {
                Text(
                    text = "Code sent to $phoneNumber",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RewardsTokens.muted,
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { value -> code = value.filter(Char::isDigit).take(6) },
                    label = { Text("6-digit code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        val currentVerificationId = verificationId
                        if (currentVerificationId == null) {
                            errorMessage = "Request a new code first."
                            return@Button
                        }

                        scope.launch {
                            isLoading = true
                            errorMessage = null
                            statusMessage = null
                            try {
                                val credential = firebase.phoneCredential(currentVerificationId, code)
                                completeVerification(credential, phoneNumber)
                                onVerified()
                            } catch (error: AuthApiException) {
                                errorMessage = error.message
                            } catch (error: FirebaseAuthClientException) {
                                errorMessage = error.message
                            } catch (_: Exception) {
                                errorMessage = "The code is invalid or expired. Request a new one."
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    enabled = code.length == 6 && !isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (isLoading) CircularProgressIndicator() else Text("Verify number")
                }
                TextButton(
                    onClick = { requestCode(forceResend = true) },
                    enabled = resendInSeconds == 0 && !isLoading,
                ) {
                    Text(if (resendInSeconds > 0) "Resend in ${resendInSeconds}s" else "Resend code")
                }
                TextButton(
                    onClick = {
                        verificationId = null
                        resendToken = null
                        code = ""
                        expiresInSeconds = 0
                        resendInSeconds = 0
                    },
                    enabled = !isLoading,
                ) {
                    Text("Change number")
                }
                if (expiresInSeconds > 0) {
                    Text(
                        text = "Code expires in ${expiresInSeconds}s",
                        style = MaterialTheme.typography.bodySmall,
                        color = RewardsTokens.muted,
                    )
                }
            }

            if (!statusMessage.isNullOrBlank()) {
                Text(statusMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.success)
            }
            if (!errorMessage.isNullOrBlank()) {
                Text(errorMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.danger)
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
