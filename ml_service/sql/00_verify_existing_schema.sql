-- Run after the existing Member 1/2/3 scripts in the target schema.
-- These checks use only the confirmed table/column names; they do not create
-- or alter any of the teammate-owned tables.
SET SERVEROUTPUT ON

DECLARE
    TYPE t_table_names IS TABLE OF VARCHAR2(30);
    TYPE t_column_names IS TABLE OF VARCHAR2(4000);
    v_tables t_table_names := t_table_names(
        'STUDENT', 'SUBJECT', 'PERFORMANCE', 'STUDY_PLAN',
        'STUDY_SESSION', 'RESOURCES', 'GOAL', 'NOTIFICATION'
    );
    v_columns t_column_names := t_column_names(
        'STUDENT_ID,STUDENT_NAME',
        'SUBJECT_ID,SUBJECT_NAME',
        'PERFORMANCE_ID,STUDENT_ID,SUBJECT_ID,EXAM_NAME,MARKS',
        'PLAN_ID,STUDENT_ID,SUBJECT_ID,PLAN_DATE',
        'SESSION_ID,PLAN_ID,SESSION_DATE,DURATION,STATUS',
        'RESOURCE_ID,SUBJECT_ID,RESOURCE_TITLE,RESOURCE_TYPE,RESOURCE_URL',
        'GOAL_ID,STUDENT_ID,GOAL_DESCRIPTION,TARGET_DATE,STATUS',
        'NOTIFICATION_ID,STUDENT_ID,MESSAGE,NOTIFICATION_DATE,STATUS'
    );
    v_table VARCHAR2(30);
    v_csv VARCHAR2(4000);
    v_start PLS_INTEGER;
    v_comma PLS_INTEGER;
    v_column VARCHAR2(30);
    v_missing VARCHAR2(4000);
    v_pk_count PLS_INTEGER;
BEGIN
    FOR i IN 1 .. v_tables.COUNT LOOP
        v_table := v_tables(i);
        v_csv := v_columns(i);
        v_missing := NULL;
        LOOP
            v_comma := INSTR(v_csv, ',');
            IF v_comma = 0 THEN
                v_column := TRIM(v_csv);
            ELSE
                v_column := TRIM(SUBSTR(v_csv, 1, v_comma - 1));
            END IF;

            SELECT COUNT(*) INTO v_pk_count
              FROM USER_TAB_COLUMNS
             WHERE TABLE_NAME = v_table AND COLUMN_NAME = v_column;
            IF v_pk_count = 0 THEN
                v_missing := v_missing || CASE WHEN v_missing IS NULL THEN '' ELSE ', ' END || v_column;
            END IF;
            EXIT WHEN v_comma = 0;
            v_csv := SUBSTR(v_csv, v_comma + 1);
        END LOOP;

        IF v_missing IS NOT NULL THEN
            RAISE_APPLICATION_ERROR(
                -20001, v_table || ' is missing confirmed column(s): ' || v_missing
            );
        END IF;
        DBMS_OUTPUT.PUT_LINE(v_table || ': confirmed columns present');
    END LOOP;

    FOR v_key IN (
        SELECT table_name, column_name
          FROM USER_CONS_COLUMNS
         WHERE constraint_name IN (
             SELECT constraint_name
               FROM USER_CONSTRAINTS
              WHERE constraint_type = 'P'
                AND table_name IN ('STUDENT', 'SUBJECT')
         )
    ) LOOP
        DBMS_OUTPUT.PUT_LINE(
            'Primary-key column found: ' || v_key.table_name || '.' || v_key.column_name
        );
    END LOOP;

    SELECT COUNT(*) INTO v_pk_count
      FROM USER_CONSTRAINTS c
      JOIN USER_CONS_COLUMNS cc
        ON cc.constraint_name = c.constraint_name
       AND cc.table_name = c.table_name
     WHERE c.constraint_type = 'P'
       AND c.table_name = 'STUDENT'
       AND cc.column_name = 'STUDENT_ID'
       AND (SELECT COUNT(*) FROM USER_CONS_COLUMNS all_cc
             WHERE all_cc.constraint_name = c.constraint_name
               AND all_cc.table_name = c.table_name) = 1;
    IF v_pk_count = 0 THEN
        RAISE_APPLICATION_ERROR(-20002, 'STUDENT.STUDENT_ID must be its single-column primary key.');
    END IF;

    SELECT COUNT(*) INTO v_pk_count
      FROM USER_CONSTRAINTS c
      JOIN USER_CONS_COLUMNS cc
        ON cc.constraint_name = c.constraint_name
       AND cc.table_name = c.table_name
     WHERE c.constraint_type = 'P'
       AND c.table_name = 'SUBJECT'
       AND cc.column_name = 'SUBJECT_ID'
       AND (SELECT COUNT(*) FROM USER_CONS_COLUMNS all_cc
             WHERE all_cc.constraint_name = c.constraint_name
               AND all_cc.table_name = c.table_name) = 1;
    IF v_pk_count = 0 THEN
        RAISE_APPLICATION_ERROR(-20003, 'SUBJECT.SUBJECT_ID must be its single-column primary key.');
    END IF;
END;
/

-- Review existing primary/unique/foreign-key relationships before integrating
-- any additional Member 2/3 data flows. This script does not create them.
SELECT c.table_name, c.constraint_name, c.constraint_type,
       cc.column_name, c.r_constraint_name
  FROM USER_CONSTRAINTS c
  JOIN USER_CONS_COLUMNS cc
    ON cc.constraint_name = c.constraint_name
   AND cc.table_name = c.table_name
 WHERE c.table_name IN (
     'STUDENT', 'SUBJECT', 'PERFORMANCE', 'STUDY_PLAN',
     'STUDY_SESSION', 'RESOURCES', 'GOAL', 'NOTIFICATION'
 )
 ORDER BY c.table_name, c.constraint_type, c.constraint_name, cc.position;
