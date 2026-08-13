# Product and Technical Documentation

## Document status

- Product: Smart Visa & Travel Document Tracker
- Version: Phase 1 release candidate
- Last verified: 2026-08-13
- Implementation status: Tasks 1–7 complete and locally release-tested; zero-cost Render/Neon/external-trigger infrastructure is defined, but public provisioning requires provider account access

## Product summary

The application gives an individual a private place to record passport, visa, supporting-document, reminder, and travel-history data. It derives date-based statuses from those user-entered records and sends configured expiry emails. Administrators can monitor accounts and aggregate operational health without opening users’ sensitive document records.

The product does not verify a document or requirement with a government or another external authority. Every overall “compliance” summary is explicitly labeled as a stored-data rollup. Destination checklists are seeded examples with a visible instruction to verify current requirements with official authorities.

## Users and permissions

| Role | Capabilities |
| --- | --- |
| User | Manage only their own passports, visas, uploaded supporting documents, reminder settings, notification history, and trips; read static destination references; view their own dashboard. |
| Admin | All normal account capabilities plus user status management and aggregate platform statistics. Admin endpoints do not provide another user’s passport number, visa ID, uploaded bytes/reference, or other raw document contents. |

Public registration always creates a `user`. Admin role assignment is an operator action performed with `npm run users:set-role -- <email> admin` against the intended database.

## Implemented features

### Authentication and accounts

- Registration validates name, email, and password; normalizes email; checks uniqueness; and bcrypt-hashes the password.
- Login verifies the bcrypt hash and issues a signed, expiring JWT in an HTTP-only cookie.
- Logout clears the cookie. The frontend keeps no token in local/session storage.
- Protected middleware reloads the current user and rejects missing, invalid, or disabled accounts.
- Role middleware enforces admin API boundaries. React route guards independently block direct non-admin navigation.
- Admins can enable/disable accounts but cannot disable their own account.

### Documents and private files

- Passport CRUD: number, issuing country, issue date, expiry date.
- Visa CRUD: destination country, type, validity dates, entry type, visa ID.
- Supporting-document CRUD: document type, optional expiry, and a required PDF/JPG/PNG.
- Issue/validity dates are validated and ordered on both the client and server.
- File handling checks declared MIME type, byte signature, and server-side size; stores a random reference with private permissions; and streams bytes only after an ownership-scoped query.
- Deletes remove both the database row and private file where applicable.

### Status, reminders, and notifications

- One shared backend utility returns `valid`, `expiring-soon`, `expired`, or `no-expiry` from an expiry date and that document’s active reminder window.
- Status is added to list/detail API representations. The frontend displays the returned status and does not recompute it.
- Default reminder rows are 90/60/30 days. A user can enable, disable, replace, or add thresholds per document.
- A one-shot reminder job finds currently due occurrences, sends through SMTP, and records sent/failed metadata.
- The same job is triggered by a daily in-process fallback or the secret-protected `/api/cron/run-reminders` endpoint. The HTTP path acknowledges with 202 before email work completes.
- A database uniqueness constraint on reminder plus current expiry date claims each occurrence and prevents duplicate successful sends. Failed occurrences can be retried.
- Notification History shows the user their own delivery outcomes.

### Travel and reference data

- TravelHistory CRUD records country, entry/exit dates, purpose, and an optional linked Visa.
- Server logic verifies that a linked Visa exists and belongs to the same owner; exit cannot precede entry.
- Five destination checklist records are seeded idempotently for France, Japan, Singapore, the United Arab Emirates, and the United States.
- Checklist API objects carry `isStaticReference=true` and a disclaimer. The frontend renders the disclaimer adjacent to the selected list.

### Dashboard

- One ownership-scoped endpoint loads all three document types, statuses, next five reminder occurrences, and five most recent trips.
- Cards show total, valid, expiring-soon, and expired counts, with sensible zero/no-expiry states.
- The overall banner is derived only from stored dates and says it is not external/government verification.
- Fresh requests query current rows; document and trip mutations appear after refresh.

### Admin panel

- User table: ID, name, email, role, status, join date, activity counts, and last activity time.
- Aggregate documents by type/status, active reminders, notification sent/failed/pending totals, recent failure metadata, expiring/expired totals, comparable weekly expiry counts, enabled/disabled/active users, and six weeks of document/trip activity.
- No route was built to view a specific other user’s raw document or uploaded file.

## Data model

All Sequelize models use UUID primary keys and timestamps.

| Entity | Important fields | Relationships and constraints |
| --- | --- | --- |
| User | name, unique email, password hash, role, status | Owns all private records. Password hash is excluded by default scope. |
| Passport | owner, number, issuing country, issue/expiry dates | Belongs to User; expiry must be after issue; number/country uniqueness is enforced. |
| Visa | owner, country, visa type, validity dates, entry type, visa ID | Belongs to User; valid-until cannot precede valid-from; owner/visa-ID uniqueness is enforced. |
| TravelDocument | owner, type, random file reference, original name, MIME, size, upload/expiry dates | Belongs to User; expiry is nullable; file metadata is required. |
| TravelHistory | owner, country, entry/exit, purpose, visa used | Belongs to User and optionally an owned Visa; exit cannot precede entry. |
| Reminder | owner, related document type/ID, days before, enabled, archived, status | Belongs to User; polymorphic document link is validated by services and unique by owner/document/threshold. |
| Notification | owner, reminder, recipient/status/date/channel, document metadata, provider/failure metadata | Belongs to User and Reminder; unique by reminder/current expiry to deduplicate delivery. |
| DestinationChecklist | country, checklist item JSON, static-reference flag, disclaimer | Global read-only reference record with a unique country. |

The Reminder-to-document association is polymorphic. PostgreSQL cannot express one foreign key spanning three tables, so all reminder/document lookups include document type, document ID, and owner ID in service logic.

## Architecture

```text
Browser / React
      |
      | same-origin HTTPS, JSON or multipart, HTTP-only cookie
      v
Express routes -> validation -> auth/role middleware -> services
      |                    |                         | \
      |                    |                         |  -> ephemeral /tmp uploads
      v                    v                         v
Sequelize ----------> Neon PostgreSQL       reminder job -> SMTP -> mailbox
                            ^                    |
                            |                    -> Notification record
cron-job.org -> secret-protected HTTP trigger   
awake process -> daily interval fallback --------^
```

Frontend concerns are split into route pages, reusable fields/dialogs/status components, authentication context/guards, and focused API modules. Backend concerns are split into routes/controllers, validation, authentication/error/upload middleware, domain services, models, shared status utilities, and scheduler/job entry points.

Locally, Vite and Express run independently on separate ports with an exact CORS allowlist. In production, Express serves the compiled React assets and SPA fallback, while `/api/*` remains API-only. This same-origin packaging reduces cookie and CORS failure modes without coupling the source projects.

## Security controls

- bcrypt work factor validation (10–15, production default 12); plaintext passwords are never stored or logged
- JWT issuer, audience, subject, expiry, and unique token ID checks
- HTTP-only cookie; `Secure` in production; exact credentialed CORS origin; Helmet headers; auth rate limiting
- Endpoint validation with normalized inputs and consistent non-stack-trace error responses
- Ownership included in database predicates, including guessed-ID and file-retrieval paths
- User-owned Visa validation for trips
- Random private file names, signature/MIME/size validation, restrictive filesystem access, authenticated streaming, and no static upload route
- Admin aggregation selects only required metadata fields and intentionally omits raw document/file content
- Disabled-account checks on existing sessions and new logins
- Environment-only secrets, ignored `.env*`, values-only production platform configuration, and a blank `.env.example`
- A high-entropy `X-Cron-Secret` check using constant-time digest comparison; production refuses a cron secret shorter than 32 characters
- Neon PostgreSQL over TLS using an environment-only direct connection string with `sslmode=require`
- Unique database indexes for reminder thresholds and notification occurrences

## Decisions and trade-offs

### PostgreSQL and Sequelize

PostgreSQL was selected at project start and retained. Relational ownership and unique constraints fit the domain, JSONB accommodates checklist item arrays, and Sequelize keeps model validation close to the API. Production uses Neon Free rather than expiring Render Postgres. `DATABASE_URL` remains provider-neutral; the direct Neon URL is used because startup performs additive/idempotent schema setup and `sequelize.sync()` without destructive force. This is practical for Phase 1, but versioned migrations should replace it before multiple production release tracks or complex migrations.

### Computed status

Status is not persisted. It is derived on reads using the current date and active reminder thresholds, preventing stale rows and ensuring Dashboard/Documents/Reminders consume one rule. This means status aggregation loads expiry/reminder data at request time; future scale may justify SQL aggregation or cached projections with careful invalidation.

### SMTP and scheduling

Nodemailer SMTP works with multiple providers without provider-specific application code. Production has no paid Render Cron Job. A daily cron-job.org request wakes the free web service and sends `X-Cron-Secret` to an endpoint that starts the existing reminder job asynchronously. A daily in-process interval is retained as a best-effort fallback while the process is awake. Both enter a process-wide single-flight runner, and the existing unique Notification occurrence supplies cross-call deduplication. Failed delivery remains logged and retriable rather than crashing the batch.

Render Free blocks SMTP ports 25, 465, and 587, so this architecture requires a provider offering an allowed alternative such as 2525. The endpoint returns quickly after a cold start reaches Express, but delivery still depends on cron-job.org firing and the sleeping service/database waking successfully.

### Private local disk

The implemented upload service uses private local disk because Phase 1 allowed local disk or a bucket. Render Free cannot attach persistent disks, so the Blueprint uses private `/tmp` storage. Ownership/type/signature protections still apply while the process is alive, but bytes are lost on sleep, restart, or deploy; Neon retains only metadata. This is acceptable only for a hobby/demo free-tier deployment. A private object store with service-mediated retrieval is required for durable production uploads and remains outside this deployment-only task.

### Same-origin production package

React and Express stay independently runnable and testable, while the production web service serves the Vite build. This removes cross-site cookie dependencies and makes the production CORS allowlist a single exact HTTPS origin. A separate CDN/static frontend can be introduced later by setting `VITE_API_URL` and `FRONTEND_URL` precisely and retaining credentialed-cookie tests.

### Static destination information

Reference data is deliberately small, seeded, and visibly non-authoritative. No government integration was added. This protects the product boundary but means users must independently verify every current requirement.

## Full testing pass and fixes

Task 7 found coverage gaps rather than product feature defects. It added:

- visible invalid-credential browser validation;
- owner download/byte comparison plus unauthenticated/public-path denial;
- one-session status reconciliation across Documents, Dashboard, and Reminder Settings;
- dashboard reconciliation after UI edit/delete mutations;
- an unauthenticated matrix for every protected API family; and
- desktop/mobile sweeps for every public, user, form, table, reference, account, and admin page.

Final evidence was 41/41 integration tests, seven rendered browser workflows, clean desktop/mobile layout checks, a 68-module production frontend build, backend syntax checks, zero known npm vulnerabilities, and no frontend secret findings. Detailed evidence and fixed test gaps are in `TESTING_NOTES.md`.

Task 8 corrected a deployment-specific database decision: production no longer forces TLS solely because `NODE_ENV=production`. Task 9 uses that provider-neutral behavior with Neon’s `sslmode=require` URL plus `DATABASE_SSL=true`; Sequelize/node-postgres need no additional Neon dependency.

Task 9 added integration coverage proving the external trigger rejects missing/wrong secrets and that two authorized calls produce only one SMTP message/Notification occurrence. The trigger and in-process interval reuse the original Task 3 job rather than duplicating reminder logic.

## Operations

- Health: `GET /api/health`
- External reminder trigger: `GET /api/cron/run-reminders` with `X-Cron-Secret` (202 accepted; 401 on missing/wrong secret)
- Manual reminder execution: `npm run reminders:run`
- Admin role assignment: `npm run users:set-role -- <email> <user|admin>`
- Logs: Express startup/shutdown, job summaries, and notification-specific delivery failures (without secrets or plaintext passwords)
- Production deployment and rollback: see `DEPLOYMENT.md`
- Release verification: see `TESTING_NOTES.md`

## Phase 1 exclusions and known limitations

The following are explicitly not implemented, scaffolded, or implied:

- Direct visa application submission
- Government database or API integration
- Automated visa approval
- Government document verification
- Airline booking integration
- Live compliance or destination-requirement verification
- An admin path for opening another user’s raw document or file
- A support-ticket or built-in messaging system

Operational limitations:

- Static checklists cover only five example destinations.
- Email delivery depends on an external SMTP account and its reputation/limits; Render Free requires a non-blocked alternative port such as 2525.
- Render Free sleeps after 15 idle minutes. The in-process interval cannot run while asleep, and the daily reminder check depends on the external pinger waking/calling the app.
- Render Free storage is ephemeral. Uploaded file bytes disappear after sleep/restart/deploy; metadata in Neon does not restore them.
- Neon Free and Render Free have usage/storage/compute limits even though they have no configured paid resource in this Blueprint.
- Neon database recovery and ephemeral file handling are separate concerns; lost ephemeral files are unrecoverable.
- Additive startup schema management is not a substitute for long-term versioned migrations.
- The public Render deployment and real provider smoke test cannot be completed until a repository and Render credentials are provided to the deployment operator.
