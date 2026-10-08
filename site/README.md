# `site/` — publishable legal pages

Static, dependency-free HTML pages that the app and the Play Store listing link
to. No JavaScript, no external fonts, no CDNs, no analytics tags — a privacy
notice should not itself load third-party trackers.

| File | Purpose | Env variable it satisfies |
|---|---|---|
| `index.html` | Legal hub / landing page | — |
| `terms.html` | Terms of Service (`terms-2026-10-08.2`) | `TERMS_URL`, `TERMS_VERSION` |
| `privacy.html` | Privacy Notice (`privacy-2026-10-08.2`) | `PRIVACY_URL`, `PRIVACY_VERSION` |
| `delete-account.html` | Account deletion, with and without the app | `ACCOUNT_DELETION_URL` |
| `assets/policy.css` | Shared styling | — |

## Before you publish — required edits

The pages are complete drafts, but four placeholders must be replaced with real
values. They appear in every file:

| Placeholder | Replace with |
|---|---|
| `[Legal entity name]` | Your registered company or proprietorship name |
| `[Registered address]` / `[Postal address]` | The registered office address |
| `[support email]` | A monitored support inbox — also set `SUPPORT_EMAIL` |
| `[Grievance Officer name]` / `[grievance email]` | Required by the IT Rules and DPDP Act 2023 |
| `[City, State]` | Jurisdiction for disputes (Terms §22) |

Find them all with:

```sh
grep -rn "\[Legal entity name\]\|\[support email\]\|\[Grievance\|\[Registered address\]\|\[Postal address\]\|\[City, State\]" site/
```

**Legal review is mandatory before launch.** These drafts are written to match
what this codebase actually does — Firebase Authentication, Neon Postgres on
AWS `us-east-2`, hashed fraud signals, a 540-day auth-event retention, 15-minute
sessions, advertising coins that can never become cash — and to follow the
product rules in `docs/06_Coin_Economy_Rules.md`, `docs/07_Fraud_Rules_v1.md`,
and `docs/08_Support_SLA.md`. They are **not legal advice**. Have a qualified
Indian lawyer review them, confirm the limits in Terms §18, the retention periods
in Privacy §8, and the tax wording in Terms §13, and adjust the coin economics to
whatever you actually ship.

Also confirm these numbers match your real configuration before publishing, and
update both together whenever they change: expiry (12 months), approval windows,
withdrawal minimum and daily/monthly ceilings, support response targets, and the
540-day retention window (`pruneAuthEvents` in `src/db/identityRepository.js`).

## Publish on GitHub Pages

`.github/workflows/pages.yml` deploys this folder to GitHub Pages on every push
to `main`. One-time setup in the repository settings:

1. **Settings → Pages → Build and deployment → Source** → *GitHub Actions*.
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. The pages become available at `https://<org-or-user>.github.io/<repo>/` —
   for this repository, `https://vikashtechnology.github.io/play-earn/`.

The workflow deliberately **fails while any bracketed placeholder remains**, so a
half-finished page can never be published to real users. Expect a red build until
the edits above are done; preview locally in the meantime:

```sh
python3 -m http.server --directory site --bind 0.0.0.0 8080
# open http://localhost:8080/
```

Then set the API environment (`apps/api/.env`):

```sh
TERMS_VERSION=terms-2026-10-08.2
PRIVACY_VERSION=privacy-2026-10-08.2
TERMS_URL=https://vikashtechnology.github.io/play-earn/terms.html
PRIVACY_URL=https://vikashtechnology.github.io/play-earn/privacy.html
ACCOUNT_DELETION_URL=https://vikashtechnology.github.io/play-earn/delete-account.html
SUPPORT_EMAIL=you@your-domain
SIGNUP_ENABLED=true
```

`npm run config:check` then re-evaluates the gate. The API deliberately rejects
`.example` / `example.com` / `localhost` / `.invalid` hosts
(`isPublishedPolicyUrl` in `apps/api/src/config.js`), so a placeholder URL cannot
silently enable sign-in — but a real URL that 404s can, so confirm each page
loads before flipping `SIGNUP_ENABLED`.

## Why the version strings matter

The Android consent screen displays the versions it fetched from
`GET /api/v1/auth/policies` and echoes them back on sign-up. The API rejects the
request if they no longer match the published values (`stale_policy_version`),
which is what stops an old cached consent screen from being replayed after you
amend the Terms. So: **bump the version identifier whenever the page content
changes**, and keep the identifier on the page in sync with the env value. The
format is free-form; `terms-YYYY-MM-DD` is the convention used here.

## Custom domain

If you publish on your own domain instead, set the URLs to that host, add it to
the repository's Pages settings, and make sure the certificate is valid — the
Firebase email-link domain and these policy URLs do not have to be the same host,
but both must be HTTPS pages you control.
