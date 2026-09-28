# Personal data: access, consent, and retention

This note is for partner legal and data-protection review. It describes what CityCatalyst stores about a person, how that person (or an administrator) can export it, how cookie consent is recorded, and how retention runs on a schedule.

It is an engineering description of the controls in this repository. It is not a data-processing agreement, a record of processing activities, or a data-protection impact assessment.

## What counts as personal data here

The list of tables is `app/src/util/gdpr/personal-data-inventory.ts`. The export refuses to run if that list and the export code disagree.

Covered today:

- Account profile (`User`): name, email, title, picture, language, number format, role, default city and inventory, whether two-factor authentication is on, last sign-in, anonymization time.
- Memberships: city, organization admin, project admin.
- Invitations to a city, organization, or project, matched by user id or by the same email address.
- An organization row only when its contact email is the person's email.
- File metadata the person uploaded or imported (file name, type, status, city). The file bytes and storage keys are not exported.
- API tokens the person created (name, prefix, scopes, expiry, last use). The token hash is not exported.
- OAuth clients the person authorized.
- Webhook endpoints the person created (name, URL, events). The signing secret is not exported.
- Jobs the person started: high-impact action rankings, bulk inventory imports, MEED rankings, and catalog rows attributed to them.
- Consent history.
- Retention actions whose subject is that user.

Greenhouse-gas inventories are data about a city, not a copy of the account holder's personal data. The export includes the fact of membership and of upload. It does not include emission values.

Password hashes, two-factor secrets, and recovery-code hashes are replaced with `[redacted]` when a value is stored, and with null when it is not. The secret itself is not written into the file. Token hashes and webhook secrets are omitted entirely. This is a security limit on access: the person can see that a credential exists, not the credential.

## Access (DSAR)

| Who | Request |
| --- | --- |
| The signed-in person | Settings → Account → Your data, or `GET /api/v1/user/dsar?format=json` or `format=csv` |
| An OEF administrator, for a user id | `GET /api/v1/admin/users/{userId}/dsar?format=json` or `format=csv` |

JSON is one document: export time, privacy-policy version, the inventory, and one array per table. CSV is one file with columns `dataset`, `record_id`, `field`, `value`. Both are returned as downloads and are not cached.

Each table is capped at 5,000 rows. If a table is cut off, `truncation` in the JSON names that table.

Account deletion (`POST /api/v1/auth/delete`) is separate. It removes the user row. It is not the access export.

## Consent

Cookie and marketing choices are stored in `ConsentRecord`. Each grant or withdrawal is a new row. Rows are not overwritten.

A row records:

- consent type: `analytics` or `marketing`
- status: `granted` or `withdrawn`
- privacy-policy version, stamped by the server (`PRIVACY_POLICY_VERSION` in `app/src/util/gdpr/constants.ts`, currently `2026-09-28`)
- source: `cookie_banner`, `account_settings`, or `api`
- time
- user id, when the person is signed in
- browser subject key, so a choice made before sign-in can be tied to the account later
- user agent and IP address, kept as evidence of the event

The cookie banner still sets the browser cookie that turns analytics on or off. It also posts the same decision to `POST /api/v1/consent`. Accept is a grant. Decline, and closing the banner, are withdrawals. If that post fails, the banner still closes and the cookie still applies; the server row is missing until a later choice.

When a signed-in request includes a subject key, earlier anonymous rows for that key get the user id filled in. Status, time, and policy version on those rows stay as written.

Query:

- `GET /api/v1/user/consent` for the signed-in person
- `GET /api/v1/admin/users/{userId}/consent` for an administrator

The response is the full history, newest first, and the latest status per type.

If the user row is later deleted, consent rows remain and their user id is cleared, so the event is not destroyed with the account.

## Retention

A daily Kubernetes cron job calls `POST /api/v1/cron/enforce-retention` at 03:15 UTC. The call uses `Authorization: Bearer $CC_CRON_JOB_API_KEY`. The same ingress rule that blocks other `/api/v1/cron/` paths blocks this one from the public internet. Manifests:

- `k8s/cc-enforce-retention.yml`
- `k8s/test/cc-test-enforce-retention.yml`
- `k8s/prod/cc-prod-enforce-retention.yml`

The windows are environment variables on the web pod. If a variable is unset, the default is used. If it is set to something that is not a positive integer, the run fails instead of using a dangerous cutoff.

| Variable | Default | Effect |
| --- | --- | --- |
| `GDPR_INACTIVE_ACCOUNT_DAYS` | 1095 (3 years) | Anonymize accounts with no recent activity |
| `GDPR_STALE_INVITE_DAYS` | 180 | Delete pending invites older than this |
| `GDPR_UNUSED_TOKEN_DAYS` | 365 | Delete personal access tokens with no recent use |
| `GDPR_RETENTION_BATCH_SIZE` | 200 | Maximum rows per policy per run |
| `GDPR_RETENTION_DRY_RUN` | unset | `true` writes the log and changes no personal data |

Activity time is the last successful sign-in (`last_active_at`). Accounts that have never signed in since this field existed use `last_updated`, then `created`. A profile edit can refresh `last_updated`, so an account that is never used but is edited will not look inactive until the window passes after that edit.

Anonymization keeps the user row so city and inventory links stay valid. It clears name, picture, title, password, and two-factor secrets, sets the email to `anonymized+{userId}@anonymized.invalid`, and sets `anonymized_at`. Invite emails and an organization contact email that exactly match the old address are rewritten to that same anonymized address. The account can no longer sign in.

Pending invites older than the invite window are deleted. Personal access tokens that were never used, or were last used before the token window, are deleted.

Every candidate is written to `RetentionActionLog` in the same database transaction as the change: policy, action, subject, whether it was a dry run, and a small JSON detail object. The detail does not copy the person's email or any secret. A failed change rolls the log row back with it. The log is included in that person's DSAR when the subject is the user.

Consent rows are not deleted by these policies. They are the evidence of consent.

Each run processes at most the batch size per policy (and per invite table). The next night continues with whatever is still past the cutoff.

## What this does not do

- It does not decide a lawful basis. The inventory states the basis the product is built around (contract for the account, consent for analytics cookies, legal obligation for access and for keeping proof). Counsel should confirm that.
- It does not cover processors outside this database (for example the analytics vendor, email delivery, or object storage). File bytes in object storage are not included in the export and are not deleted by the retention job.
- It does not replace the existing immediate account-deletion endpoint.
- Consent history has no screen of its own. It is available from `GET /api/v1/user/consent`. The personal-data download is on Settings → Account → Your data.
