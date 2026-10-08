# Advertisement & App Promotion

## Policy Guardrail

Do not make incentivized installation of other apps the sole/main
functionality of the Play Store app. Every campaign must be reviewed
against current platform and provider rules.

## Campaign Types

-   CPI where permitted
-   CPE verified milestones
-   CPA verified actions
-   Surveys
-   Lead generation
-   Brand promotions
-   Coupons/commerce

## Tracking

``` text
Campaign → unique click → user action → provider verification
→ signed S2S postback → backend validation → pending coins
→ approval → available coins
```

## Required Data

campaign_id, provider, external_offer_id, click_id, user_id,
conversion_id, event, payout, reward_coins, status, timestamps and
necessary attribution metadata.

## Fraud

Signed webhooks, idempotency, duplicate conversion detection,
velocity/risk checks, reversals and provider reconciliation.

## Advertiser Dashboard

Campaign setup, budget, objective, reward, dates, conversion reporting,
pending/rejected conversions and exports.
