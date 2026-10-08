package com.rewardsplatform.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class BalanceSummary(
    val availableCoins: Int,
    val pendingCoins: Int,
    val reservedCoins: Int,
    val reversedCoins: Int,
    val adMobInAppCoins: Int,
)

data class FeaturedItem(
    val id: String?,
    val title: String,
    val supporting: String,
    val kind: String,
    val rewardCoins: Int,
    // Install offers are handed to the Play Store only; nothing else may open
    // a third-party APK source.
    val installTarget: String?,
    val landingUrl: String?,
)

data class HomeOverview(
    val signedIn: Boolean,
    val balances: BalanceSummary,
    val featured: List<FeaturedItem>,
    val payoutNextAction: String?,
    val adMobCoinsRedeemableForCash: Boolean,
)

data class ProfileOverview(
    val signedIn: Boolean,
    val userId: String?,
    val email: String?,
    val fullName: String?,
    val phone: String?,
    val phoneVerified: Boolean,
    val minimumKycVerified: Boolean,
    val analyticsOptIn: Boolean,
    val personalizedOffersOptIn: Boolean,
    val consentRefreshRequired: Boolean,
    val referralCode: String?,
    val supportEmail: String?,
    val accountDeletionUrl: String?,
)

class MarketplaceApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    suspend fun loadHome(accessToken: String?): HomeOverview = withContext(Dispatchers.IO) {
        val response = get("/api/v1/home", accessToken)
        val balances = response.getJSONObject("balances")
        HomeOverview(
            signedIn = response.optBoolean("signedIn"),
            balances = BalanceSummary(
                availableCoins = balances.optInt("availableCoins"),
                pendingCoins = balances.optInt("pendingCoins"),
                reservedCoins = balances.optInt("reservedCoins"),
                reversedCoins = balances.optInt("reversedCoins"),
                adMobInAppCoins = balances.optInt("adMobInAppCoins"),
            ),
            featured = response.optJSONArray("featured").toFeaturedItems(),
            payoutNextAction = response.optJSONObject("payouts")?.optionalString("nextAction"),
            // AdMob coins are in-app-only and can never become cash.
            adMobCoinsRedeemableForCash = response.optBoolean("adMobCoinsRedeemableForCash", false),
        )
    }

    suspend fun loadProfile(accessToken: String?): ProfileOverview = withContext(Dispatchers.IO) {
        val response = get("/api/v1/profile", accessToken)
        val user = response.optJSONObject("user")
        val referral = response.optJSONObject("referral")
        val support = response.optJSONObject("support") ?: JSONObject()
        val preferences = response.optJSONObject("preferences") ?: JSONObject()
        val consent = response.optJSONObject("consent") ?: JSONObject()
        val deletion = response.optJSONObject("accountDeletion") ?: JSONObject()

        ProfileOverview(
            signedIn = response.optBoolean("signedIn"),
            userId = user?.optionalString("id"),
            email = user?.optionalString("email"),
            fullName = user?.optionalString("fullName"),
            phone = user?.optionalString("phone"),
            phoneVerified = user?.optBoolean("phoneVerified") == true,
            minimumKycVerified = user?.optBoolean("minimumKycVerified") == true,
            analyticsOptIn = preferences.optBoolean("analyticsOptIn"),
            personalizedOffersOptIn = preferences.optBoolean("personalizedOffersOptIn"),
            consentRefreshRequired = consent.optBoolean("refreshRequired"),
            referralCode = referral?.optionalString("code"),
            supportEmail = support.optionalString("email"),
            accountDeletionUrl = deletion.optionalString("url"),
        )
    }

    private fun get(path: String, accessToken: String?): JSONObject {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.setRequestProperty("Accept", "application/json")
        accessToken?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = if (body.isBlank()) JSONObject() else JSONObject(body)

            if (status !in 200..299) {
                throw IllegalStateException(response.optString("error", "Request failed."))
            }

            return response
        } finally {
            connection.disconnect()
        }
    }
}

private fun JSONObject?.optionalString(key: String): String? =
    this?.optString(key)?.takeUnless { it.isBlank() || it == "null" }

private fun JSONArray?.toFeaturedItems(): List<FeaturedItem> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { index ->
        optJSONObject(index)?.let { item ->
            FeaturedItem(
                id = item.optionalString("id"),
                title = item.optString("title"),
                supporting = item.optString("description"),
                kind = item.optString("kind"),
                rewardCoins = item.optInt("rewardCoins"),
                installTarget = item.optionalString("installTarget"),
                landingUrl = item.optionalString("landingUrl"),
            )
        }
    }
}
