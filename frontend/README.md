# Adaptive Study Ecosystem

A React + TypeScript + Vite app with five views: landing page, Sign In, an interactive multi-section study dashboard, Burnout insights, and detailed Settings. The existing visual design remains intact. When configured, Supabase Auth supplies user access tokens to the Flask API; student data is scoped by that user token. Without backend configuration, the app retains its local demo data and behavior. Burnout remains demo-only because the Flask service has no burnout endpoint.

## Routes

- `/` — cinematic product landing page.
- `/login` — Sign In through Supabase Auth when configured, otherwise the local demo flow.
- `/signup` — Supabase Auth account creation when configured, otherwise the local demo flow.
- `/dashboard` — Overview, Schedule, Subjects, Progress, and Goals sections, navigated from the in-page sidebar.
- `/burnout` — demo-only risk summary, behavioral overview, risk trend and breakdown, adaptive response, recommended actions, and context panel.
- `/settings` — profile, education, study preferences, weekly availability, notifications, appearance/accessibility, and privacy settings.

## Structure

- `src/pages/LandingPage.tsx` — product landing page and adaptive schedule preview.
- `src/pages/AuthPage.tsx` — Supabase Auth and local demo Sign In flows.
- `src/pages/DashboardPage.tsx` — interactive dashboard sections with safe demo fallback and connected schedule, priorities, deadlines, and progress data.
- `src/pages/BurnoutPage.tsx` — frontend-only burnout risk and adaptive-planning dashboard using demo data.
- `src/data/burnoutDemoData.ts` — typed, frontend-only Burnout fixture; replace at the data boundary when a real burnout API is integrated.
- `src/services/backendServices.ts` — Supabase Auth and Flask API adapters for routes present in `ml_service/app.py`.
- `src/services/contracts.ts` — UI-facing service and data contracts.
- `src/services/index.ts` — configured backend selection and demo fallback.
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

Copy `.env.example` to `.env.local` and set:

- `VITE_API_BASE_URL` to the Flask origin, for example `http://127.0.0.1:5000` (do not append `/api/v1`).
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public Supabase project URL and browser-safe anon key.

The API adapter sends the signed-in Supabase **user access token** as a bearer authorization header. It never reads or embeds `SUPABASE_KEY`, service-role keys, or other server credentials. During local Vite development, `/api/v1` requests are proxied to `VITE_API_BASE_URL` to avoid cross-origin browser restrictions. The current adapter uses the Supabase Auth user UUID as `student_id`, unless `user_metadata.student_id` is set. Existing student rows must use that same ID for their owner to be resolved through the available routes.

Connected routes (all under `/api/v1`):

- `GET /students/{student_id}` and `PUT /students/{student_id}` — profile read/update.
- `PUT /students/{student_id}/availability` — availability and supported study preferences.
- `GET /students/{student_id}/deadlines` and `POST /students/{student_id}/deadlines` — deadline read/create service methods.
- `POST /students/{student_id}/priorities` — model priority predictions.
- `GET /students/{student_id}/schedule` and `POST /students/{student_id}/schedule` — schedule read/generation.
- `PATCH /sessions/{session_id}/status`, `POST /sessions/{session_id}/accept`, `POST /sessions/{session_id}/skip`, and `PATCH /sessions/{session_id}` — session status and schedule-edit service methods.
- `GET /students/{student_id}/progress` — lifetime saved-session totals. The backend does not provide daily chart points, streaks, or weekly goals, so those are not fabricated when live progress loads.

The Flask service has no deadline update/delete routes, arbitrary study-block CRUD routes, profile-list-by-auth-user route, or burnout endpoint. The frontend does not invent them. Although the backend exposes `POST /students` for profile creation, it requires at least one fully specified subject, which the existing sign-up form does not collect; initial profiles must already exist in the backend or be created through an authorized backend-supported workflow. Production deployments on separate frontend/backend origins need a same-origin reverse proxy or CORS configuration outside this frontend, because `ml_service` was left unchanged. Failed/unavailable reads retain demo fixtures and show visible status/error text.
