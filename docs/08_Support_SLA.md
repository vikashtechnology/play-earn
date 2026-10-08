# 08 — Support SLA & Escalation

**Version:** 1.0 | **Date:** 2026-10-06

---

## 1. Goals

- Resolve user issues quickly and fairly
- Protect reward liability and prevent abuse of the support channel
- Maintain clear audit trail
- Meet grievance-officer obligations under DPDP / consumer rules

---

## 2. Channels

| Channel | Use |
|---------|-----|
| In-app ticket | Primary |
| Email (support@…) | Secondary |
| Grievance Officer contact | Published, for formal complaints |
| Play Store reviews | Monitor, do not promise resolution there |

Never handle payment/payout disputes only via social media or WhatsApp.

---

## 3. Ticket Categories & Priority

| Category | Priority | First Response | Resolution Target |
|----------|----------|----------------|-------------------|
| Missing reward (offer) | P1 | 4 business hours | 24–48 hours |
| Failed / delayed cash payout | P1 | 2 business hours | 24 hours |
| Gift card not received / invalid | P1 | 4 business hours | 24–48 hours |
| Product order / shipping | P2 | 8 business hours | 3–5 business days |
| Account / KYC / login | P2 | 8 business hours | 48 hours |
| General question / how-to | P3 | 24 hours | 72 hours |
| Abuse / fraud report | P1 | 4 hours | Escalate to Risk |

Business hours: Monday–Saturday 10:00–19:00 IST (adjust as needed).

---

## 4. Standard Handling Rules

### Missing Offer Reward

1. Ask for Offer ID + Click ID (or screenshot).
2. Check conversion table + provider dashboard.
3. If provider confirmed → credit (with idempotency).
4. If still pending → explain approval window.
5. If rejected by provider → explain reason if available; do not override without Risk approval.

### Failed Payout

1. Check RazorpayX status + internal withdrawal record.
2. If provider failed → retry or reverse reservation and notify user.
3. If bank/UPI issue → ask user to verify details.
4. Never manually “adjust balance” without dual auth + audit log.

### Gift Card Issues

1. Check provider order status.
2. Resend code if still valid.
3. If expired/invalid on provider side → re-issue or refund coins per policy.

---

## 5. Escalation Path

```text
Support Agent
    ↓ (cannot resolve in SLA or high value)
Senior Support / Ops
    ↓ (fraud, chargeback, legal, large amount)
Risk / Fraud team or Finance
    ↓ (formal complaint, DPDP, regulatory)
Grievance Officer
```

Grievance Officer details (name, email, phone, address) must be published in the app and on the website.

---

## 6. Templates (Short)

**Missing reward – still pending**  
“Your offer is still in the verification window (usually 24–72 hours). We will credit the coins automatically once the partner confirms. You can track status in the Earn → Offer detail screen.”

**Payout processing**  
“Your withdrawal is being processed by our payout partner. Most UPI transfers complete within a few hours. You will receive a notification on success or failure.”

**Rejected by provider**  
“The partner did not confirm completion of this offer (common reasons: install not from Play Store, offer already completed earlier, or terms not met). Coins cannot be credited in this case.”

---

## 7. Internal Metrics to Track

- First response time
- Time to resolution
- % of tickets reopened
- % of missing-reward tickets that result in credit
- Chargeback / reversal rate linked to support overrides

---

## 8. Agent Guidelines

- Never promise guaranteed earnings or fixed timelines beyond published windows.
- Never share other users’ data.
- Never bypass fraud holds or KYC requirements.
- Log every balance-affecting action with ticket ID.
- Be polite, clear, and firm on policy.

---

## 9. Review

Review SLAs and templates monthly for the first 3 months after launch, then quarterly.
