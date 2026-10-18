-- Add the fields required by authenticated student intake.
-- Safe to apply after migrations 02 and 03; existing rows are preserved.

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS registration_number text;

ALTER TABLE public.student_subjects
    ADD COLUMN IF NOT EXISTS improvement_topics text;
