# 🚫 Mistakes to Avoid — India Rewards Marketplace App

**Version:** 1.0 | **Date:** 2026-10-06  
**Purpose:** Things you must NEVER do to stay compliant, legal, and operational.

> **Note:** This is not legal advice. Consult a qualified lawyer/CA.

---

## 1. Legal & Regulatory Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Treating coins as wallet/PPI | Coins must be earn-only, non-purchasable, non-transferable, non-cash-equivalent |
| Holding user INR balances | Use regulated payout providers (RazorpayX, Cashfree) |
| Allowing coin purchase | Users cannot buy coins |
| Allowing coin transfer | Coins are non-transferable |
| Skipping DLT registration | Mandatory for SMS/OTP |
| Ignoring DPDP Act | Implement consent, age gate, grievance officer, deletion |
| No Grievance Officer | Publish name, email, phone, address |
| Ignoring GST/TDS | Engage a CA |
| No legal opinion on coin/cashout | Get written advice before cash payouts |
| Skipping CERT-In VAPT | Mandatory before go-live |
| No incident response plan | Report to CERT-In within 6 hours |

---

## 2. Google Play Policy Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Install-for-coins as main functionality | Rewards marketplace first, offerwall one module |
| Home screen shows offerwall first | Home shows rewards, balance, featured deals |
| "Install apps and earn money" in listing | Describe broader rewards features |
| Manipulating ratings/reviews/installs | Never incentivize ratings, reviews, fake installs |
| AdMob rewarded ads giving cash/gift cards | In-app, non-transferable, non-cash only |
| Mixing AdMob with cash/gift card flow | Two separate coin balances or tag by source |
| Missing Financial features declaration | Mandatory in Play Console |
| No account deletion path | In-app + web link + URL in Console |
| Inaccurate Data Safety | Disclose all data collection |
| Target API below requirement | API 36 (Android 16) by Aug 2026 |
| Play Billing for physical goods | Use Razorpay for physical goods |
| Selling digital gift cards without Play Billing | Consult policy |

---

## 3. Play Store-Only Install Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Allowing third-party APK sources | Redirect exclusively to Google Play Store |
| Direct APK downloads/sideloading | Never. Use `market://details?id=<package>` |
| Not validating install source | Backend must verify Play Store referrer |
| Accepting non-Play-Store landing URLs | Admin approval rejects them |
| Ignoring Play Install Referrer API | Use to validate click_id and source |

---

## 4. Wallet & Coin Ledger Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Mutating single balance field | Append-only ledger, balance = SUM |
| Editing/deleting ledger entries | Reversals create new negative entries |
| Crediting without idempotency key | Unique idempotency key for every credit |
| Crediting before provider verification | Only after S2S postback. No local timers |
| Allowing negative balances | Reserve coins before redemption |
| Not releasing reserved coins on failure | Always release on failure |
| Admin changing balance without audit log | Dual authorization + immutable audit log |

---

## 5. Payments & Payout Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Storing raw card data | Let Razorpay handle. Never store PAN/CVV |
| Skipping KYC for payouts | Tiered KYC, penny drop verification |
| No RazorpayX idempotency key | Mandatory `X-Payout-Idempotency` header |
| No IP allowlisting for payout API | Mandatory |
| TLS below 1.2 | PCI requires TLS 1.2+ |
| Manual gift card reselling | Use API providers (Xoxoday, QwikCilver) |
| Ignoring reconciliation | Daily reconciliation of all flows |
| No fraud/chargeback reserve | Set aside reserves. Never launch if negative |

---

## 6. Data & Privacy Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Collecting unnecessary data | Only what's necessary for fraud/analytics |
| No consent notice | DPDP-compliant granular consent |
| No age gate/parental consent | Verified parental consent for <18 |
| Data outside India (payment data) | Payment data must remain in India |
| No grievance officer for data | Publish contact |
| No data deletion/retention policy | Document and enforce |

---

## 7. Security & Fraud Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| Trusting client-side timers | Only S2S postbacks from providers |
| Not validating webhook signatures | HMAC on every webhook |
| Not handling duplicate webhooks | Store event_id, reject duplicates |
| No rate limiting | OTP, login, offer-start, withdrawal |
| Admin endpoints with consumer tokens | Separate admin auth, MFA |
| Secrets in APK/source control | Managed secret store |
| No fraud rules | Velocity, device clustering, holds |
| No audit logs for admin actions | Immutable audit log |
| Skipping VAPT | Mandatory before go-live and annually |

---

## 8. UI/UX Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| AdMob says "earn cash/gift card" | Say "earn in-app coins only" |
| Offerwall lacks status badges | Show Pending/Approved/Reversed |
| No "Report missing reward" | Provide with offer ID + click ID |
| Not showing install source | "Google Play Store" badge |
| Dark patterns | Avoid. Comply with Consumer Protection Rules |
| No regional language support | English + Hindi + regional |
| No offline handling | Cache catalog, compress images |

---

## 9. Operations & Support Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| No daily reconciliation | Reconcile payments, payouts, gift cards, offerwall |
| No support SLA | Respond to missing-reward, payout, product issues |
| No escalation path | Publish grievance officer |
| No provider backup plan | Adapter pattern, fallback providers |
| No incident response plan | Document and test. Report within 6 hours |
| Launching without legal/compliance review | Mandatory pre-launch review |

---

## 10. Business & Commercial Mistakes

| ❌ Mistake | ✅ Correct Approach |
|-----------|---------------------|
| 1 coin = ₹1 permanently | Configurable rate driven by economics |
| Promising guaranteed income/ROI | Never |
| Ignoring unit economics | Calculate contribution margin. Never launch if negative |
| No written contracts with brands | Cover objective, attribution, fraud, refunds, payment, data |
| No fraud/chargeback reserve | Set aside funds |
| No breakage policy for expired coins | Disclose in Reward Rules |
| Underestimating support costs | Budget for tickets, disputes |

---

## 11. The 10 Deadly Sins

1. **Install-for-coins as main functionality** → Play Store removal
2. **AdMob rewarded ads giving cash/gift cards** → AdMob ban + removal
3. **Treating coins as wallet/PPI** → RBI issues
4. **Skipping DLT registration** → SMS/OTP won't deliver
5. **No account deletion path** → Play Store rejection
6. **Incomplete Data Safety** → Play Store rejection
7. **Missing Financial features declaration** → Play Store rejection
8. **Allowing non-Play-Store installs** → Security risk + policy violation
9. **No idempotency in wallet/payout** → Duplicate credits/losses
10. **Ignoring legal/compliance review** → Regulatory action

---

## 12. Pre-Launch "Do Not" Checklist

```text
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
```

**Review this file before every release.**
