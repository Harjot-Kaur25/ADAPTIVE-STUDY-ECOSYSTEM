-- Grant the authenticated role the SQL privileges required by the existing
-- owner-scoped RLS policies. RLS remains enabled and continues to limit rows
-- to the owning Supabase Auth user.
BEGIN;

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

COMMIT;
