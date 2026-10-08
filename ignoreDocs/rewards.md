# Rewards System

## Types

-   UPI/bank cash
-   Gift cards/vouchers
-   Physical products
-   Products with coins + cash
-   Coupons

## States

AVAILABLE, PENDING, PROCESSING, FULFILLED, FAILED, CANCELLED, REVERSED.

## Redemption

Server checks balance → reserve coins → create order → call provider →
confirm → commit ledger. Release reservations on failure.

## Product Co-Pay

``` text
Product ₹2,499
Coins ₹1,500
Cash ₹999
```

Cash payment and coin reservation must be handled transactionally.

## Gift Cards

Use an authorized reward provider. Never generate or scrape codes.
