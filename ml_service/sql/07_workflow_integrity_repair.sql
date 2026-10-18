-- Repair the indexes, grants, and owner policies required by the current
-- Flask workflow. Duplicate natural keys stop the transaction before any
-- migration changes are applied; this script never removes or rewrites rows.
BEGIN;

DO $workflow_indexes$
DECLARE
    target record;
    quoted_columns text;
    duplicate_exists boolean;
    matching_index_exists boolean;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            (
                'student_subjects',
                ARRAY['student_id', 'subject_id']::text[],
                'student_subjects_workflow_conflict_uidx'
            ),
            (
                'student_availability',
                ARRAY['student_id', 'day_of_week', 'start_time', 'end_time']::text[],
                'student_availability_workflow_conflict_uidx'
            ),
            (
                'subject_priorities',
                ARRAY['student_id', 'subject_id']::text[],
                'subject_priorities_workflow_conflict_uidx'
            ),
            (
                'study_sessions',
                ARRAY['student_id', 'subject_id', 'session_date', 'start_time', 'end_time']::text[],
                'study_sessions_workflow_conflict_uidx'
            )
        ) AS targets(table_name, columns, index_name)
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM pg_index AS index_info
            WHERE index_info.indrelid =
                    format('public.%I', target.table_name)::regclass
              AND index_info.indisunique
              AND index_info.indisvalid
              AND index_info.indpred IS NULL
              AND index_info.indexprs IS NULL
              AND index_info.indnkeyatts = cardinality(target.columns)
              AND ARRAY(
                    SELECT attribute.attname::text
                    FROM unnest(index_info.indkey)
                         WITH ORDINALITY AS index_column(attnum, ordinal)
                    JOIN pg_attribute AS attribute
                      ON attribute.attrelid = index_info.indrelid
                     AND attribute.attnum = index_column.attnum
                    WHERE index_column.ordinal <= index_info.indnkeyatts
                    ORDER BY index_column.ordinal
                  ) = target.columns
        )
        INTO matching_index_exists;

        IF NOT matching_index_exists THEN
            SELECT string_agg(format('%I', column_name), ', ')
            INTO quoted_columns
            FROM unnest(target.columns) AS column_name;

            EXECUTE format(
                'SELECT EXISTS (
                    SELECT 1
                    FROM public.%I
                    GROUP BY %s
                    HAVING count(*) > 1
                )',
                target.table_name,
                quoted_columns
            )
            INTO duplicate_exists;

            IF duplicate_exists THEN
                RAISE EXCEPTION
                    'Cannot create workflow unique index for public.%. Duplicate keys exist on (%). Review duplicate rows without deleting data, then rerun this migration.',
                    target.table_name,
                    quoted_columns;
            END IF;

            EXECUTE format(
                'CREATE UNIQUE INDEX %I ON public.%I (%s)',
                target.index_name,
                target.table_name,
                quoted_columns
            );
        END IF;
    END LOOP;
END
$workflow_indexes$;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.students, public.student_subjects, public.subjects
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.student_availability, public.study_preferences,
             public.resource_recommendations, public.academic_deadlines,
             public.subject_priorities, public.study_sessions,
             public.study_goals, public.notifications
    TO authenticated;

DO $sequence_grants$
DECLARE
    target record;
    sequence_name text;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            ('academic_deadlines', 'deadline_id'),
            ('resource_recommendations', 'recommendation_id'),
            ('subject_priorities', 'prediction_id'),
            ('study_sessions', 'session_id'),
            ('study_goals', 'goal_id'),
            ('notifications', 'notification_id')
        ) AS targets(table_name, column_name)
    LOOP
        sequence_name := pg_get_serial_sequence(
            format('public.%I', target.table_name),
            target.column_name
        );
        IF sequence_name IS NOT NULL THEN
            EXECUTE format(
                'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
                sequence_name::regclass
            );
        END IF;
    END LOOP;
END
$sequence_grants$;

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

DO $workflow_policies$
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
$workflow_policies$;

COMMIT;
