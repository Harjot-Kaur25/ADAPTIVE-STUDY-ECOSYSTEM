-- Repair missing or stale owner policies on student workflow tables.
-- Profile rows use auth_user_id = auth.uid(); child rows resolve ownership
-- through the corresponding students record.
-- Restrictive fences prevent older permissive policies from widening access.
-- RLS remains enabled; no rows or tables are modified or removed.
BEGIN;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_owner_select ON public.students;
CREATE POLICY students_owner_select ON public.students
    FOR SELECT TO authenticated
    USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS students_owner_insert ON public.students;
CREATE POLICY students_owner_insert ON public.students
    FOR INSERT TO authenticated
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS students_owner_update ON public.students;
CREATE POLICY students_owner_update ON public.students
    FOR UPDATE TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS students_owner_fence ON public.students;
CREATE POLICY students_owner_fence ON public.students
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

DO $owner_policies$
DECLARE
    target_table text;
    policy_name text;
    owner_check text :=
        'student_id IN (
            SELECT s.student_id
            FROM public.students AS s
            WHERE s.auth_user_id = (SELECT auth.uid())
        )';
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'student_subjects',
        'student_availability',
        'study_preferences',
        'resource_recommendations',
        'academic_deadlines',
        'subject_priorities',
        'study_sessions',
        'study_goals',
        'notifications'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            target_table
        );

        policy_name := target_table || '_owner_all';
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            policy_name,
            target_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (%s)
                WITH CHECK (%s)',
            policy_name,
            target_table,
            owner_check,
            owner_check
        );

        policy_name := target_table || '_owner_fence';
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            policy_name,
            target_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
                AS RESTRICTIVE FOR ALL TO authenticated
                USING (%s)
                WITH CHECK (%s)',
            policy_name,
            target_table,
            owner_check,
            owner_check
        );
    END LOOP;
END
$owner_policies$;

COMMIT;
