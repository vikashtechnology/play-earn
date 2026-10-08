package com.zivora.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.zivora.app.ui.theme.RewardsTokens
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun CashWithdrawalScreen(
    accessToken: String,
    userId: String,
    onClose: () -> Unit,
) {
    var amountText by remember { mutableStateOf("") }
    var payoutType by remember { mutableStateOf("upi") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    val api = remember { AuthApi() }
    val scope = rememberCoroutineScope()
    val amount = amountText.toIntOrNull()

    Surface(modifier = Modifier.fillMaxSize(), color = RewardsTokens.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text("CASH WITHDRAWAL", style = MaterialTheme.typography.labelLarge, color = RewardsTokens.accent)
            Text("Request a payout", style = MaterialTheme.typography.headlineMedium, color = RewardsTokens.text)
            Text(
                "Your request will remain pending until the payout provider confirms it. KYC and account eligibility rules apply.",
                style = MaterialTheme.typography.bodyMedium,
                color = RewardsTokens.muted,
            )
            OutlinedTextField(
                value = amountText,
                onValueChange = { amountText = it.filter(Char::isDigit).take(7) },
                label = { Text("Amount (INR)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FilterChip(
                    selected = payoutType == "upi",
                    onClick = { payoutType = "upi" },
                    label = { Text("UPI") },
                )
                FilterChip(
                    selected = payoutType == "bank",
                    onClick = { payoutType = "bank" },
                    label = { Text("Bank") },
                )
            }
            Button(
                onClick = {
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        statusMessage = null
                        try {
                            val result = api.requestCashWithdrawal(
                                userId = userId,
                                amount = amount ?: 0,
                                payoutType = payoutType,
                                idempotencyKey = "withdraw_${UUID.randomUUID()}",
                                accessToken = accessToken,
                            )
                            statusMessage = "Request ${result.id} is ${result.status}. No payout is complete until provider confirmation."
                        } catch (error: AuthApiException) {
                            errorMessage = error.message
                        } catch (_: Exception) {
                            errorMessage = "Could not submit the request. Check your connection and try again."
                        } finally {
                            isLoading = false
                        }
                    }
                },
                enabled = amount != null && amount > 0 && !isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (isLoading) CircularProgressIndicator() else Text("Submit request")
            }
            if (!errorMessage.isNullOrBlank()) {
                Text(errorMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.danger)
            }
            if (!statusMessage.isNullOrBlank()) {
                Text(statusMessage.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.success)
            }
            Button(onClick = onClose, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) {
                Text("Close")
            }
        }
    }
}
