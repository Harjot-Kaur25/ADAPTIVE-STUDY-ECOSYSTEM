import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import type {
  StudentAvailabilityInput,
  StudentStudyInput,
  StudentStudySubjectInput,
  StudyPlanResults,
} from '../services/contracts';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankSubject(): StudentStudySubjectInput {
  return {
    subjectId: '',
    subjectName: '',
    previousMarks: '',
    examDate: '',
    assignmentDeadlines: [],
    improvementTopics: '',
  };
}

function blankPeriod(): StudentAvailabilityInput {
  return { id: newId(), dayOfWeek: '', startTime: '', endTime: '' };
}

function blankInput(): StudentStudyInput {
  return {
    studentName: '',
    registrationNumber: '',
    subjects: [blankSubject()],
    availability: [blankPeriod()],
    preferredSession: '1h',
    breakMinutes: '10',
  };
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validate(input: StudentStudyInput): string[] {
  const errors: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliestDate = localDateString(today);
  if (!input.studentName.trim() || input.studentName.trim().length > 200) {
    errors.push('Enter a student name (up to 200 characters).');
  }
  if (!input.registrationNumber.trim() || input.registrationNumber.trim().length > 64) {
    errors.push('Enter a student ID or registration number (up to 64 characters).');
  }
  if (input.subjects.length === 0) errors.push('Add at least one subject.');
  if (input.subjects.length > 50) errors.push('A profile can include at most 50 subjects.');
  const subjectIds = new Set<string>();
  input.subjects.forEach((subject, index) => {
    const label = `Subject ${index + 1}`;
    const id = subject.subjectId.trim().toLowerCase();
    if (!id) errors.push(`${label}: enter a subject ID.`);
    else if (id.length > 128) errors.push(`${label}: the subject ID must be at most 128 characters.`);
    else if (subjectIds.has(id)) errors.push(`${label}: subject IDs must be unique.`);
    subjectIds.add(id);
    if (!subject.subjectName.trim() || subject.subjectName.trim().length > 200) errors.push(`${label}: enter a subject name of at most 200 characters.`);
    const marks = Number(subject.previousMarks);
    if (!subject.previousMarks.trim() || !Number.isFinite(marks) || marks < 0 || marks > 100) {
      errors.push(`${label}: previous marks must be between 0 and 100.`);
    }
    if (!subject.examDate || subject.examDate < earliestDate) {
      errors.push(`${label}: enter an exam date today or later.`);
    }
    if (subject.improvementTopics.trim().length > 200) {
      errors.push(`${label}: topics needing improvement must be at most 200 characters.`);
    }
    if (subject.assignmentDeadlines.length > 30) errors.push(`${label}: add no more than 30 assignment deadlines.`);
    subject.assignmentDeadlines.forEach((deadline, deadlineIndex) => {
      if (!deadline.title.trim() || deadline.title.trim().length > 200) errors.push(`${label}, assignment ${deadlineIndex + 1}: enter a deadline title of at most 200 characters.`);
      if (!deadline.dueDate) errors.push(`${label}, assignment ${deadlineIndex + 1}: enter a due date.`);
    });
  });
  if (input.availability.length === 0) errors.push('Add at least one available study period.');
  if (input.availability.length > 100) errors.push('A profile can include at most 100 availability periods.');
  const periodsByDay = new Map<string, StudentAvailabilityInput[]>();
  input.availability.forEach((period, index) => {
    if (!days.includes(period.dayOfWeek)) errors.push(`Availability period ${index + 1}: choose a day.`);
    if (!period.startTime || !period.endTime || period.startTime >= period.endTime) {
      errors.push(`Availability period ${index + 1}: the end time must be after the start time.`);
    }
    periodsByDay.set(period.dayOfWeek, [...(periodsByDay.get(period.dayOfWeek) ?? []), period]);
  });
  for (const [day, periods] of periodsByDay) {
    const sorted = [...periods].sort((left, right) => left.startTime.localeCompare(right.startTime));
    if (sorted.some((period, index) => index > 0 && sorted[index - 1].endTime > period.startTime)) {
      errors.push(`Availability periods on ${day} cannot overlap.`);
    }
  }
  const breakMinutes = Number(input.breakMinutes);
  if (!input.breakMinutes.trim() || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 60) {
    errors.push('Break duration must be a whole number from 0 to 60 minutes.');
  }
  return errors;
}

function updateSubject(
  input: StudentStudyInput,
  index: number,
  update: Partial<StudentStudySubjectInput>,
): StudentStudyInput {
  return {
    ...input,
    subjects: input.subjects.map((subject, current) => current === index ? { ...subject, ...update } : subject),
  };
}

export default function StudentIntake({
  initialValue,
  onSubmit,
  onComplete,
  onCancel,
}: {
  initialValue?: StudentStudyInput | null;
  onSubmit: (input: StudentStudyInput) => Promise<StudyPlanResults>;
  onComplete: (result: StudyPlanResults) => void;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState<StudentStudyInput>(() => initialValue ?? blankInput());
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [errors, setErrors] = useState<string[]>([]);
  const [requestError, setRequestError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialValue) setInput(initialValue);
  }, [initialValue]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate(input);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      setStep('edit');
      return;
    }
    setSubmitting(true);
    setRequestError('');
    try {
      const result = await onSubmit(input);
      onComplete(result);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Your study plan could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  function review() {
    const validationErrors = validate(input);
    setErrors(validationErrors);
    if (validationErrors.length === 0) setStep('review');
  }

  return (
    <section className="student-intake workspace-panel" aria-labelledby="student-intake-title">
      <div className="student-intake-heading">
        <span className="panel-eyebrow">YOUR STUDY PLAN / {step === 'review' ? 'REVIEW' : 'YOUR DETAILS'}</span>
        <h2 id="student-intake-title">{step === 'review' ? 'Review your information.' : 'Let’s build your study plan.'}</h2>
        <p>These details are saved to your authenticated student profile before predictions or scheduling begin.</p>
      </div>

      {errors.length > 0 && <div className="student-intake-errors" role="alert">
        <b>Please correct the following before continuing:</b>
        <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
      </div>}
      {requestError && <p className="student-intake-error" role="alert">{requestError}</p>}

      {step === 'edit' ? (
        <form onSubmit={(event) => { event.preventDefault(); review(); }}>
          <fieldset className="student-intake-fields">
            <legend>Student information</legend>
            <label>Student name<input autoComplete="name" required maxLength={200} value={input.studentName} onChange={(event) => setInput((current) => ({ ...current, studentName: event.target.value }))} /></label>
            <label>Student ID / registration number<input required maxLength={64} value={input.registrationNumber} onChange={(event) => setInput((current) => ({ ...current, registrationNumber: event.target.value }))} /></label>
          </fieldset>

          <div className="student-intake-group">
            <div className="student-intake-group-heading"><div><h3>Subjects</h3><p>Enter marks on a 0–100 scale and an exam date for each subject.</p></div><button type="button" className="subtle-button" disabled={input.subjects.length >= 50} onClick={() => setInput((current) => ({ ...current, subjects: [...current.subjects, blankSubject()] }))}><Plus size={14} /> Add subject</button></div>
            {input.subjects.map((subject, index) => (
              <fieldset className="student-intake-card" key={`subject-${index}`}>
                <legend>Subject {index + 1}</legend>
                {input.subjects.length > 1 && <button type="button" className="student-intake-remove" aria-label={`Remove subject ${index + 1}`} onClick={() => setInput((current) => ({ ...current, subjects: current.subjects.filter((_, currentIndex) => currentIndex !== index) }))}><Trash2 size={14} /></button>}
                <div className="student-intake-fields">
                  <label>Subject name<input required maxLength={200} value={subject.subjectName} onChange={(event) => setInput((current) => updateSubject(current, index, { subjectName: event.target.value }))} /></label>
                  <label>Subject ID<input required maxLength={128} value={subject.subjectId} onChange={(event) => setInput((current) => updateSubject(current, index, { subjectId: event.target.value }))} /></label>
                  <label>Previous marks (0–100)<input type="number" min="0" max="100" step="0.01" required value={subject.previousMarks} onChange={(event) => setInput((current) => updateSubject(current, index, { previousMarks: event.target.value }))} /></label>
                  <label>Exam date<input type="date" min={localDateString(new Date())} required value={subject.examDate} onChange={(event) => setInput((current) => updateSubject(current, index, { examDate: event.target.value }))} /></label>
                  <label className="student-intake-wide">Topics needing improvement <span className="student-intake-optional">(optional)</span><input maxLength={200} placeholder="Enter a topic or area to focus on" value={subject.improvementTopics} onChange={(event) => setInput((current) => updateSubject(current, index, { improvementTopics: event.target.value }))} /></label>
                </div>
                <div className="student-intake-deadlines">
                  <div className="student-intake-group-heading"><b>Assignment deadlines</b><button type="button" className="subtle-button" disabled={subject.assignmentDeadlines.length >= 30} onClick={() => setInput((current) => updateSubject(current, index, { assignmentDeadlines: [...current.subjects[index].assignmentDeadlines, { title: '', dueDate: '' }] }))}><Plus size={13} /> Add deadline</button></div>
                  {subject.assignmentDeadlines.map((deadline, deadlineIndex) => (
                    <div className="student-intake-fields student-intake-deadline" key={`deadline-${index}-${deadlineIndex}`}>
                      <label>Assignment title<input required maxLength={200} value={deadline.title} onChange={(event) => setInput((current) => updateSubject(current, index, { assignmentDeadlines: current.subjects[index].assignmentDeadlines.map((item, itemIndex) => itemIndex === deadlineIndex ? { ...item, title: event.target.value } : item) }))} /></label>
                      <label>Due date<input type="date" required value={deadline.dueDate} onChange={(event) => setInput((current) => updateSubject(current, index, { assignmentDeadlines: current.subjects[index].assignmentDeadlines.map((item, itemIndex) => itemIndex === deadlineIndex ? { ...item, dueDate: event.target.value } : item) }))} /></label>
                      <button type="button" className="student-intake-remove" aria-label={`Remove assignment ${deadlineIndex + 1}`} onClick={() => setInput((current) => updateSubject(current, index, { assignmentDeadlines: current.subjects[index].assignmentDeadlines.filter((_, itemIndex) => itemIndex !== deadlineIndex) }))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="student-intake-group">
            <div className="student-intake-group-heading"><div><h3>Study availability</h3><p>Add each day and the exact time range when you can study.</p></div><button type="button" className="subtle-button" disabled={input.availability.length >= 100} onClick={() => setInput((current) => ({ ...current, availability: [...current.availability, blankPeriod()] }))}><Plus size={14} /> Add period</button></div>
            {input.availability.map((period, index) => (
              <div className="student-intake-fields student-intake-period" key={period.id}>
                <label>Available day<select required value={period.dayOfWeek} onChange={(event) => setInput((current) => ({ ...current, availability: current.availability.map((item, currentIndex) => currentIndex === index ? { ...item, dayOfWeek: event.target.value } : item) }))}><option value="">Choose a day</option>{days.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
                <label>Start time<input type="time" required value={period.startTime} onChange={(event) => setInput((current) => ({ ...current, availability: current.availability.map((item, currentIndex) => currentIndex === index ? { ...item, startTime: event.target.value } : item) }))} /></label>
                <label>End time<input type="time" required value={period.endTime} onChange={(event) => setInput((current) => ({ ...current, availability: current.availability.map((item, currentIndex) => currentIndex === index ? { ...item, endTime: event.target.value } : item) }))} /></label>
                <button type="button" className="student-intake-remove" aria-label={`Remove availability period ${index + 1}`} onClick={() => setInput((current) => ({ ...current, availability: current.availability.filter((_, currentIndex) => currentIndex !== index) }))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <fieldset className="student-intake-fields student-intake-preferences">
            <legend>Session preferences</legend>
            <label>Preferred study session<select value={input.preferredSession} onChange={(event) => setInput((current) => ({ ...current, preferredSession: event.target.value as StudentStudyInput['preferredSession'] }))}><option value="1h">1 hour</option><option value="2h">2 hours</option><option value="2-3h">2–3 hours</option></select></label>
            <label>Break duration (minutes)<input type="number" min="0" max="60" step="1" required value={input.breakMinutes} onChange={(event) => setInput((current) => ({ ...current, breakMinutes: event.target.value }))} /></label>
          </fieldset>
          <div className="student-intake-actions">
            {onCancel && <button type="button" className="subtle-button" onClick={onCancel}><ArrowLeft size={14} /> Cancel</button>}
            <button type="submit" className="student-intake-primary">Review information <ArrowRight size={14} /></button>
          </div>
        </form>
      ) : (
        <form onSubmit={(event) => void confirm(event)}>
          <div className="student-intake-review">
            <h3>Student</h3><p>{input.studentName} · {input.registrationNumber}</p>
            {input.subjects.map((subject, index) => <article key={`${subject.subjectId}-${index}`}><h4>{subject.subjectName} <small>({subject.subjectId})</small></h4><p>Previous marks: {subject.previousMarks}/100 · Exam: {subject.examDate}</p>{subject.assignmentDeadlines.map((deadline, deadlineIndex) => <p key={deadlineIndex}>Assignment: {deadline.title} · Due {deadline.dueDate}</p>)}{subject.improvementTopics && <p>Topics to improve: {subject.improvementTopics}</p>}</article>)}
            <h3>Availability and preferences</h3>
            {input.availability.map((period) => <p key={period.id}>{period.dayOfWeek}: {period.startTime}–{period.endTime}</p>)}
            <p>Study sessions: {input.preferredSession} · Break: {input.breakMinutes} minutes</p>
          </div>
          {requestError && <p className="student-intake-error" role="alert">{requestError}</p>}
          <div className="student-intake-actions">
            <button type="button" className="subtle-button" disabled={submitting} onClick={() => setStep('edit')}><ArrowLeft size={14} /> Correct information</button>
            <button type="submit" className="student-intake-primary" disabled={submitting}>{submitting ? 'Saving and preparing your plan…' : 'Confirm and create my plan'} <ArrowRight size={14} /></button>
          </div>
        </form>
      )}
    </section>
  );
}
