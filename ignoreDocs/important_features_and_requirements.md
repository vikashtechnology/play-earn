# Important Features and Requirements

This note captures cross-cutting product requirements that should remain visible while implementing the task list. The numbered tasks remain the delivery order; this file records acceptance expectations and release risks that span multiple tasks.

## Identity and User Data

- OTP codes must expire, be single-use, be stored only as a secure hash, and be protected by per-phone, per-device, and per-IP rate limits.
- Account deletion must revoke active sessions, stop future processing, and remove or anonymize personal data according to applicable legal retention requirements.
- Collect the minimum personal data needed. Encrypt sensitive data in transit and at rest, restrict access, and define retention periods.

## Rewards, Wallet, and Offers

- Treat the immutable wallet ledger as the source of truth. Credit, debit, reversal, and withdrawal state changes must be atomic, auditable, and idempotent.
- Never accept a balance, reward amount, payout eligibility, or offer completion claim from the client as authoritative.
- Verify provider callbacks cryptographically, reject stale or malformed events, and make duplicate callback delivery harmless.
- Keep provider credentials and server-side offer validation out of Android and admin clients.
- Define coin economics, rounding, expiry policy, reversal behavior, and user-visible terms before enabling real rewards.

## Payouts and Orders

- Cash payouts require approved providers, eligibility/KYC checks where applicable, explicit user confirmation, idempotency keys, reconciliation, and auditable failure/reversal handling.
- Never store UPI PINs, card security codes, or payment-provider secrets. Store only the minimum payout destination data required and protect it appropriately.
- Reserve product inventory and wallet value transactionally. Orders need stable states for payment, fulfillment, cancellation, refund, and support investigation.
- Do not represent a payout or product order as complete until the provider or fulfillment system confirms it.

## Admin, Fraud, and Support

- Enforce role-based access control and least privilege on every admin API; require strong authentication for privileged actions.
- Audit actor, target, timestamp, reason, and before/after values for manual reward, withdrawal, campaign, and account changes.
- Provide review queues and explainable fraud signals for duplicate accounts, suspicious device/IP patterns, abnormal completion velocity, and repeated reversals.
- Support staff need a documented escalation path and must not be able to silently edit wallet balances.

## Privacy, Compliance, and Release

- Obtain jurisdiction-specific legal review for Indian privacy, consumer, advertising, tax, KYC, and payout obligations; do not treat this checklist as legal advice.
- Review Google Play rules for rewards, ads, installed-app promotions, background behavior, disclosures, and account deletion before each release.
- Use separate development, staging, and production credentials. Keep secrets out of source control and logs; rotate credentials after exposure.
- Configure structured logs, error monitoring, alerting, database backups, and a tested restore procedure with explicit recovery objectives.
- Require security review, provider sandbox testing, migration review, privacy/compliance review, and closed testing before production release.

## Current Implementation Gaps

- API feature routes currently use in-memory stores; they must be replaced with transactional PostgreSQL repositories before real user data or rewards are used.
- Authentication, admin RBAC, webhook signature verification, rate limiting, fraud detection, and provider integrations remain future tasks.
- Neon connectivity and migrations must be verified against the project's own Neon credentials before marking the database task fully done.