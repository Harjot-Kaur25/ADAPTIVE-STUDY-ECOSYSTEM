-- Corrective migration for deployments where schema migration 02 was applied
-- but the profile-owner policies were absent. It only changes these policies
-- and adds the catalog ownership column; it does not modify or delete rows.
BEGIN;

ALTER TABLE public.subjects
    ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.students, public.student_subjects, public.subjects
    TO authenticated;

DROP POLICY IF EXISTS students_owner_all ON public.students;
DROP POLICY IF EXISTS students_owner_select ON public.students;
DROP POLICY IF EXISTS students_owner_insert ON public.students;
DROP POLICY IF EXISTS students_owner_update ON public.students;
DROP POLICY IF EXISTS students_owner_fence ON public.students;

CREATE POLICY students_owner_select ON public.students
    FOR SELECT TO authenticated
    USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY students_owner_insert ON public.students
    FOR INSERT TO authenticated
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY students_owner_update ON public.students
    FOR UPDATE TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY students_owner_fence ON public.students
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS student_subjects_owner_all ON public.student_subjects;
DROP POLICY IF EXISTS student_subjects_owner_select ON public.student_subjects;
DROP POLICY IF EXISTS student_subjects_owner_insert ON public.student_subjects;
DROP POLICY IF EXISTS student_subjects_owner_update ON public.student_subjects;
DROP POLICY IF EXISTS student_subjects_owner_fence ON public.student_subjects;

CREATE POLICY student_subjects_owner_select ON public.student_subjects
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ));

CREATE POLICY student_subjects_owner_insert ON public.student_subjects
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ));

CREATE POLICY student_subjects_owner_update ON public.student_subjects
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ));

CREATE POLICY student_subjects_owner_fence ON public.student_subjects
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.student_id = student_subjects.student_id
          AND s.auth_user_id = (SELECT auth.uid())
    ));

DROP POLICY IF EXISTS subjects_authenticated_read ON public.subjects;
DROP POLICY IF EXISTS subjects_authenticated_insert ON public.subjects;
DROP POLICY IF EXISTS subjects_authenticated_update ON public.subjects;
DROP POLICY IF EXISTS subjects_owner_select ON public.subjects;
DROP POLICY IF EXISTS subjects_owner_insert ON public.subjects;
DROP POLICY IF EXISTS subjects_owner_update ON public.subjects;
DROP POLICY IF EXISTS subjects_owner_fence ON public.subjects;

CREATE POLICY subjects_owner_select ON public.subjects
    FOR SELECT TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.student_subjects ss
            JOIN public.students s ON s.student_id = ss.student_id
            WHERE ss.subject_id = subjects.subject_id
              AND s.auth_user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY subjects_owner_insert ON public.subjects
    FOR INSERT TO authenticated
    WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY subjects_owner_update ON public.subjects
    FOR UPDATE TO authenticated
    USING (created_by = (SELECT auth.uid()))
    WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY subjects_owner_fence ON public.subjects
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.student_subjects ss
            JOIN public.students s ON s.student_id = ss.student_id
            WHERE ss.subject_id = subjects.subject_id
              AND s.auth_user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (created_by = (SELECT auth.uid()));

COMMIT;
