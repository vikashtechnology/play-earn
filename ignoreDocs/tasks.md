# Task Breakdown

Only one task at a time. Complete and document each task before moving
on.

## Current progress

- Task 2, Backend + environment: implementation complete; runtime environment variables are loaded from `apps/api/.env`.
- Task 3, PostgreSQL + migrations: Neon migration applied and API startup/health verified against the configured URLs.
- Task 4, Shared types/validation: shared domain declarations and strict request parsers are implemented and tested; product/order routes enforce the shared validators and derive order pricing server-side.
- Task 5, Android project + design tokens: Kotlin/Compose scaffold and token mapping are in place. Android compilation remains pending because Gradle is not installed in this environment.

## Foundation

1.  Repository + documentation setup
2.  Backend + environment
3.  PostgreSQL + migrations
4.  Shared types/validation
5.  Android project + design tokens
6.  Admin project + auth

## Identity

7.  OTP backend
8.  Android login
9.  Profile
10. Account deletion

## Wallet

11. Wallet schema/ledger
12. Wallet API
13. Wallet UI
14. Transaction history
15. Approval/reversal logic

## Offers

16. Offer model
17. Offer API
18. Offer UI
19. Provider adapter
20. Click tracking
21. S2S conversion webhook
22. Idempotent crediting
23. Reversal handling

## Rewards/Payouts

24. Referral system
25. Withdrawal domain
26. UPI/bank payout adapter
27. Withdrawal UI
28. Gift-card adapter
29. Gift-card redemption
30. Product catalog
31. Coins + cash checkout
32. Order/fulfillment

## Admin

33. RBAC
34. User management
35. Campaign management
36. Reward/withdrawal review
37. Catalog/orders
38. Brand partnerships
39. Fraud dashboard
40. Analytics
41. Support/CMS

## Monetization

42. Ad placements
43. Direct advertiser campaigns
44. Campaign reporting
45. Brand deals
46. Campaign billing/reconciliation

## Hardening/Release

47. Rate limits
48. Webhook security
49. Fraud rules
50. Audit logs
51. Monitoring/backups
52. Security review
53. Play compliance review
54. Closed testing
55. Production release

## Task 1 Acceptance

-   Six core docs exist.
-   Supporting docs exist.
-   Repository structure is defined.
-   README points to docs.
-   No feature code is written.
-   memory.md records initial decisions.
