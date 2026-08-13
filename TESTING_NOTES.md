# Full Application Testing Notes

Release-candidate verification date: 2026-08-13

These notes capture the Task 7 whole-application pass so the verified behavior and any fixes can be carried into the README/PRD during Task 8.

## Environment

- PostgreSQL: dedicated local test container and test-only database
- Backend: production entry point with `NODE_ENV=test`; reminder scheduler disabled except for explicit manual-job tests
- Frontend: fresh Vite production build served through `vite preview`
- Browser: fresh temporary headless Chrome profiles with HTTP-only cookie sessions
- Viewports: 1280×900 desktop and 390×900 mobile

## Failures and fixes

| Area | Failure | Fix | Recheck |
| --- | --- | --- | --- |
| Authentication coverage | The existing rendered-UI check tested successful login but not the visible invalid-credential response. | Added a wrong-password submission that must remain on `/login` and display `Invalid email or password` before the successful login. | Passed in a fresh Chrome profile. |
| Private-file coverage | Owner download bytes were covered by integration tests, while the browser workflow only covered upload and cross-user denial. | Added a rendered Download-button check, Chrome download event, downloaded-byte comparison, unauthenticated denial, and guessed public-path denial. | Passed; the downloaded PNG exactly matched the uploaded file. |
| Cross-page expiry coverage | Status was tested on individual pages but not reconciled across Documents, Dashboard, and Reminder Settings in one session. | Added one-session assertions for the same expiring and expired records on all three pages, plus exact 90/60/30 defaults. | Passed with identical status counts/badges. |
| Dashboard mutation coverage | Refresh after additions was covered, but edit/delete refresh behavior was not exercised end to end. | Added a UI expiry edit, UI document deletion, UI trip deletion, and dashboard count/recent-trip reconciliation after each mutation. | Passed with manually expected counts after every refresh. |
| Protected-route coverage | Representative protected endpoints were tested, but there was no single matrix covering every route family. | Added `system-boundaries.integration.test.js` covering Dashboard, all document types, reminders, notifications, trips, destination references, and admin APIs without authentication. | All protected families returned `401`; public health remained `200`. |
| Responsive coverage | Individual feature scripts checked selected pages, not every page/form at both required widths. | Added a fresh-session sweep for every public, user, form, table, checklist, account, and admin page at 1280×900 and 390×900. The sweep detects document overflow, clipped controls, overlapping navigation, invalid rendered values, console errors, and uncaught exceptions. | All pages passed at both widths with zero captured runtime errors. |

No application feature defect was found during Task 7, so no production feature logic was changed. The changes above strengthen automated release verification and close seams that earlier task-specific checks did not cover together.

## Final verification evidence

### Automated integration and build health

- Backend: 41 tests across 8 suites, 41 passed, 0 failed/cancelled/skipped.
- Frontend: fresh Vite production build completed successfully (68 modules transformed).
- JavaScript syntax: every backend source, integration test, and verification script passed `node --check`.
- Dependency audit: backend and frontend each reported 0 known vulnerabilities.
- Secret scan: no JWT, SMTP, SendGrid, PostgreSQL password, password-hash, or corresponding environment keys were found in frontend source/build output. `.env.example` contains names only and `.env*` remains ignored except for the example.

### Authentication and authorization

- Registration reached the API and PostgreSQL contained a bcrypt hash rather than plaintext.
- Invalid credentials produced a sensible rendered error; valid login established the HTTP-only cookie session; logout cleared it.
- A fresh unauthenticated browser was redirected away from protected UI routes.
- Every protected API family returned `401` without authentication.
- User-role sessions received `403` from all admin APIs and were redirected away from `/admin`.
- Admin-role sessions could reach the panel and APIs.
- Disabled accounts lost existing API access immediately and could not log in until re-enabled.

### CRUD, uploads, and ownership

- Passport, Visa, and TravelDocument were created, read, edited, and confirmation-deleted through React and verified in PostgreSQL.
- TravelHistory was created with an owned Visa, edited, listed, and confirmation-deleted through React.
- A genuine PNG was uploaded through the UI, stored under a random reference with private permissions, downloaded through the rendered Download action, and byte-compared with its source.
- Forged-content and oversized uploads were rejected by the backend (`415` and `413`).
- Unauthenticated file retrieval returned `401`; guessed public storage paths returned `404`; a second user received `404` for guessed record and file endpoints.
- A second user could not list/read/edit/delete the first user's documents or trips and could not force-reference the first user's Visa.

### Status, reminders, notifications, and dashboard

- Manually selected valid, 20-day, and past-date records produced Valid, Expiring soon, and Expired respectively.
- Documents, Dashboard, and Reminder Settings displayed consistent status for the same records.
- Default thresholds were exactly 90/60/30; a custom 25-day threshold persisted and was the only enabled threshold used by the job.
- The job performed a real SMTP protocol delivery to the local capture server and created a sent Notification.
- An immediate second run produced no duplicate notification.
- A refused SMTP connection created a failed Notification without crashing the job; sent and failed rows rendered in Notification History.
- Dashboard counts matched document API statuses, showed a correct empty account, and updated after add, expiry edit, document delete, and trip delete operations.

### Admin, travel reference, and disclosure boundaries

- Admin user/activity rows and document/reminder/notification/compliance/usage aggregates matched direct database counts.
- Admin account enable/disable worked; self-disable was unavailable.
- Admin API/page output did not contain seeded passport numbers, Visa IDs, file references/names, email subjects, recipient addresses, document labels, or file contents.
- Destination checklists loaded seeded reference data and displayed the non-live, official-authority disclaimer prominently in the viewport.

### Responsive and clean-session runtime

- Checked at 1280×900 and 390×900: Login, Register, Dashboard, Travel Documents, Add Passport, Add Visa, Add Supporting Document, Edit Document, Reminder Settings, Notification History, Travel History, Add Trip, Edit Trip, Destination Checklist, Account, and Admin Panel.
- No document-level horizontal overflow, clipped interactive controls, overlapping navigation, `NaN`/`undefined` text, uncaught browser exceptions, or console errors were detected.
- Fresh user and admin browser journeys used a newly created Chrome profile. Both retained zero local/session storage entries; authentication remained cookie-based.

### Task 8 handoff note

External deployment and delivery through production SMTP credentials were intentionally not attempted here. Task 7 verified the real SMTP transport path against a local protocol receiver; deployment/provider configuration remains Task 8 scope.
