# AI Coding Rules

1.  Work on exactly one task from tasks.md at a time.
2.  Read the documentation before modifying architecture.
3.  Keep functions small and self-explanatory.
4.  Avoid duplication and unnecessary dependencies.
5.  Use strict TypeScript and typed Kotlin.
6.  Validate all external input at API boundaries.
7.  Never trust client-provided balances, rewards or payout amounts.
8.  Every reward/payout mutation requires an auditable ledger entry.
9.  Verify signed provider webhooks and use idempotency.
10. Keep secrets server-side only.
11. Rate-limit auth, redemption, withdrawal and webhook endpoints.
12. Use database transactions for wallet state changes.
13. Never silently swallow errors.
14. Write unit/integration tests for money and reward flows, including
    retries and duplicate webhooks.
15. Use migrations and foreign keys where appropriate.
16. Do not introduce a new UI pattern without updating design.md.
17. Update memory.md after every completed task.
