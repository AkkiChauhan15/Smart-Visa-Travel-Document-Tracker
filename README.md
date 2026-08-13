# Smart Visa & Travel Document Tracker

A full-stack application for storing travel-document records, tracking expiry dates, configuring email reminders, recording trips, and viewing user or aggregate admin summaries.

All document and compliance status is based only on data entered by users. Destination checklists are static reference data, are not live-verified, and must be checked with current official authorities.

## Deployment status

The production configuration is ready for Render, but this workspace is not connected to a Git host or Render account, so no public deployment has been created yet. See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact runbook. Replace this section with the public HTTPS URL after the first deployment and smoke test.

## What is implemented

- Email/password registration, login, logout, HTTP-only JWT sessions, and `user`/`admin` authorization
- Ownership-scoped CRUD for passports, visas, supporting travel documents, and travel history
- Private PDF/JPG/PNG uploads with server-side signature and size validation
- Server-derived Valid, Expiring soon, Expired, and No expiry statuses
- Default and custom reminder thresholds, SMTP delivery, deduplication, and notification history
- A user dashboard with document counts, upcoming reminders, recent trips, and a stored-data status rollup
- Seeded destination checklist reference data with an explicit official-source disclaimer
- An admin-only user list and aggregate platform statistics without raw document contents
- Responsive React pages for desktop and mobile

## Tech stack

- Frontend: React 19, React Router, Vite, JavaScript, HTML, and CSS
- Backend: Node.js 20+, Express 5, Sequelize, and PostgreSQL
- Authentication: bcrypt password hashes and signed JWTs in HTTP-only cookies
- Email: Nodemailer over SMTP
- Production: Render web service, Render Postgres, persistent disk, and Render Cron Job

## Repository layout

```text
frontend/             React application and reusable UI/API modules
backend/src/          Express routes, middleware, models, services, and jobs
backend/test/         Integration tests against a dedicated PostgreSQL database
backend/scripts/      Browser verification, reminder runner, and operator scripts
docker-compose.yml    Local PostgreSQL service
render.yaml           Production infrastructure definition
DEPLOYMENT.md         Production and redeployment runbook
PRD.md                Product and technical documentation
TESTING_NOTES.md      Task 7 failures, fixes, and final verification evidence
```

The frontend and backend remain independently runnable locally. Production builds the React app and serves it through Express under one HTTPS origin; API requests use `/api`.

## Local setup

### Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL 15+ or Docker with Compose
- An SMTP account only if you want to exercise real reminder delivery
- Chrome or Chromium only for the rendered browser verification scripts

### 1. Install dependencies

From the repository root:

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Fill the local values in `.env`. A normal Docker-based setup uses these categories:

| Variable | Local purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Use `development` and `3000`. |
| `DATABASE_URL` | PostgreSQL URL consumed by the API. It must match the Compose credentials and port. |
| `DATABASE_SSL` | Use `false` for local PostgreSQL. External managed database URLs normally use `true` or `?sslmode=require`. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Values used by Docker Compose. Use a development-only password. |
| `JWT_SECRET` | A long random value; generate one with `openssl rand -base64 48`. |
| `FRONTEND_URL` | Exact browser origin, normally `http://localhost:5173`; comma-separated origins are supported. |
| `VITE_API_URL` | Normally `http://localhost:3000/api`. |
| `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` | Normally `1h` and `12`. |
| `COOKIE_SECURE` | `false` for local HTTP and `true` for production HTTPS. |
| `UPLOAD_DIR` | Optional private upload directory; defaults to `backend/storage/uploads`. Never put it in a public directory. |
| `MAX_UPLOAD_BYTES`, `VITE_MAX_UPLOAD_BYTES` | Matching upload limits; `5242880` is 5 MB. The backend limit is authoritative. |
| `SERVE_FRONTEND` | `false` while Vite runs separately; production uses `true`. |
| `FRONTEND_DIST_DIR` | Optional React build directory override. |

For email reminders, set `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE`. Set `SMTP_USER` and `SMTP_PASSWORD` together when authentication is required. `SMTP_CONNECTION_TIMEOUT_MS` defaults to `10000`. `SENDGRID_API_KEY` is reserved but not used by the implemented SMTP transport.

For local scheduling, set `REMINDER_JOB_ENABLED=true` to run the lightweight interval scheduler with the API. `REMINDER_JOB_INTERVAL_MS` defaults to one day, and `REMINDER_RUN_ON_STARTUP` controls an immediate run. Leave these disabled when using an external scheduler.

### 3. Start PostgreSQL

```bash
docker compose up -d database
docker compose ps
```

The API performs non-destructive Sequelize table/column/index setup and seeds five static destination checklists on startup.

### 4. Run both apps

Terminal one:

```bash
npm run dev:backend
```

Terminal two:

```bash
npm run dev:frontend
```

Open `http://localhost:5173`, register, and sign in. The token is stored only in an HTTP-only cookie, not local storage.

### 5. Create an admin account when needed

Register the account normally, then run this operator command against the same database:

```bash
npm run users:set-role -- admin@example.com admin
```

Log out and back in so the new role is included in a fresh session token. The application intentionally has no public admin-registration path.

## Build and run the production artifact locally

```bash
npm run build
NODE_ENV=production \
DATABASE_SSL=false \
COOKIE_SECURE=false \
SERVE_FRONTEND=true \
npm start --prefix backend
```

This command also reads the remaining values from `.env`. Open `http://localhost:3000`; deep React routes are served by the SPA fallback, while unknown `/api/*` paths remain JSON 404 responses.

## Tests and verification

The integration suite resets its database schema. Never point it at development or production data. Create a dedicated database whose name contains `test`, then run:

```bash
NODE_ENV=test \
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/svt_test \
DATABASE_SSL=false \
JWT_SECRET=a-dedicated-test-secret-at-least-32-characters \
FRONTEND_URL=http://127.0.0.1:4173 \
COOKIE_SECURE=false \
npm test
```

Build and dependency checks:

```bash
npm run build
npm audit --prefix backend
npm audit --prefix frontend
```

Rendered browser checks require a running backend and built frontend preview against a disposable verification database. Configure `UI_BASE_URL`, `API_BASE_URL`, and optionally `CHROME_BIN`, then use:

```bash
npm run verify:ui
npm run verify:documents-ui
npm run verify:reminders
npm run verify:travel-ui
npm run verify:dashboard-ui
npm run verify:admin-ui
npm run verify:responsive-ui
```

The Task 7 release pass completed 41/41 backend integration tests, all seven rendered browser workflows, both mobile and desktop page sweeps, a fresh frontend build, and zero-vulnerability npm audits. See [TESTING_NOTES.md](TESTING_NOTES.md) for the test matrix and fixes made during that pass.

## Reminder operations

Run the same one-shot command used by the production Cron Job:

```bash
npm run reminders:run
```

The job reads each user’s active thresholds, logs sent or failed attempts in `notifications`, and relies on a unique reminder/expiry occurrence to avoid duplicate sends. A failed occurrence is eligible for retry; a sent occurrence is not sent again.

## Security notes

- Passwords are bcrypt-hashed and excluded from normal model queries and API responses.
- Protected routes authenticate the cookie token and reject disabled accounts; admin routes also require the `admin` role.
- Ownership is included in document, trip, reminder, notification, and file queries.
- Uploads use random storage names, private permissions, byte-signature/type/size checks, and authenticated retrieval. The storage directory is not statically served.
- Production CORS allows only the configured application origin; `*` is never used with credentials.
- The production database uses Render’s internal URL and blocks external access by default.
- Admin statistics expose aggregate/operational metadata, not passport numbers, visa IDs, upload names/references, or file bytes.
- `.env` and all `.env.*` files are ignored except `.env.example`. Real secrets belong only in local untracked files or deployment-platform settings.

## Known limitations and Phase 1 exclusions

- No direct visa application submission
- No government database or API integration
- No automated visa approval or government-document verification
- No airline booking integration
- No live compliance or destination-requirement verification
- Destination checklist entries are a small seeded reference set, not authoritative advice
- Uploaded files use one Render persistent disk, so the web service is intentionally single-instance until storage is moved to a private object store
- Schema setup is handled by additive application startup logic rather than a versioned migration framework

See [PRD.md](PRD.md) for the complete feature, data model, architecture, security, and decision record.
