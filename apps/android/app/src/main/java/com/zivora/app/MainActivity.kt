package com.zivora.app

import android.os.Bundle
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.zivora.app.auth.AuthApi
import com.zivora.app.auth.CashWithdrawalScreen
import com.zivora.app.auth.FirebaseAuthClient
import com.zivora.app.auth.PhoneVerificationScreen
import com.zivora.app.auth.SessionTokenStore
import com.zivora.app.auth.SignupScreen
import com.zivora.app.auth.UserSession
import com.zivora.app.ui.theme.RewardsMarketplaceTheme
import com.zivora.app.ui.theme.RewardsTokens
import kotlinx.coroutines.launch

private enum class MarketplaceTab(val title: String) {
    Home("Home"),
    Earn("Earn"),
    Rewards("Rewards"),
    Wallet("Wallet"),
    Profile("Profile"),
}

/** The platform API session currently held by the app. */
private data class SessionState(
    val accessToken: String,
    val userId: String,
    val minimumKycVerified: Boolean,
)

class MainActivity : ComponentActivity() {
    private val incomingVerificationLink = mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The most common device-testing mistake is a wrong base URL: a phone
        // cannot use localhost, and 10.0.2.2 only means anything to an emulator.
        DebugLog.d("API_BASE_URL=${BuildConfig.API_BASE_URL} package=$packageName debug=${BuildConfig.DEBUG}")
        incomingVerificationLink.value = intent?.data
        enableEdgeToEdge()
        setContent {
            RewardsMarketplaceTheme {
                MarketplaceApp(
                    incomingVerificationLink = incomingVerificationLink.value,
                    onVerificationLinkHandled = { incomingVerificationLink.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        incomingVerificationLink.value = intent.data
    }
}

@Composable
private fun MarketplaceApp(
    incomingVerificationLink: Uri?,
    onVerificationLinkHandled: () -> Unit,
) {
    val context = LocalContext.current
    val tokenStore = remember(context) { SessionTokenStore(context) }
    val authApi = remember { AuthApi() }
    val firebase = remember { FirebaseAuthClient() }
    val scope = rememberCoroutineScope()
    var selectedTabName by rememberSaveable { mutableStateOf(MarketplaceTab.Home.name) }
    var ageConfirmed by rememberSaveable { mutableStateOf(false) }
    var showSignIn by rememberSaveable { mutableStateOf(false) }
    var showWithdrawalPhoneVerification by rememberSaveable { mutableStateOf(false) }
    var showCashWithdrawal by rememberSaveable { mutableStateOf(false) }
    var showConsentPreferences by rememberSaveable { mutableStateOf(false) }
    var analyticsOptIn by rememberSaveable { mutableStateOf(false) }
    var partnerPersonalizationOptIn by rememberSaveable { mutableStateOf(false) }
    var showPolicyNotice by rememberSaveable { mutableStateOf(false) }
    // Firebase owns the long-lived identity; the platform API session is short.
    var session by remember { mutableStateOf(readStoredSession(tokenStore)) }
    val selectedTab = MarketplaceTab.valueOf(selectedTabName)

    LaunchedEffect(Unit) {
        session = ensureSession(authApi, firebase, tokenStore)
    }

    fun applySession(newSession: UserSession) {
        session = SessionState(
            accessToken = newSession.accessToken,
            userId = newSession.userId,
            minimumKycVerified = newSession.minimumKycVerified,
        )
    }

    fun refreshSession(forceRefresh: Boolean = false) {
        scope.launch {
            session = ensureSession(authApi, firebase, tokenStore, forceRefresh)
        }
    }

    fun signOut() {
        scope.launch {
            session?.accessToken?.let { runCatching { authApi.revokeSession(it) } }
            firebase.signOut()
            tokenStore.clear()
            session = null
        }
    }

    if (!ageConfirmed && incomingVerificationLink == null) {
        AgeGateScreen(onContinueAsGuest = { ageConfirmed = true })
        return
    }

    if (showSignIn || incomingVerificationLink != null) {
        SignupScreen(
            incomingVerificationLink = incomingVerificationLink,
            onVerificationLinkHandled = onVerificationLinkHandled,
            onBack = { showSignIn = false },
            onVerified = { newSession ->
                applySession(newSession)
                showSignIn = false
                ageConfirmed = true
            },
        )
        return
    }

    if (showWithdrawalPhoneVerification) {
        val accessToken = session?.accessToken
        if (accessToken == null) {
            showWithdrawalPhoneVerification = false
            showSignIn = true
            return
        }
        PhoneVerificationScreen(
            accessToken = accessToken,
            onBack = { showWithdrawalPhoneVerification = false },
            onVerified = {
                showWithdrawalPhoneVerification = false
                showCashWithdrawal = true
                // Re-exchange the Firebase token so the new phone claim and the
                // Minimum-KYC flag reach the stored session.
                refreshSession(forceRefresh = true)
            },
        )
        return
    }

    if (showCashWithdrawal) {
        val accessToken = session?.accessToken
        val userId = session?.userId
        if (accessToken == null || userId.isNullOrBlank()) {
            showCashWithdrawal = false
            showSignIn = true
            return
        }
        CashWithdrawalScreen(
            accessToken = accessToken,
            userId = userId,
            onClose = { showCashWithdrawal = false },
        )
        return
    }

    if (showConsentPreferences) {
        ConsentPreferencesScreen(
            analyticsOptIn = analyticsOptIn,
            onAnalyticsOptInChange = { analyticsOptIn = it },
            partnerPersonalizationOptIn = partnerPersonalizationOptIn,
            onPartnerPersonalizationChange = { partnerPersonalizationOptIn = it },
            onPolicyClick = { showPolicyNotice = true },
            onBack = { showConsentPreferences = false },
        )
        if (showPolicyNotice) {
            AlertDialog(
                onDismissRequest = { showPolicyNotice = false },
                title = { Text("Policies") },
                text = {
                    Text("Terms and Privacy Notice links are shown during account creation and on the profile screen. Consent choices are stored server-side with the policy version you accepted.")
                },
                confirmButton = {
                    TextButton(onClick = { showPolicyNotice = false }) { Text("Close") }
                },
            )
        }
        return
    }

    Surface(modifier = Modifier.fillMaxSize(), color = RewardsTokens.background) {
        androidx.compose.material3.Scaffold(
            modifier = Modifier.systemBarsPadding(),
            containerColor = RewardsTokens.background,
            bottomBar = {
                NavigationBar(containerColor = RewardsTokens.surface) {
                    MarketplaceTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = selectedTab == tab,
                            onClick = { selectedTabName = tab.name },
                            icon = {},
                            label = { Text(tab.title) },
                        )
                    }
                }
            },
        ) { contentPadding ->
            when (selectedTab) {
                MarketplaceTab.Home -> HomeScreen(
                    modifier = Modifier.padding(contentPadding),
                    session = session,
                    onSignInClick = { showSignIn = true },
                )
                MarketplaceTab.Earn -> EarnScreen(Modifier.padding(contentPadding))
                MarketplaceTab.Rewards -> RewardsScreen(
                    modifier = Modifier.padding(contentPadding),
                    minimumKycVerified = session?.minimumKycVerified == true,
                    onCashPayoutClick = {
                        when {
                            session == null -> showSignIn = true
                            session?.minimumKycVerified == true -> showCashWithdrawal = true
                            else -> showWithdrawalPhoneVerification = true
                        }
                    },
                )
                MarketplaceTab.Wallet -> WalletScreen(
                    modifier = Modifier.padding(contentPadding),
                    session = session,
                )
                MarketplaceTab.Profile -> ProfileScreen(
                    modifier = Modifier.padding(contentPadding),
                    session = session,
                    onConsentClick = { showConsentPreferences = true },
                    onSignInClick = { showSignIn = true },
                    onSignOut = { signOut() },
                    onVerifyPhoneClick = { showWithdrawalPhoneVerification = true },
                )
            }
        }
    }
}

private fun readStoredSession(tokenStore: SessionTokenStore): SessionState? {
    val accessToken = tokenStore.readAccessToken() ?: return null
    val userId = tokenStore.readUserId() ?: return null

    return SessionState(
        accessToken = accessToken,
        userId = userId,
        minimumKycVerified = tokenStore.isMinimumKycVerified(),
    )
}

/**
 * Returns a usable platform session. Firebase keeps users signed in across
 * launches, so a missing or expired API token is re-exchanged silently with the
 * current Firebase ID token. Nothing is stored beyond the encrypted API token.
 */
private suspend fun ensureSession(
    api: AuthApi,
    firebase: FirebaseAuthClient,
    tokenStore: SessionTokenStore,
    forceRefresh: Boolean = false,
): SessionState? {
    if (!forceRefresh) {
        readStoredSession(tokenStore)?.let { return it }
    }

    if (firebase.currentUser == null) {
        return readStoredSession(tokenStore)
    }

    return runCatching {
        val firebaseIdToken = firebase.currentIdToken(forceRefresh = forceRefresh)
        val session = api.exchangeFirebaseSession(firebaseIdToken = firebaseIdToken, consent = null)
        tokenStore.saveAccessToken(
            token = session.accessToken,
            expiresInSeconds = session.expiresInSeconds,
            userId = session.userId,
            phoneVerified = session.phoneVerified,
            minimumKycVerified = session.minimumKycVerified,
        )
        SessionState(
            accessToken = session.accessToken,
            userId = session.userId,
            minimumKycVerified = session.minimumKycVerified,
        )
    }.getOrNull() ?: readStoredSession(tokenStore)
}

@Composable
private fun AgeGateScreen(onContinueAsGuest: () -> Unit) {
    var isAdult by rememberSaveable { mutableStateOf(false) }
    var showMinorNotice by rememberSaveable { mutableStateOf(false) }

    ScreenColumn {
        ScreenTitle(
            eyebrow = "Zivora",
            title = "A rewards marketplace, built around verified activity.",
            supporting = "Browse as a guest. Cash payout availability depends on eligibility and verification; earnings are not guaranteed.",
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(RewardsTokens.spacingSmall),
        ) {
            Checkbox(checked = isAdult, onCheckedChange = { isAdult = it })
            Text(
                text = "I confirm that I am 18 years of age or older.",
                modifier = Modifier.weight(1f).padding(top = RewardsTokens.spacingMedium),
                style = MaterialTheme.typography.bodyLarge,
                color = RewardsTokens.text,
            )
        }
        Button(
            onClick = onContinueAsGuest,
            enabled = isAdult,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Explore as guest")
        }
        TextButton(onClick = {
            isAdult = false
            showMinorNotice = true
        }) {
            Text("I am under 18")
        }
        Text(
            text = "Guest browsing does not create an account. Creating an account requires Firebase sign-in plus acceptance of the published Terms and Privacy Notice, which are recorded server-side with their versions.",
            style = MaterialTheme.typography.bodySmall,
            color = RewardsTokens.muted,
        )
    }

    if (showMinorNotice) {
        AlertDialog(
            onDismissRequest = { showMinorNotice = false },
            title = { Text("Account setup unavailable") },
            text = { Text("Verified parental consent is not available yet, so users under 18 cannot continue.") },
            confirmButton = {
                TextButton(onClick = { showMinorNotice = false }) { Text("Close") }
            },
        )
    }
}

@Composable
private fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = RewardsTokens.spacingLarge, vertical = RewardsTokens.spacingLarge),
        verticalArrangement = Arrangement.spacedBy(RewardsTokens.spacingLarge),
        content = content,
    )
}

@Composable
private fun ScreenTitle(eyebrow: String, title: String, supporting: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(RewardsTokens.spacingSmall)) {
        Text(
            text = eyebrow.uppercase(),
            style = MaterialTheme.typography.labelLarge,
            color = RewardsTokens.accent,
        )
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = RewardsTokens.text,
        )
        if (supporting != null) {
            Text(
                text = supporting,
                style = MaterialTheme.typography.bodyMedium,
                color = RewardsTokens.muted,
            )
        }
    }
}

@Composable
private fun BalancePanel(
    title: String,
    note: String,
    modifier: Modifier = Modifier,
    value: String = "--",
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(RewardsTokens.cardRadius),
        colors = CardDefaults.cardColors(containerColor = RewardsTokens.surface),
        border = BorderStroke(1.dp, RewardsTokens.border),
    ) {
        Column(
            modifier = Modifier.padding(RewardsTokens.spacingLarge),
            verticalArrangement = Arrangement.spacedBy(RewardsTokens.spacingSmall),
        ) {
            Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, color = RewardsTokens.muted)
            Text(value, style = MaterialTheme.typography.headlineMedium, color = RewardsTokens.primary)
            Text(note, style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.muted)
        }
    }
}

@Composable
private const val PLAY_STORE_PREFIX = "https://play.google.com/"

// Opens an approved install offer in the Play Store app, falling back to the
// browser when the store app is unavailable. Any other URL shape is ignored so
// the client can never be pointed at a third-party APK source.
private fun openPlayStoreListing(context: Context, url: String) {
    if (!url.startsWith(PLAY_STORE_PREFIX)) return

    val uri = Uri.parse(url)
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending"))
    } catch (_: Exception) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            // No handler on this device; the row stays informational.
        }
    }
}

private fun FeaturedItem.playStoreUrl(): String? {
    if (installTarget != "google_play") return null
    val url = landingUrl ?: return null
    return if (url.startsWith(PLAY_STORE_PREFIX)) url else null
}

private fun LinkRow(title: String, supporting: String, onClick: () -> Unit = {}) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = RewardsTokens.spacingSmall),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = RewardsTokens.text)
        Text(supporting, style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.muted)
    }
}

@Composable
private fun HomeScreen(
    modifier: Modifier = Modifier,
    session: SessionState?,
    onSignInClick: () -> Unit,
) {
    val context = LocalContext.current
    val api = remember { MarketplaceApi() }
    var overview by remember { mutableStateOf<HomeOverview?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.accessToken) {
        isLoading = true
        loadError = null
        try {
            overview = api.loadHome(session?.accessToken)
        } catch (error: Exception) {
            DebugLog.w("home load failed against ${BuildConfig.API_BASE_URL}", error)
            overview = null
            loadError = "Live marketplace data could not be loaded. Check your connection and reopen the tab."
        } finally {
            isLoading = false
        }
    }

    val balances = overview?.balances

    ScreenColumn(modifier) {
        ScreenTitle(
            eyebrow = "Zivora",
            title = "Rewards beyond the offerwall.",
            supporting = "Discover verified offers, surveys, check-ins, and brand rewards. Cash payout availability depends on eligibility and verification.",
        )

        if (isLoading) {
            CircularProgressIndicator()
        }
        if (loadError != null) {
            Text(loadError.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.warning)
        }

        BalancePanel(
            title = "Available coins",
            value = balances?.availableCoins?.toString() ?: "--",
            note = if (overview?.signedIn == true) {
                "Cleared for eligible redemption. Pending rewards are listed separately."
            } else {
                "Sign in to view your live balance."
            },
        )

        if (overview?.signedIn == true && balances != null) {
            BalancePanel(
                title = "Pending coins",
                value = balances.pendingCoins.toString(),
                note = "Partner activity is verified before coins become available.",
            )
            BalancePanel(
                title = "In-app ad coins",
                value = balances.adMobInAppCoins.toString(),
                note = "AdMob rewards are for in-app use only and cannot be redeemed for cash or gift cards.",
            )
            if (overview.payoutNextAction == "verify_phone") {
                LinkRow(
                    "Verify your phone for cash payouts",
                    "Firebase phone verification (Minimum KYC) is required before a cash withdrawal.",
                )
            }
        } else {
            Button(onClick = onSignInClick, modifier = Modifier.fillMaxWidth()) {
                Text("Sign in with Firebase")
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(RewardsTokens.spacingMedium)) {
            Text("Explore the marketplace", style = MaterialTheme.typography.titleLarge, color = RewardsTokens.text)
            if (overview?.featured.isNullOrEmpty()) {
                LinkRow("Surveys and activities", "Browse partner tasks with clear reward conditions.")
                LinkRow("Brand rewards", "Discover promotions and product offers from brands.")
                LinkRow("Products and vouchers", "Explore rewards available in the catalog.")
            } else {
                overview?.featured?.forEach { item ->
                    val playStoreUrl = item.playStoreUrl()
                    if (playStoreUrl != null) {
                        LinkRow(
                            title = item.title,
                            supporting = "${item.supporting} • ${item.rewardCoins} coins • Opens in Google Play",
                            onClick = { openPlayStoreListing(context, playStoreUrl) },
                        )
                    } else {
                        LinkRow(item.title, "${item.supporting} • ${item.rewardCoins} coins")
                    }
                }
            }
        }
    }
}

@Composable
private fun EarnScreen(modifier: Modifier = Modifier) {
    ScreenColumn(modifier) {
        ScreenTitle("Earn", "Choose how to take part", "Reward amounts and availability vary by campaign and eligibility.")
        LinkRow("Surveys", "Share feedback through participating research partners.")
        LinkRow("Daily check-in", "Check in when this activity is available.")
        LinkRow("Brand activities", "Explore sponsored tasks and promotions.")
        LinkRow("Partner offers", "Review the terms and verification steps before starting.")
        LinkRow("App offers", "Install offers open only through a Google Play Store listing.")
        BalancePanel(
            title = "Watch video for in-app coins",
            note = "Ad rewards are for in-app use only and cannot be redeemed for cash or gift cards.",
        )
    }
}

@Composable
private fun RewardsScreen(
    modifier: Modifier = Modifier,
    minimumKycVerified: Boolean,
    onCashPayoutClick: () -> Unit,
) {
    ScreenColumn(modifier) {
        ScreenTitle("Rewards", "Browse the catalog", "Catalog items and redemption terms depend on availability.")
        LinkRow("Gift cards and vouchers", "Redeem eligible rewards through an approved provider.")
        LinkRow("Products", "Some products may support a coin and cash co-pay.")
        LinkRow(
            "Cash payout",
            if (minimumKycVerified) {
                "Phone verified with Firebase. Additional eligibility and payout setup may apply."
            } else {
                "Verify your phone with a Firebase OTP (Minimum KYC) before requesting a cash payout."
            },
            onCashPayoutClick,
        )
    }
}

@Composable
private fun WalletScreen(
    modifier: Modifier = Modifier,
    session: SessionState?,
) {
    val api = remember { MarketplaceApi() }
    var overview by remember { mutableStateOf<HomeOverview?>(null) }

    LaunchedEffect(session?.accessToken) {
        overview = runCatching { api.loadHome(session?.accessToken) }.getOrNull()
    }

    val balances = overview?.balances
    val signedIn = overview?.signedIn == true

    ScreenColumn(modifier) {
        ScreenTitle("Wallet", "Your coin activity", "Coins are rewards, not money held in an INR wallet.")
        BalancePanel(
            title = "Available",
            value = balances?.availableCoins?.toString() ?: "--",
            note = if (signedIn) "Coins cleared for eligible redemption." else "Sign in to see coins cleared for eligible redemption.",
        )
        BalancePanel(
            title = "Pending",
            value = balances?.pendingCoins?.toString() ?: "--",
            note = "Partner activity is verified before coins become available.",
        )
        BalancePanel(
            title = "Reserved",
            value = balances?.reservedCoins?.toString() ?: "--",
            note = "Coins held by a checkout or redemption are shown separately.",
        )
        BalancePanel(
            title = "Reversed",
            value = balances?.reversedCoins?.toString() ?: "--",
            note = "Rewards rolled back after a provider reversal or fraud review.",
        )
        BalancePanel(
            title = "In-app ad coins",
            value = balances?.adMobInAppCoins?.toString() ?: "--",
            note = "AdMob coins are restricted to in-app use and are excluded from cash redemption.",
        )
        Text(
            text = if (signedIn) {
                "Ledger history arrives with the append-only coin ledger milestone."
            } else {
                "Sign in to see your balances."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = RewardsTokens.muted,
        )
    }
}

@Composable
private fun ProfileScreen(
    modifier: Modifier = Modifier,
    session: SessionState?,
    onConsentClick: () -> Unit,
    onSignInClick: () -> Unit,
    onSignOut: () -> Unit,
    onVerifyPhoneClick: () -> Unit,
) {
    val api = remember { MarketplaceApi() }
    var profile by remember { mutableStateOf<ProfileOverview?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.accessToken) {
        loadError = null
        try {
            profile = api.loadProfile(session?.accessToken)
        } catch (error: Exception) {
            DebugLog.w("profile load failed against ${BuildConfig.API_BASE_URL}", error)
            profile = null
            loadError = "Profile data could not be loaded. Check your connection and reopen the tab."
        }
    }

    ScreenColumn(modifier) {
        ScreenTitle(
            "Profile",
            profile?.fullName ?: "Your account",
            if (profile?.signedIn == true) {
                "Signed in with Firebase. Your wallet and consent records are stored in Neon."
            } else {
                "Sign in to manage your profile, consent, and payout verification."
            },
        )

        if (loadError != null) {
            Text(loadError.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = RewardsTokens.warning)
        }

        if (profile?.signedIn == true) {
            profile.email?.let { LinkRow("Email", it) }
            profile.phone?.let { LinkRow("Phone", it) }
            LinkRow(
                if (profile.minimumKycVerified) "Minimum KYC verified" else "Minimum KYC not verified",
                if (profile.minimumKycVerified) {
                    "Your phone number is verified for cash payouts."
                } else {
                    "Verify your phone with a Firebase OTP before requesting a cash payout."
                },
                onClick = { if (!profile.minimumKycVerified) onVerifyPhoneClick() },
            )
            profile.referralCode?.let {
                LinkRow("Referral code", "$it — referral rewards are not live yet.")
            }
            if (profile.consentRefreshRequired) {
                LinkRow(
                    "Review updated policies",
                    "Our Terms or Privacy Notice changed since you accepted. Re-accept to keep your account in good standing.",
                    onConsentClick,
                )
            }
            LinkRow(
                "Privacy and consent",
                "Analytics: ${if (profile.analyticsOptIn) "on" else "off"} • Personalized offers: ${if (profile.personalizedOffersOptIn) "on" else "off"}",
                onConsentClick,
            )
            profile.supportEmail?.let { LinkRow("Support", it) }
            LinkRow(
                "Account deletion",
                profile.accountDeletionUrl
                    ?: "In-app account deletion is a release gate and is not enabled yet.",
            )
            Button(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out")
            }
            Spacer(modifier = Modifier.height(8.dp))
        } else {
            Button(onClick = onSignInClick, modifier = Modifier.fillMaxWidth()) {
                Text("Sign in with Firebase")
            }
            LinkRow("Privacy and consent", "Review separate optional preference controls.", onConsentClick)
            LinkRow("Support", "Help with offers, payouts, rewards, or orders.")
            LinkRow("Account deletion", "Deletion instructions become available with the account flow.")
        }
    }
}

@Composable
private fun ConsentPreferencesScreen(
    analyticsOptIn: Boolean,
    onAnalyticsOptInChange: (Boolean) -> Unit,
    partnerPersonalizationOptIn: Boolean,
    onPartnerPersonalizationChange: (Boolean) -> Unit,
    onPolicyClick: () -> Unit,
    onBack: () -> Unit,
) {
    ScreenColumn {
        TextButton(onClick = onBack) { Text("Back") }
        ScreenTitle("Privacy choices", "Optional preferences", "Each optional purpose has its own control and starts off disabled.")
        PreferenceSwitch(
            title = "Product analytics",
            supporting = "Allow pseudonymous usage measurement to help improve the app.",
            checked = analyticsOptIn,
            onCheckedChange = onAnalyticsOptInChange,
        )
        PreferenceSwitch(
            title = "Personalized partner offers",
            supporting = "Allow activity preferences to be used to tailor partner offer recommendations.",
            checked = partnerPersonalizationOptIn,
            onCheckedChange = onPartnerPersonalizationChange,
        )
        Text(
            text = "Choices made during account creation are stored server-side with the policy versions you accepted. The switches here are a preview until the preferences API is available.",
            style = MaterialTheme.typography.bodyMedium,
            color = RewardsTokens.muted,
        )
        TextButton(onClick = onPolicyClick) { Text("Privacy notice and Terms status") }
        Text(
            text = "Notifications will be requested only when a notification feature is enabled, not during guest onboarding.",
            style = MaterialTheme.typography.bodySmall,
            color = RewardsTokens.muted,
        )
    }
}

@Composable
private fun PreferenceSwitch(
    title: String,
    supporting: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(RewardsTokens.spacingMedium),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = RewardsTokens.text)
            Text(supporting, style = MaterialTheme.typography.bodySmall, color = RewardsTokens.muted)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
