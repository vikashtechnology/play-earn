# 🪪 Why KYC (PAN/Aadhaar) Is Required — Even for Non-Government Apps

**Version:** 1.0 | **Date:** 2026-10-06

---

## The Simple Answer

Your app is **not a government app**. But the moment you enable **cash payouts to users** (UPI/bank withdrawal), you enter the scope of **RBI (Reserve Bank of India) regulations**. KYC is not optional — it is a legal requirement for any platform handling real money transfers.

---

## RBI Guidelines: KYC is Mandatory for Cash Payouts

RBI mandates KYC and Customer Due Diligence for any entity operating a payment system.

| Requirement | Detail |
|-------------|--------|
| Beneficiary KYC | Before cash payout: PAN + account proof |
| Name Matching | PAN holder name must match bank account holder |
| High-Value Transactions | Cumulative payout > ₹50,000/month requires Full Video-KYC |

---

## How KYC Affects Rewards & Cashback

| Example | Detail |
|---------|--------|
| Paytm | Users without KYC cannot receive cashback in wallet; limit drops to ₹10,000/month |
| Zeta | "Reloadable rewards require KYC for unlimited transfer" |
| PPI Rules | Coin + cash model may be considered a Prepaid Payment Instrument |

---

## What This Means for Your App

| Scenario | KYC Required? |
|----------|---------------|
| User earns coins only | ❌ No |
| User redeems for gift cards/products | ❌ No |
| User requests cash withdrawal (UPI/Bank) | ✅ **Yes, mandatory** |

### KYC Tiers

| Tier | Requirement | Limit |
|------|-------------|-------|
| Minimum KYC | OTP-based mobile verification | ₹10,000/month |
| Full KYC | PAN, Aadhaar, Video KYC | Unlimited |

---

## Implementation Flow

```text
User taps "Cash Withdrawal"
        ↓
Check KYC status
        ↓
If not KYC'd → Prompt KYC
        ↓
Minimum KYC (OTP) → ₹10,000/month limit
        ↓
If user needs more → Full KYC (PAN + Aadhaar + Video)
        ↓
Proceed with payout via RazorpayX
```

---

## Summary

- Your app is not a government app.
- But cash payouts = financial transactions = RBI rules apply.
- KYC (PAN/Aadhaar) is a legal safeguard, not a burden.
- It protects you, the platform, and the user.
