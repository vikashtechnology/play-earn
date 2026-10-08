============================================================
🚫 MISTAKES TO AVOID — INDIA REWARDS MARKETPLACE APP
============================================================
Version: 1.0 | Date: 2026-10-06
Purpose: A comprehensive list of things you must NEVER do
to stay compliant, legal, and operational.

NOTE: This is not legal advice. Always consult a qualified
lawyer/CA for your specific business.

============================================================
1. LEGAL & REGULATORY MISTAKES
============================================================

❌ Treating in-app coins as a stored-value wallet or PPI
✅ Coins must be earn-only, non-purchasable, non-transferable,
   non-cash-equivalent. Use internal rewards ledger.

❌ Holding user INR balances
✅ Never hold user INR. Use regulated payout providers
   (RazorpayX, Cashfree Payouts).

❌ Allowing coin purchase with real money
✅ Users cannot buy coins. Only earn them.

❌ Allowing coin transfer between users
✅ Coins are non-transferable.

❌ Skipping DLT registration for SMS/OTP
✅ Mandatory DLT registration (PEID, Sender ID, Template
   approval) before any SMS.

❌ Ignoring DPDP Act 2023 & Rules 2025
✅ Implement consent notices, age gate, data principal rights,
   grievance officer, retention/deletion, children’s data safeguards.

❌ Not appointing a Grievance Officer
✅ Publish name, email, phone, address as per Consumer Protection
   (E-Commerce) Rules.

❌ Ignoring GST/TDS
✅ Engage a CA. TDS 194R, 194B, GST on rewards, free goods,
   vouchers, co-pay.

❌ No legal opinion on coin/cashout model
✅ Get written legal advice before launching cash payouts.

❌ Skipping CERT-In VAPT before go-live
✅ Mandatory for internet-facing apps. Use CERT-In empanelled auditor.

❌ No incident response plan (6-hour reporting)
✅ Report cyber incidents to CERT-In within 6 hours.

============================================================
2. GOOGLE PLAY POLICY MISTAKES
============================================================

❌ Making “install apps for coins” the main functionality
✅ App must be a rewards marketplace. Offerwall is one module
   among surveys, brand deals, coupons, products.

❌ Home screen shows offerwall first
✅ Home shows rewards marketplace, balance, featured deals.
   Offerwall lower.

❌ Store listing says “install apps and earn money”
✅ Describe broader rewards features. No guaranteed-income claims.

❌ Manipulating ratings/reviews/install counts
✅ Never incentivize ratings, reviews, or fake installs.

❌ AdMob rewarded ads giving cash, gift cards, or cryptocurrency
✅ AdMob rewards must be in-app, non-transferable, non-cash items only.

❌ Mixing AdMob reward flow with cash/gift card redemption
✅ Keep two separate coin balances or tag coins by source.

❌ Not completing Financial features declaration
✅ Mandatory in Play Console. Declare “Rewards, points,
   frequent flier miles, and other incentives”.

❌ Missing account deletion in-app + web link
✅ Required if accounts can be created. Enter URL in Play Console.

❌ Inaccurate Data Safety section
✅ Disclose all data collection (offerwall SDK, attribution,
   analytics, payout details).

❌ Targeting API level below requirement
✅ By 31 Aug 2026, target Android 16 (API 36) or higher.

❌ Using Play Billing for physical goods
✅ Physical goods use Razorpay (not Play Billing). Digital goods
   use Play Billing.

❌ Selling digital gift cards for real money without Play Billing
✅ If selling digital goods, Play Billing may apply. Consult policy.

============================================================
3. PLAY STORE-ONLY INSTALL MISTAKES
============================================================

❌ Allowing installs from third-party APK sources
✅ All app/game install offers must redirect exclusively to
   Google Play Store.

❌ Direct APK downloads or sideloading
✅ Never. Use market://details?id=<package> or Play Store URL.

❌ Not validating install source in postback
✅ Backend must verify referrer from Play Store before crediting rewards.

❌ Accepting offers with non-Play-Store landing URLs
✅ Admin approval must reject any offer not pointing to Play Store.

❌ Ignoring Google Play Install Referrer API
✅ Use it to validate click_id and install source.

============================================================
4. WALLET & COIN LEDGER MISTAKES
============================================================

❌ Mutating a single balance field as source of truth
✅ Use append-only ledger. Balance = SUM of valid entries.
   Cached balance for performance only.

❌ Editing or deleting ledger entries
✅ Never. Reversals create new negative entries.

❌ Crediting coins without idempotency key
✅ Every credit must have a unique idempotency key to prevent duplicates.

❌ Crediting coins before provider verification
✅ Only credit after trusted server-to-server postback. No local timers.

❌ Allowing negative balances
✅ Prevent by reserving coins before redemption.

❌ Not releasing reserved coins on failure
✅ Always release on payout/gift card failure.

❌ Admin changing balance without audit log
✅ All manual adjustments require dual authorization and immutable audit log.

============================================================
5. PAYMENTS & PAYOUT MISTAKES
============================================================

❌ Storing raw card data
✅ Let Razorpay handle card data. Never store PAN/CVV.

❌ Skipping KYC for payouts
✅ Tiered KYC required for cash withdrawals. Verify bank/UPI
   with penny drop.

❌ Not using RazorpayX idempotency key
✅ Mandatory X-Payout-Idempotency header for all payout requests.

❌ Not allowlisting IPs for payout API
✅ Mandatory. Only allowlisted IPs can call payout API.

❌ Using TLS below 1.2
✅ PCI requires TLS 1.2+.

❌ Manual gift card reselling
✅ Use API-based providers (Xoxoday, QwikCilver, GyFTR).
   Never buy and resell manually.

❌ Ignoring reconciliation
✅ Daily reconciliation of payments, payouts, gift cards,
   offerwall postbacks.

❌ No reserve for fraud/chargebacks/refunds
✅ Set aside reserves. Never launch if unit economics negative.

============================================================
6. DATA & PRIVACY MISTAKES
============================================================

❌ Collecting unnecessary device/app data
✅ Collect only what is necessary for fraud/analytics.
   Disclose accurately.

❌ No consent notice before data collection
✅ DPDP-compliant standalone, granular consent.

❌ No age gate or parental consent for <18
✅ Verified parental consent required for children’s data.

❌ Data stored outside India (payment data)
✅ Payment data, financial records, transaction histories
   must remain in India.

❌ No grievance officer for data issues
✅ Publish contact.

❌ No data deletion/retention policy
✅ Document and enforce. Provide in-app + web deletion path.

============================================================
7. SECURITY & FRAUD MISTAKES
============================================================

❌ Trusting client-side timers for reward completion
✅ Only trust server-to-server postbacks from providers.

❌ Not validating webhook signatures
✅ Verify HMAC signature on every webhook.

❌ Not handling duplicate webhooks
✅ Store event_id, reject duplicates. Idempotent processing.

❌ No rate limiting on OTP, login, offer-start, withdrawal
✅ Implement rate limits to prevent abuse.

❌ Admin endpoints accessible with consumer tokens
✅ Separate admin auth, MFA mandatory.

❌ Secrets in APK or source control
✅ Use managed secret store (AWS Secrets Manager).

❌ No fraud rules
✅ Velocity checks, device clustering, payout holds, manual review.

❌ No audit logs for admin actions
✅ Immutable audit log for all sensitive actions.

❌ Skipping VAPT
✅ Mandatory before go-live and annually.

============================================================
8. UI/UX MISTAKES
============================================================

❌ AdMob section says “earn cash” or “gift card”
✅ Say “earn in-app coins only”.

❌ Offerwall section lacks status badges
✅ Show Pending / Approved / Reversed.

❌ No “Report missing reward” button
✅ Provide with offer ID + click ID.

❌ Not showing install source
✅ Show “Google Play Store” badge on offer detail.

❌ Dark patterns (fake urgency, forced actions)
✅ Avoid. Comply with Consumer Protection Rules.

❌ No regional language support
✅ Support English + Hindi + regional languages.

❌ No offline handling for low-end devices
✅ Cache catalog, compress images, lazy load.

============================================================
9. OPERATIONS & SUPPORT MISTAKES
============================================================

❌ No daily reconciliation
✅ Reconcile payments, payouts, gift cards, offerwall daily.

❌ No support SLA
✅ Respond to missing-reward, payout, product issues promptly.

❌ No escalation path
✅ Publish grievance officer and escalation.

❌ No provider backup plan
✅ Use adapter pattern; have fallback providers.

❌ No incident response plan
✅ Document and test. Report to CERT-In within 6 hours.

❌ Launching without legal/compliance review
✅ Mandatory pre-launch review.

============================================================
10. BUSINESS & COMMERCIAL MISTAKES
============================================================

❌ Setting 1 coin = ₹1 permanently without economics
✅ Coin rate configurable, driven by campaign economics.

❌ Promising guaranteed income or ROI
✅ Never. No misleading earning claims.

❌ Ignoring unit economics per campaign
✅ Calculate contribution margin. Never launch if negative.

❌ No written contracts with brands/advertisers
✅ Cover objective, attribution, fraud, refunds, budget,
   payment, data, termination.

❌ No fraud/chargeback reserve
✅ Set aside funds.

❌ No breakage policy for expired coins
✅ Disclose in Reward Rules.

❌ Underestimating support costs
✅ Budget for support tickets, disputes.

============================================================
11. QUICK REFERENCE: THE 10 DEADLY SINS
============================================================

1. Making incentivized installs the main functionality
   -> Play Store removal.

2. AdMob rewarded ads giving cash/gift cards
   -> AdMob account ban + removal.

3. Treating coins as a wallet/PPI
   -> RBI issues.

4. Skipping DLT registration
   -> SMS/OTP won't deliver.

5. No account deletion path
   -> Play Store rejection.

6. Incomplete Data Safety
   -> Play Store rejection.

7. Missing Financial features declaration
   -> Play Store rejection.

8. Allowing non-Play-Store installs
   -> Security risk + policy violation.

9. No idempotency in wallet/payout
   -> Duplicate credits/losses.

10. Ignoring legal/compliance review
    -> Regulatory action.

============================================================
12. PRE-LAUNCH “DO NOT” CHECKLIST
============================================================

[ ] DO NOT make install-for-coins the hero feature.
[ ] DO NOT reward AdMob views with cash/gift cards.
[ ] DO NOT allow coin purchase, transfer, or cash-out of AdMob coins.
[ ] DO NOT skip DLT registration.
[ ] DO NOT allow third-party APK installs.
[ ] DO NOT credit rewards without S2S postback + idempotency.
[ ] DO NOT mutate wallet balance directly.
[ ] DO NOT skip RazorpayX idempotency/IP allowlist.
[ ] DO NOT store raw card data.
[ ] DO NOT collect unnecessary data.
[ ] DO NOT ignore DPDP consent/age gate.
[ ] DO NOT launch without account deletion.
[ ] DO NOT skip Financial features declaration.
[ ] DO NOT target below API 36 after Aug 2026.
[ ] DO NOT launch cash payouts without legal opinion.
[ ] DO NOT forget reconciliation jobs.
[ ] DO NOT leave admin actions without audit logs.
[ ] DO NOT skip VAPT before go-live.
[ ] DO NOT promise guaranteed income.
[ ] DO NOT ignore unit economics.

============================================================
