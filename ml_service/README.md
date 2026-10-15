# Adaptive Study Ecosystem — backend handoff

This is the **backend/ML component only**. It has no HTML, CSS, JavaScript,
frontend, or dashboard routes. The Flask JSON API stores student data in the
existing Supabase project, predicts subject priorities with the saved
scikit-learn model, schedules sessions inside declared availability, and
returns educational-provider search suggestions without inventing lesson URLs.

## Current Supabase schema and migration

I queried the configured project’s live PostgREST/OpenAPI schema. The existing
resources are:

| Table | Confirmed existing columns |
|---|---|
| `students` | `student_id`, `student_name`, `number_of_subjects`, `created_at`, `auth_user_id` |
| `subjects` | `subject_id`, `subject_name`, `created_by` after migration 03 |
| `student_subjects` | `student_id`, `subject_id`, `previous_marks`, `exam_count`, session counts, `active` |
| `student_availability` | `availability_id`, `student_id`, `day_of_week`, `start_time`, `end_time` |
| `academic_deadlines` | `deadline_id`, `student_id`, `subject_id`, `deadline_type`, `title`, `due_date`, `notes`, `created_at` |
| `subject_priorities` | `prediction_id`, `student_id`, `subject_id`, `predicted_priority`, `previous_marks`, `missed_sessions_count`, `reason`, `predicted_at` |
| `study_sessions` | `session_id`, `student_id`, `subject_id`, `session_date`, `start_time`, `end_time`, `duration_minutes`, `status`, `completed_at`, `created_at` |
| `study_goals` | `goal_id`, `student_id`, `goal_description`, `target_date`, `status` |
| `notifications` | `notification_id`, `student_id`, `message`, `alert_at`, `status`, `created_at` |

The connected database returned HTTP 200 for schema discovery and safe
zero-row reads. The live health endpoint reports `status: ok`,
`schema_ready: true`, and no missing schema. Two independent Supabase Auth
test users were used to exercise profile ownership through the API.

The database metadata confirms the ownership join used below:
`student_subjects.student_id` is a foreign key to `students.student_id`, and
`student_subjects.subject_id` is a foreign key to `subjects.subject_id`.
`students.auth_user_id` is nullable UUID. The authenticated role already has
SELECT, INSERT, and UPDATE grants on `students`; the corrective migration
also grants only those operations to `student_subjects` and `subjects`, with
the row policies below limiting which rows are visible or writable.

The live schema includes the base columns and
`study_preferences`/`resource_recommendations`. `sql/02_supabase_backend_migration.sql`
is the base additive migration; do not rerun it blindly. The corrective
`sql/03_profile_owner_rls.sql` has been applied. It adds `subjects.created_by`
so new catalog entries can also be owner-scoped, replaces the known legacy
named subject policies, and installs owner-bound SELECT/INSERT/UPDATE
policies plus restrictive ownership fences. Those fences prevent any other
permissive policy from widening access. The migration does not disable RLS
or change student rows.

The project also contains `sql/00_verify_existing_schema.sql` and
`sql/01_create_recommendation_table.sql` from the earlier Oracle prototype.
They are Oracle-specific, are **not** used by this Supabase backend, and
should not be run in Supabase.

`resource_recommendations` is not among the original live Supabase tables;
the migration adds it. The resource endpoint persists subject/topic search
queries for named educational providers. It does not claim individual
URLs/lessons were verified.

**SQL execution order:** the existing deployment already has the base schema
and corrective profile-owner policies. Do not rerun either migration against
that deployment. For a fresh matching project, review and apply the base
migration before the profile-owner correction.
The files `sql/00_verify_existing_schema.sql` and
`sql/01_create_recommendation_table.sql` are legacy Oracle scripts and are not
part of this Supabase setup.

## Authentication and Row Level Security

All student-data endpoints require:

```http
Authorization: Bearer <signed-in-user Supabase access token>
Content-Type: application/json
```

The frontend teammate should sign the student in using Supabase Auth and send
the **user access token** with each request. The backend uses `SUPABASE_KEY`
only as the server-side PostgREST API key; it sends the signed-in user token as
the Authorization bearer so Supabase verifies it and applies that user's RLS
policies. The key in `.env` is a server-side secret key: never place it in
browser code, logs, or commits. The migration links `students.auth_user_id` to
`auth.uid()` and scopes related records through that owned student row.

The server key and integration test login are configured locally and are not
shown in this document. Do not work around RLS failures by putting the server
key in `Authorization` or disabling RLS. If checking current policies before
the corrective migration, use this read-only query:

```sql
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('students', 'student_subjects', 'subjects')
ORDER BY tablename, policyname;
```

New subject IDs must be unique in the shared catalog. A subject row is visible
to its creator and to authenticated users whose owned student profile is
related to it; student marks/progress remain scoped through the verified
`student_subjects.student_id` foreign key.

## Local setup

Open PowerShell in this folder:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe generate_data.py
.\.venv\Scripts\python.exe train_model.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe app.py
```

The API listens at `http://127.0.0.1:5000`. `ml_service/.env` must contain:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_server_side_key
```

`db.py` also recognizes the Supabase dashboard project URL currently in the
local `.env` and resolves its project reference to the API hostname. The
preferred configuration is the project API URL. `.env` is ignored by
`.gitignore`; `.env.example` contains placeholders only.

## ML method and limitations

The retained synthetic dataset is for training/evaluating the ML component,
not database storage. It contains no real Oracle/Supabase student records.
The Random Forest uses the saved `Pipeline` (`SimpleImputer` plus classifier)
and five numeric features: average marks, exam count, total completed study
hours, completed sessions, and missed sessions. IDs and names are not model
features.

Its synthetic training target follows:

- `HIGH` if marks < 50 or missed sessions >= 5.
- Otherwise `MEDIUM` if marks < 70 or missed sessions >= 3.
- Otherwise `LOW`.

Dates and assignments are not model inputs: they affect scheduling urgency
and explanations, not the trained prediction. Held-out results measure
agreement with these simulated labels only, not real-world accuracy or
calibrated probabilities. The model is loaded by Flask; training is a separate
command and is not run at server startup.

## API contract

All request bodies are JSON. Student IDs and subject IDs are strings in the
current Supabase schema. Weekday values are `0=Monday` through `6=Sunday`.
Times use 24-hour `HH:MM`. Session preference is `1h`, `2h`, or `2-3h`;
`break_minutes` is an integer from 0 to 60.

### Health

`GET /health` or `GET /api/v1/health`

Reports whether the API is configured, whether Supabase schema discovery
succeeded, which required migration columns are missing, and whether the
model loaded. It does not expose credentials or query student records.

### Create/update a profile

`POST /api/v1/students` creates or idempotently upserts a profile (`201`
created, `200` existing profile updated). `PUT /api/v1/students/{student_id}`
updates the matching profile (`200`). Both accept:

```json
{
  "student_id": "student-123",
  "student_name": "Example Student",
  "subjects": [
    {
      "subject_id": "math-1",
      "subject_name": "Mathematics",
      "previous_marks": 55,
      "exam_count": 2,
      "completed_sessions_count": 0,
      "missed_sessions_count": 0,
      "exam_date": "2026-11-15",
      "deadlines": [
        {
          "deadline_type": "assignment",
          "title": "Algebra practice",
          "due_date": "2026-11-10",
          "notes": "Chapter 4"
        }
      ]
    }
  ]
}
```

Baseline session counts are optional historical aggregates; ordinary initial
profile creation can leave them at zero. New individual sessions are counted
from saved session history. Updating a profile upserts supplied subjects and
marks omitted existing subject relations inactive; it does not delete
database records.

`GET /api/v1/students/{student_id}` returns the owned profile, active subjects,
availability, preferences, and deadlines. RLS hides other students' data.

### Availability and preferences

`PUT /api/v1/students/{student_id}/availability`

```json
{
  "periods": [
    {"day_of_week": 0, "start_time": "14:00", "end_time": "17:00"},
    {"day_of_week": 2, "start_time": "09:00", "end_time": "12:00"}
  ],
  "preferred_session": "2h",
  "break_minutes": 15
}
```

Returns the stored periods and preferences. Overlapping or invalid periods are
rejected with 400.

### Deadlines and priorities

- `GET /api/v1/students/{student_id}/deadlines`
- `POST /api/v1/students/{student_id}/deadlines` with
  `{"subject_id":"math-1","deadline_type":"assignment","title":"Essay","due_date":"2026-11-10","notes":""}`
- `POST /api/v1/students/{student_id}/priorities`

Priority response includes predictions, model scores, factors, and study
suggestions per subject. Its `score_note` warns that the scores are learned
from synthetic rule-generated data. Deadline urgency is called out separately
and does not alter the model score.

### Schedule and session tracking

- `POST /api/v1/students/{student_id}/schedule` with optional
  `{"start_date":"2026-10-19","horizon_days":14}`. The server dynamically
  combines active availability, preferences, priorities, workload estimates,
  deadlines, and existing sessions. Response includes `sessions`,
  `new_sessions`, and `unscheduled_work`.
- `GET /api/v1/students/{student_id}/schedule` returns upcoming and past
  sessions separately.
- `POST /api/v1/sessions/{session_id}/accept` accepts a pending session.
- `PATCH /api/v1/sessions/{session_id}` edits its date/time, rejecting times
  outside availability or overlapping another planned session.
- `POST /api/v1/sessions/{session_id}/skip` skips a not-yet-started session.
- `PATCH /api/v1/sessions/{session_id}/status` with
  `{"status":"completed"}` or `{"status":"missed"}` is permitted only after
  the scheduled end time.

The session unique index and ignored conflict upserts prevent duplicate
generation on retries. Completed/missed history is never deleted when
generating another plan. Schedule placement is separate from the model:
HIGH priority and near deadlines influence order, while actual availability
determines the start/end times. Work that does not fit is returned as
unscheduled rather than placed outside declared hours. A subject's estimated
workload is conservatively scheduled no later than its earliest upcoming
recorded deadline; if it will not fit, the remaining work is reported as
unscheduled rather than placed after that date. The current workload estimate
is subject-level, not assignment/topic-level, so separate workloads for
multiple deadlines on the same subject cannot be inferred.

### Progress and learning resources

- `GET /api/v1/students/{student_id}/progress` returns completed/missed saved
  session counts, completed study hours, previous marks, subject summaries,
  and profile baseline counts.
- `POST /api/v1/students/{student_id}/subjects/{subject_id}/resources` with
  optional `{"topic":"quadratic equations"}` returns provider names and search
  queries and saves the provider/query metadata to
  `resource_recommendations`. Without a topic, suggestions are subject-level.
  No unverified URL is fabricated.
- `GET /api/v1/students/{student_id}/subjects/{subject_id}/resources` returns
  the saved recommendation-query history for that student's subject.

### Compatibility route and errors

`POST /recommend` remains available for the earlier prediction contract and
also requires a Supabase user token and the current profile schema.

Errors use:

```json
{"error":{"message":"A clear validation or database message","status":400}}
```

Typical status codes: `200` success, `201` newly created student/deadline,
`400` invalid JSON/input, `401` missing or malformed user token, `403` RLS
denial, `404` missing owned student/session, `409` uniqueness conflict, and
`503` missing migration, configuration, or unavailable Supabase. Server
responses do not contain stack traces or credentials.

## Testing locally

Run unit tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Sign in via Supabase Auth and send the student's **user access token** (never
the server-side key) with requests:

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_USER_ACCESS_TOKEN" }
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health
Invoke-RestMethod -Uri http://127.0.0.1:5000/api/v1/students/student-123 `
  -Headers $headers
```

The current unit suite uses a stateful mock store and covers profile
upserts/validation, ML API inference, availability, multi-subject priority
allocation, deadline cutoffs, insufficient time, schedule idempotency,
completed/missed/accepted/edited/skipped session states, progress, resource
write/read, and errors (19 tests passed on 2026-10-16). Live authenticated
checks after the RLS correction passed: both test users signed in with
distinct identities; user B created, read, and updated a profile; invalid
profile data returned 400; user A received 404 reading user B's profile and
403 attempting to update it; user B's values remained unchanged. The unique
test profile and its subject catalog row were then removed and verified
absent. Live `/health` returned 200 with `status: ok`, `schema_ready: true`,
and the model loaded. Credentials and access tokens were not printed.

## Frontend handoff

The frontend should:

1. Authenticate the student with Supabase Auth and keep the returned user
   session securely.
2. Call the JSON endpoints above with
   `Authorization: Bearer <access_token>`.
3. Send profile, weekly availability, and deadline requests using the exact
   examples in this document.
4. Display returned model priorities as synthetic-prototype guidance, show
   `unscheduled_work`, and allow sessions to be accepted/edited/skipped or
   marked completed/missed after they end.

The backend owns data validation and persistence. No UI was created or changed
as part of this backend-only handoff.
