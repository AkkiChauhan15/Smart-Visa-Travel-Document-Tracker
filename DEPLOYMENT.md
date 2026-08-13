# Zero-Cost Render + Neon Deployment Runbook

This setup is designed to remain within the documented free tiers for a hobby/demo deployment:

- one Render Free web service for Express and the compiled React app;
- one Neon Free PostgreSQL project for durable relational data; and
- one free cron-job.org schedule that calls a secret-protected HTTP trigger.

There is no Render Cron Job, Render database, or persistent Render disk in `render.yaml`. Always review the providers’ current quotas and pricing before creating resources; free-tier terms can change.

## Architecture and trade-offs

The public web service serves React and `/api` under one HTTPS origin. It connects to Neon using `DATABASE_URL`. Reminder checks share one implementation and can start from either:

- the daily in-process interval while the Render process happens to be awake; or
- `GET /api/cron/run-reminders`, called by cron-job.org with `X-Cron-Secret`.

The HTTP endpoint returns `202 Accepted` as soon as it starts the check. Email delivery continues asynchronously. A process-wide single-flight runner prevents overlapping timer/HTTP runs, and the existing database notification-occurrence constraint prevents duplicate successful sends if the endpoint is called again.

The zero-cost trade-offs are material:

- Render Free spins down after 15 minutes without inbound traffic. A cold request can take about a minute, and the in-process timer does not run while the service is asleep.
- The external pinger is therefore the primary reminder trigger. If it does not execute or cannot wake the service, that day’s check can be missed.
- Render Free has an ephemeral filesystem and cannot attach a persistent disk. Uploaded file bytes under `/tmp/svt-uploads` disappear after a spin-down, restart, or deploy. Their PostgreSQL metadata remains, but the file can no longer be downloaded. Durable production uploads require private object storage, which is outside this deployment-only task.
- Render Free blocks outbound SMTP ports 25, 465, and 587. Use an SMTP provider that supports an allowed alternative submission port such as 2525, and confirm that port is available on the provider’s current plan.
- Render and Neon both enforce monthly free quotas. Exceeding them can suspend service or require an upgrade.

## Prerequisites

- A GitHub, GitLab, or Bitbucket repository containing this project
- Free Render, Neon, and cron-job.org accounts
- An SMTP account with a verified sender and an alternative port accepted by Render Free
- Green local tests/build and a clean secret scan

Never commit `.env`, a Neon URL, `CRON_SECRET`, SMTP credentials, or JWT secrets.

## 1. Create the Neon database

1. Sign in to Neon and create a Free project in a region close to the Render service when possible. Unlike Render’s former 30-day free database, Neon’s current Free plan has no time limit, subject to its storage/compute quotas.
2. Open the project’s **Connect** dialog.
3. Select the direct connection, not the `-pooler` hostname. The application performs Sequelize schema setup during startup, for which Neon recommends a direct connection.
4. Copy the full connection string. Its shape is:

```text
postgresql://ROLE:PASSWORD@ep-example.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

5. Keep it in a password manager until entering it into Render. Do not add it to any tracked file.

The application already reads the database exclusively from `DATABASE_URL`. `sslmode=require` is detected, and `DATABASE_SSL=true` in the Blueprint explicitly enables TLS for Sequelize/node-postgres. No Neon-specific package is required.

## 2. Prepare deployment secrets

Generate independent high-entropy values:

```bash
openssl rand -base64 48  # JWT_SECRET, if not using Render generation
openssl rand -hex 32     # CRON_SECRET
```

Render generates `JWT_SECRET` from the Blueprint. Store `CRON_SECRET` securely; the exact same value will be entered in Render and the cron-job.org request header.

## 3. Push a private Git repository

If this directory is not yet a Git repository:

```bash
git init
git add .
git status --short
git commit -m "Prepare free-tier deployment"
git branch -M main
git remote add origin <repository-url>
git push -u origin main
```

Before committing, confirm `.env` is absent from `git status --short`. The tracked deployment files should include `render.yaml`, `.env.example`, `README.md`, `PRD.md`, and this runbook.

## 4. Deploy the Render Blueprint

1. In Render, choose **New > Blueprint** and connect the repository.
2. Select the deployment branch and root `render.yaml`.
3. Confirm the Blueprint proposes exactly one `web` service on plan `free`. It must not propose a Cron Job, PostgreSQL resource, or disk.
4. Enter prompted values directly in Render:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | The complete direct Neon connection string. |
| `CRON_SECRET` | The generated 64-character hexadecimal secret. |
| `EMAIL_FROM` | A sender verified by the SMTP provider. |
| `SMTP_HOST` | Provider SMTP hostname. |
| `SMTP_PORT` | An allowed alternative such as `2525`; not 25/465/587 on Render Free. |
| `SMTP_SECURE` | Normally `false` for STARTTLS on 2525; follow provider documentation. |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials, entered only in Render. |

5. Create the service and wait for its health check to pass.

The Blueprint supplies `DATABASE_SSL=true`, `COOKIE_SECURE=true`, `SERVE_FRONTEND=true`, a daily in-process interval, and ephemeral `UPLOAD_DIR=/tmp/svt-uploads`. Render supplies `RENDER_EXTERNAL_URL`; the backend uses it as the exact credentialed CORS origin when `FRONTEND_URL` is absent.

## 5. Confirm the web service

Replace `<web-host>` with the assigned hostname:

```bash
curl --fail --show-error https://<web-host>/api/health
curl --fail --show-error https://<web-host>/login
curl --output /dev/null --write-out '%{http_code}\n' https://<web-host>/storage/guess.pdf
```

Expected results are `{"status":"ok"}`, the React HTML shell, and `404`. In Render logs, confirm database authentication/schema setup and `API listening on port ...` without repeated restarts.

## 6. Configure cron-job.org

Create a cron job with:

| Setting | Value |
| --- | --- |
| URL | `https://<web-host>/api/cron/run-reminders` |
| Method | `GET` |
| Header | `X-Cron-Secret: <the exact CRON_SECRET stored in Render>` |
| Schedule | Daily at the desired UTC time |
| Request timeout | Use the maximum available, ideally 300 seconds, to allow for a Render/Neon cold start |
| Failure notification | Enabled |

Use a request header, not `?secret=...`, so the secret is not placed in URL/access logs. cron-job.org supports custom request headers.

For cold-start resilience, schedule a second call five minutes after the primary call (for example, 02:00 and 02:05 UTC). This is not a keep-awake scheme; it is one bounded retry. Duplicate calls are safe because a sent reminder/expiry occurrence cannot be claimed twice.

Test authentication before enabling the schedule:

```bash
# Must return 401
curl --output /dev/null --write-out '%{http_code}\n' \
  https://<web-host>/api/cron/run-reminders

# Must return 202; substitute the secret locally without saving it in shell history
curl --request GET \
  --header "X-Cron-Secret: $CRON_SECRET" \
  https://<web-host>/api/cron/run-reminders
```

A successful response is `202` with `status: "accepted"`. `started: false` means another timer or HTTP trigger is already running; it is still a successful/safe request.

## 7. Verify reminders and deduplication

1. Create a document with an enabled threshold that is currently due.
2. Manually execute the cron-job.org job.
3. Confirm Render logs show `Reminder job (external-http-trigger) finished`.
4. Confirm the real mailbox receives one message and Notification History shows `sent`.
5. Execute it again immediately. Confirm no second email appears and only one Notification occurrence exists for that reminder/current expiry.
6. Observe the first automatic daily run in cron-job.org history and Render logs. Do not assume configuration is correct until this occurs.

To test failure handling, temporarily apply a controlled invalid SMTP credential, create a new due occurrence, trigger once, and confirm Notification History records `failed` without crashing the web process. Restore valid SMTP configuration immediately and retry.

## 8. Bootstrap an administrator

Render Free does not provide a service shell. Register the account normally, then run the operator CLI locally while your untracked `.env` temporarily points to the production Neon database:

```bash
npm run users:set-role -- admin@example.com admin
```

Keep the Neon URL only in the ignored `.env`, restore your development URL afterward, and never run tests against Neon production. Log out and back in after the role change.

## Production smoke test

1. Register and log in from a clean browser profile; verify invalid credentials and logout.
2. Add Passport, Visa, and TravelDocument records and reconcile the dashboard counts.
3. Upload/download a small genuine PDF/JPG/PNG while the instance is awake; verify signed-out and second-user requests are denied.
4. Recognize that the uploaded bytes will be lost on the next Render spin-down/restart/deploy. Do not use this tier for durable document storage.
5. Add a trip linked to the account’s own Visa and verify Dashboard/Travel History.
6. Customize a reminder and perform the external-trigger checks above.
7. Confirm the destination disclaimer is visible.
8. Confirm a normal user receives 403 from admin APIs and an admin sees aggregate data without raw document contents.
9. Record the final HTTPS URL and smoke-test date in `README.md`.

## Redeploy, rotate, and recover

- Push a tested commit; Render rebuilds the single web service. Check health, deep routes, database connection, and cron trigger afterward.
- Sync `render.yaml` changes carefully and confirm only one free web service remains.
- Rotating `JWT_SECRET` signs out every session.
- Rotate `CRON_SECRET` in Render and cron-job.org together. During a mismatch, triggers return 401 and reminders do not run.
- Disable the cron-job.org schedule while investigating repeated SMTP failures. The awake-process interval may still run; set `REMINDER_JOB_ENABLED=false` temporarily in Render if complete suspension is required.
- Use Neon’s available restore/export features within the current plan. Integration tests must never target the production database.
- Ephemeral uploads cannot be recovered after Render discards them. Database recovery does not restore file bytes.

## Handoff checklist

- [ ] Blueprint shows one Free web service and no Cron/Render Postgres/disk resource
- [ ] Neon direct URL stored only as Render `DATABASE_URL`; TLS connection succeeds
- [ ] `CRON_SECRET` stored only in Render and cron-job.org header configuration
- [ ] `/api/health`, React deep links, and expected private-path 404 work
- [ ] Register/login/logout and production database writes work
- [ ] Upload access controls work; ephemeral-loss limitation accepted
- [ ] SMTP provider works through an allowed Render Free outbound port
- [ ] Trigger without/wrong secret returns 401; correct secret returns 202
- [ ] Two consecutive correct triggers deliver no duplicate notification
- [ ] Automatic cron-job.org execution observed, including cold-start behavior
- [ ] In-process fallback is enabled with a daily interval
- [ ] Normal user/admin boundaries and aggregate disclosure checks pass
- [ ] No `.env`, Neon URL, cron secret, SMTP password, or JWT secret is tracked
