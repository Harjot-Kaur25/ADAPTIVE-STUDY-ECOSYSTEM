# Adaptive Study Ecosystem

A React + TypeScript + Vite app with a landing page, Sign In, an interactive multi-section study dashboard, Burnout insights, and detailed Settings. Supabase Auth supplies user access tokens to the Flask API; student data is scoped by that user token. The dashboard never substitutes demo student data: missing configuration and unavailable API/auth services are shown as explicit errors. Burnout remains demo-only because the Flask service has no burnout endpoint.

## Routes

- `/` — authenticated student Overview and study dashboard.
- `/landing` — cinematic product landing page.
- `/login` — Sign In through Supabase Auth when configured, otherwise the local demo flow.
- `/signup` — Supabase Auth account creation when configured, otherwise the local demo flow.
- `/dashboard` — alias for the study dashboard sections: Overview, Schedule, Subjects, Resources, Progress, and Goals.
- `/burnout` — demo-only risk summary, behavioral overview, risk trend and breakdown, adaptive response, recommended actions, and context panel.
- `/settings` — profile, education, study preferences, weekly availability, notifications, appearance/accessibility, and privacy settings.

## Structure

- `src/pages/LandingPage.tsx` — product landing page and adaptive schedule preview.
- `src/pages/AuthPage.tsx` — Supabase Auth and local demo Sign In flows.
- `src/pages/DashboardPage.tsx` — interactive dashboard sections with a fail-closed connected data path, profile completion, and backend results.
- `src/components/StudentIntake.tsx` — validated student, subject, deadline, availability, and study-session input with a review step.
- `src/pages/BurnoutPage.tsx` — frontend-only burnout risk and adaptive-planning dashboard using demo data.
- `src/data/burnoutDemoData.ts` — typed, frontend-only Burnout fixture; replace at the data boundary when a real burnout API is integrated.
- `src/services/backendServices.ts` — Supabase Auth and Flask API adapters for routes present in `ml_service/app.py`.
- `src/services/contracts.ts` — UI-facing service and data contracts.
- `src/services/index.ts` — configured backend and auth service selection; the dashboard fails closed when backend configuration is missing.
- `src/services/burnoutService.ts` — page-facing async data boundary; remains local because no backend burnout route exists.
- `src/pages/SettingsPage.tsx` — profile and availability integration plus local-only display preferences.
- `src/components/Brand.tsx` — reusable logo mark and Adaptive Study Ecosystem wordmark.
- `src/components/WorkspaceShell.tsx` — shared collapsible navigation and layout for Dashboard and Settings.
- `src/components/ScrollEffects.tsx` — scroll progress tracking.
- `src/components/` — reusable landing navigation, footer, reveal animation, and dashboard mockup.
- `src/styles.css` — responsive design system, animations, and reduced-motion overrides.
- `public/manus-routes.json` — route declarations for preview tooling.

## Run locally

```sh
pnpm install
pnpm dev
```

Create a production build with `pnpm build`. Vite uses port 3000. Google Fonts are loaded from the web with system sans-serif fallbacks.

## Backend configuration

Vite does not load `.env.example` automatically. From the `frontend` directory, copy `.env.example` to `.env.local` and set the following values. `.env.local` is ignored by Git:

- `VITE_API_BASE_URL` to the Flask origin, for example `http://127.0.0.1:5000` (do not append `/api/v1`).
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public Supabase project URL and browser-safe anon key.

The API adapter sends the signed-in Supabase **user access token** as a bearer authorization header. It never reads or embeds `SUPABASE_KEY`, service-role keys, or other backend credentials. During local Vite development, `/api/v1` requests are proxied to `VITE_API_BASE_URL`, so the browser does not require Flask CORS for that same-origin proxy. In production, configure Flask `FRONTEND_ORIGINS` with the exact frontend origin(s); Flask allows only those origins and the required `Authorization`, `Content-Type`, and `Accept` headers. The adapter uses `user_metadata.student_id` when present and otherwise uses the Supabase Auth user UUID; existing student rows must use the same ID for their owner to be resolved by the API. The dashboard requires both the API URL and Supabase public browser config and reports missing config, sign-in, HTTP, and backend errors instead of showing mock student data.

Before using student intake on an existing database, apply `ml_service/sql/04_student_intake_fields.sql` for the intake columns, `ml_service/sql/05_authenticated_data_privileges.sql` for authenticated table/sequence grants, and `ml_service/sql/06_workflow_owner_rls.sql` to ensure student-owned RLS policies are present. If an upsert returns PostgreSQL `42P10`, run `ml_service/sql/07_workflow_integrity_repair.sql` in Supabase SQL Editor; it checks for duplicates before creating missing unique indexes and restores authenticated grants and owner-scoped policies without disabling RLS or deleting data. Fresh deployments should use migration 02 plus migration 03 for profile ownership, then the additive migrations as needed. Configure `SUPABASE_SECRET_KEY` on the Flask backend only so `/health` can perform its privileged PostgREST schema check; `SUPABASE_KEY` remains the project publishable API key for user-scoped requests. Never set the secret key in a `VITE_` variable. The Flask health check reports connectivity and schema readiness separately. Configure `FRONTEND_ORIGINS` on Flask with the exact comma-separated frontend origins for production cross-origin requests. No wildcard origin is enabled.

On first dashboard access, the app fetches the authenticated student's saved profile. Missing or incomplete required data opens an editable intake and prevents prediction/schedule requests. The student reviews the complete form before submitting. New profiles use `POST /students`; existing profiles use `PUT /students/{student_id}`. The client then saves availability, requests backend priority predictions and generated schedule, and retrieves/generates resource recommendations through existing Flask routes. The Resources section prioritizes weaker subjects using saved marks and current model priorities, then presents general provider search links; individual lessons are not claimed to have been retrieved or verified. The Progress section shows saved sessions with status and a completion checkbox. Completion is persisted through the Flask session endpoint; future/current sessions remain pending, and an uncompleted session is marked missed only after its scheduled end when the schedule is fetched. Returning profiles are prefilled. Future schedule regeneration is requested only when the submitted inputs differ; completed sessions remain in history. These API integrations do not prove live Supabase persistence; verify your own Supabase project, schema migrations, policies, and health endpoint before relying on persistence.

Connected routes (all under `/api/v1`):

- `GET /students/{student_id}`, `POST /students`, and `PUT /students/{student_id}` — profile read/create/update.
- `PUT /students/{student_id}/availability` — availability and supported study preferences.
- `GET /students/{student_id}/deadlines` and `POST /students/{student_id}/deadlines` — deadline read/create service methods.
- `POST /students/{student_id}/priorities` — model priority predictions.
- `GET /students/{student_id}/schedule` and `POST /students/{student_id}/schedule` — schedule read/generation.
- `POST /students/{student_id}/subjects/{subject_id}/resources` and `GET` on the same path — generate and retrieve saved subject/topic-level search recommendations.
- `PATCH /sessions/{session_id}/status`, `POST /sessions/{session_id}/accept`, `POST /sessions/{session_id}/skip`, and `PATCH /sessions/{session_id}` — session status and schedule-edit service methods.
- `GET /students/{student_id}/progress` — lifetime totals and eligible-session count from saved session rows. The backend does not provide daily chart points, streaks, or weekly goals, so those are not fabricated when live progress loads.

The Flask service has no deadline update/delete routes, arbitrary study-block CRUD routes, profile-list-by-auth-user route, or burnout endpoint. The frontend does not invent them. Student ID/registration number is stored separately from the authenticated `student_id`; the backend associates the record with the caller's Supabase user through RLS. Student marks use the documented 0–100 scale. Failed/unavailable reads show an error and do not render mock results.
