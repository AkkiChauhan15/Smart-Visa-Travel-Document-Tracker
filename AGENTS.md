# AGENTS.md — Smart Visa & Travel Document Tracker

These rules apply to every task in this repo. Read this before starting any work.

## Tech Stack
- Frontend: React.js, JavaScript, HTML/CSS
- Backend: Node.js + Express.js
- Database: MongoDB or PostgreSQL (pick one at project start, stay consistent)
- Notifications: Email via SMTP/SendGrid
- Deployment target: Vercel / Render / AWS

## Architecture Rules
- Modular, scalable structure with clean separation: frontend / backend / database / auth / notifications / document management.
- Keep frontend and backend independently runnable and testable.
- Reusable components on the frontend; shared middleware/services on the backend — don't duplicate logic across routes.

## Security Requirements (non-negotiable, every feature)
- Passwords hashed (bcrypt or equivalent), never stored/logged in plaintext.
- All protected routes go through auth middleware; role-based authorization for `user` vs `admin`.
- Input validation on every API endpoint.
- File uploads: validate type/size, store securely, restrict access to the owning user.
- Users can only ever access their own documents/data — enforce this at the query level, not just the UI.
- No hardcoded credentials or API keys anywhere in source. All secrets via environment variables.
- Proper CORS configuration (no wildcard `*` in production).
- Admins must not access sensitive document contents unless explicitly required and properly authorized — log/flag any such access path.

## Scope Guardrails — DO NOT BUILD (Phase 1)
Do not implement, scaffold, or stub toward any of the following. If a task seems to require one of these, stop and flag it instead of building a placeholder:
- Direct visa application submission
- Government database/API integration
- Automated visa approval
- Airline booking integration
- Automated government document verification

Any "compliance" or "requirements" data shown to users must be clearly labeled as user-provided/static reference data, with a visible note that requirements vary by country and must be verified with official authorities. Never present it as verified or live.

## Development Rules
- Inspect the existing project before making changes — don't assume, check what's already there.
- Reuse existing code/components where appropriate; don't rewrite working code unnecessarily.
- Don't install dependencies that aren't needed for the current task.
- Build features incrementally, and test each one before moving to the next.
- A feature is only "complete" if it's actually wired end-to-end (UI → API → DB) and tested — a UI mockup with no working backend call is NOT complete. Don't mark it done otherwise.
- No meaningless placeholder/dummy data in core functionality. Realistic example data is fine for dev/demo, but must be clearly distinguishable from real user data.

## Testing Bar (before calling anything done)
- Auth flows (register/login/logout, protected routes)
- CRUD for each document type
- Expiry status calculation (valid / expiring soon / expired)
- Reminder scheduling logic
- Email notification send + status logging
- Authorization boundaries (user can't access another user's data; non-admin can't hit admin routes)
- Admin functionality
- Responsive layout check
- No build/runtime errors before handoff
