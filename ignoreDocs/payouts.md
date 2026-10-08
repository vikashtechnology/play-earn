# Payouts

## Methods

-   UPI
-   Bank account

## Flow

``` text
Request → validation → risk review → coin reservation/deduction
→ payout provider → status → completed/failed → reconciliation
```

## States

REQUESTED, RISK_REVIEW, PROCESSING, PAID, FAILED, CANCELLED, REFUNDED.

## Security

Server-authoritative amounts, destination validation where required,
rate limits, idempotency, provider references and audit logs.

## Reconciliation

Compare internal withdrawals with provider status, settlement reports
and failed/reversed transactions.
