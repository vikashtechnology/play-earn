package com.zivora.app.auth

import org.json.JSONObject

/**
 * Consent captured on the device before Firebase creates the account.
 *
 * The API only accepts consent that matches the policy versions it published,
 * so the versions the user actually saw travel with the sign-up request.
 */
data class ConsentRecord(
    val fullName: String,
    val adultConfirmed: Boolean,
    val termsAccepted: Boolean,
    val privacyAccepted: Boolean,
    val termsVersion: String,
    val privacyVersion: String,
    val analyticsOptIn: Boolean,
    val personalizedOffersOptIn: Boolean,
) {
    val isComplete: Boolean
        get() = adultConfirmed && termsAccepted && privacyAccepted &&
            termsVersion.isNotBlank() && privacyVersion.isNotBlank()

    fun toJson(): JSONObject = JSONObject()
        .put("fullName", fullName)
        .put("adultConfirmed", adultConfirmed)
        .put("termsAccepted", termsAccepted)
        .put("privacyAccepted", privacyAccepted)
        .put("termsVersion", termsVersion)
        .put("privacyVersion", privacyVersion)
        .put("analyticsOptIn", analyticsOptIn)
        .put("personalizedOffersOptIn", personalizedOffersOptIn)

    companion object {
        fun fromJson(json: JSONObject): ConsentRecord = ConsentRecord(
            fullName = json.optString("fullName"),
            adultConfirmed = json.optBoolean("adultConfirmed"),
            termsAccepted = json.optBoolean("termsAccepted"),
            privacyAccepted = json.optBoolean("privacyAccepted"),
            termsVersion = json.optString("termsVersion"),
            privacyVersion = json.optString("privacyVersion"),
            analyticsOptIn = json.optBoolean("analyticsOptIn"),
            personalizedOffersOptIn = json.optBoolean("personalizedOffersOptIn"),
        )
    }
}
