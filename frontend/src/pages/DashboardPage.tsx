import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Clock3, Flame, MoreHorizontal, Plus, Sparkles, Target } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkspaceShell, { type DashboardSection } from '../components/WorkspaceShell';
import StudentIntake from '../components/StudentIntake';
import { initialGoals, initialSubjects, schedules, type CustomSession, type Goal, type StudyTask, type Subject } from '../data/studyDemoData';
import { hasApiBaseUrl, isBackendEnabled, services } from '../services';
import type { Deadline, ProgressSummary, StudentStudyInput, StudyPlanResults, StudyPriority, StudyResourceRecommendation, UnscheduledWork } from '../services/contracts';

type Range = 'THIS WEEK' | 'LAST 7 DAYS';

const sectionNames: Record<string, DashboardSection> = { overview: 'Overview', schedule: 'Schedule', subjects: 'Subjects', progress: 'Progress', goals: 'Goals' };
const week = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const calendarDates = (() => {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return week.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
})();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
const timeOptions = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
const durationOptions = ['25', '45', '60', '90'];
let idCounter = 0;
function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}
function loadPlanningState(): { sessions: CustomSession[]; completed: Record<string, boolean> } {
  if (typeof window === 'undefined') return { sessions: [], completed: {} };
  try {
    const saved = JSON.parse(window.localStorage.getItem('adaptivestudy-dashboard-planning') ?? '{}');
    return { sessions: Array.isArray(saved.sessions) ? saved.sessions : [], completed: saved.completed && typeof saved.completed === 'object' ? saved.completed : {} };
  } catch { return { sessions: [], completed: {} }; }
}
function getTasks(day: string, sessions: CustomSession[], backendSessions: CustomSession[] | null = null) {
  const dayIndex = week.indexOf(day);
  const date = dayIndex >= 0 ? dateKey(calendarDates[dayIndex]) : '';
  const source = backendSessions === null
    ? schedules[day] ?? []
    : backendSessions.filter((session) => session.day === day && session.scheduledDate === date);
  return [...source, ...sessions.filter((session) => session.day === day)].sort((a, b) => a.time.localeCompare(b.time));
}

function isCompleteStudyInput(input: StudentStudyInput): boolean {
  const today = dateKey(new Date());
  const subjectIds = input.subjects.map((subject) => subject.subjectId.trim().toLowerCase());
  const periodsByDay = new Map<string, StudentStudyInput['availability']>();
  for (const period of input.availability) {
    periodsByDay.set(period.dayOfWeek, [...(periodsByDay.get(period.dayOfWeek) ?? []), period]);
  }
  const periodsDoNotOverlap = [...periodsByDay.values()].every((periods) => {
    const sorted = [...periods].sort((left, right) => left.startTime.localeCompare(right.startTime));
    return sorted.every((period, index) => index === 0 || sorted[index - 1].endTime <= period.startTime);
  });
  return Boolean(
    input.studentName.trim()
    && input.studentName.trim().length <= 200
    && input.registrationNumber.trim()
    && input.registrationNumber.trim().length <= 64
    && input.subjects.length
    && new Set(subjectIds).size === subjectIds.length
    && input.subjects.every((subject) =>
      subject.subjectId.trim()
      && subject.subjectName.trim()
      && subject.subjectName.trim().length <= 200
      && subject.previousMarks.trim()
      && Number.isFinite(Number(subject.previousMarks))
      && Number(subject.previousMarks) >= 0
      && Number(subject.previousMarks) <= 100
      && subject.examDate >= today
      && subject.improvementTopics.trim().length <= 200
      && subject.assignmentDeadlines.every((deadline) =>
        deadline.title.trim() && deadline.title.trim().length <= 200 && deadline.dueDate,
      ),
    )
    && input.availability.length
    && input.availability.every((period) =>
      week.some((day) => day === period.dayOfWeek.toUpperCase())
      && period.startTime && period.endTime && period.startTime < period.endTime,
    )
    && periodsDoNotOverlap
    && input.breakMinutes.trim()
    && Number.isInteger(Number(input.breakMinutes))
    && Number(input.breakMinutes) >= 0
    && Number(input.breakMinutes) <= 60,
  );
}

function studyInputSignature(input: StudentStudyInput): string {
  return JSON.stringify({
    studentName: input.studentName.trim(),
    registrationNumber: input.registrationNumber.trim(),
    subjects: input.subjects.map((subject) => ({
      subjectId: subject.subjectId.trim(),
      subjectName: subject.subjectName.trim(),
      previousMarks: Number(subject.previousMarks),
      examDate: subject.examDate,
      assignmentDeadlines: subject.assignmentDeadlines
        .map((deadline) => ({ title: deadline.title.trim(), dueDate: deadline.dueDate }))
        .sort((left, right) => left.title.localeCompare(right.title)),
      improvementTopics: subject.improvementTopics.trim(),
    })).sort((left, right) => left.subjectId.localeCompare(right.subjectId)),
    availability: input.availability
      .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
      .sort((left, right) => left.dayOfWeek.localeCompare(right.dayOfWeek) || left.startTime.localeCompare(right.startTime)),
    preferredSession: input.preferredSession,
    breakMinutes: Number(input.breakMinutes),
  });
}

function prioritySubjects(priorities: StudyPriority[]): Subject[] {
  const colors = ['blue', 'ice', 'steel', 'sky'];
  return priorities.map((priority, index) => ({
    name: priority.title,
    code: priority.id,
    color: colors[index % colors.length],
    progress: Math.max(0, Math.min(100, Math.round(priority.previousMarks ?? 0))),
    metricLabel: 'PREVIOUS MARKS',
    next: `${priority.priority?.toUpperCase() ?? `RANK ${priority.rank}`} PRIORITY${priority.reason ? ` · ${priority.reason}` : ''}`,
  }));
}

function PlanResults({
  priorities,
  warnings,
  recommendations,
}: {
  priorities: StudyPriority[];
  warnings: UnscheduledWork[];
  recommendations: StudyResourceRecommendation[];
}) {
  return <div className="student-plan-results">
    {priorities.length > 0 && <section className="workspace-panel">
      <span className="panel-eyebrow">BACKEND SUBJECT PRIORITIES</span>
      <div className="student-plan-result-list">{priorities.map((priority) => {
        const score = priority.priority ? priority.classScores?.[priority.priority] : undefined;
        return <article key={priority.id}>
          <h3>{priority.title} <span>{priority.priority ?? `Rank ${priority.rank}`}</span></h3>
          {typeof score === 'number' && <p>Model class score: {(score * 100).toFixed(1)}%</p>}
          {priority.reason && <p>{priority.reason}</p>}
          {priority.scoreNote && <small>{priority.scoreNote}</small>}
        </article>;
      })}</div>
    </section>}
    <section className="workspace-panel">
      <span className="panel-eyebrow">LEARNING RESOURCE RECOMMENDATIONS</span>
      {recommendations.length === 0
        ? <p className="demo-footnote">The backend has not returned recommendations for these subjects.</p>
        : recommendations.map((recommendation) => <article className="student-resource-group" key={`${recommendation.subjectId}-${recommendation.topic ?? 'subject'}`}>
          <h3>{recommendation.subjectName} · {recommendation.scope === 'topic' ? recommendation.topic : 'Subject-level suggestions'}</h3>
          <ul>{recommendation.resources.map((resource) => <li key={`${resource.provider}-${resource.searchQuery}`}><b>{resource.provider}</b> ({resource.resourceType}): {resource.searchQuery}</li>)}</ul>
          <small>Search suggestions returned by the backend; individual lessons and URLs are not verified.</small>
        </article>)}
    </section>
    {warnings.length > 0 && <section className="workspace-panel student-plan-warning" role="status">
      <span className="panel-eyebrow">WORK THAT COULD NOT FIT</span>
      {warnings.map((warning) => <p key={warning.subjectName}><b>{warning.subjectName}: {warning.remainingMinutes} minutes remain.</b> {warning.reason}</p>)}
    </section>}
  </div>;
}

function SectionButton({ section, onClick }: { section: DashboardSection; onClick: () => void }) { return <button type="button" className="subtle-button" onClick={onClick}>View {section.toLowerCase()} <ArrowRight size={13} /></button>; }
function RangeSelector({ value, onChange, label }: { value: Range; onChange: (range: Range) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return <div className="range-selector"><button type="button" className="date-select" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{value} <span>⌄</span></button>{open && <div role="listbox" aria-label={`${label} options`}>{(['THIS WEEK', 'LAST 7 DAYS'] as Range[]).map((option) => <button type="button" role="option" aria-selected={value === option} aria-pressed={value === option} key={option} className="subtle-button" onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div>;
}
function TaskList({ day, tasks, completed, onToggle }: { day: string; tasks: StudyTask[]; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void }) {
  return <div className="study-task-list">{tasks.length === 0 ? <p className="demo-footnote">No study sessions are scheduled for this day.</p> : tasks.map((task) => { const checked = task.status === 'completed' || Boolean(completed[`${day}:${task.id}`]); const terminal = task.status === 'completed' || task.status === 'missed' || task.status === 'skipped'; return <div className={`study-task ${checked ? 'is-done' : ''}`} key={`${day}-${task.id}`}><span className="study-task-time">{task.time}</span><button type="button" className="task-check" disabled={terminal} aria-label={checked ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`} aria-pressed={checked} onClick={() => onToggle(task, day)}>{checked && <Check size={11} />}</button><span className="task-time-line" /><div className="study-task-copy"><b>{task.title}</b><small>{task.subject} <i>·</i> {task.length}</small></div><span className="study-task-kind">{task.kind}</span></div>; })}</div>;
}
function WeekCalendar({ selectedDay, onSelect, onOpenSchedule, sessions, backendSessions }: { selectedDay: string; onSelect: (day: string) => void; onOpenSchedule: () => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null }) {
  const selectedTasks = getTasks(selectedDay, sessions, backendSessions);
  const nextTask = selectedTasks[0];
  const selectedDate = calendarDates[week.indexOf(selectedDay)];
  const label = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return <section className="workspace-panel overview-calendar" aria-label="Weekly study calendar"><div className="overview-calendar-head"><div><span className="panel-eyebrow"><CalendarDays size={12} /> YOUR WEEK AT A GLANCE</span><h3>{label(calendarDates[0])} <i>—</i> {label(calendarDates[6])}</h3></div><button type="button" className="subtle-button" onClick={onOpenSchedule}>Open schedule <ArrowRight size={13} /></button></div><div className="overview-calendar-days" role="group" aria-label="Choose a day">{week.map((day, index) => <button type="button" key={day} aria-pressed={selectedDay === day} aria-label={`${day}, ${label(calendarDates[index])}`} className={`overview-calendar-day ${selectedDay === day ? 'is-selected' : ''}`} onClick={() => onSelect(day)}><span>{day.slice(0, 1)}<small>{day.slice(1).toLowerCase()}</small></span><b>{calendarDates[index].getDate()}</b><i className={getTasks(day, sessions, backendSessions).length ? 'has-items' : ''} /></button>)}</div><div className="overview-calendar-next"><span className="calendar-selected-date">{selectedDay} <i>·</i> {label(selectedDate)}</span><span className="calendar-session-count">{selectedTasks.length} planned {selectedTasks.length === 1 ? 'session' : 'sessions'}</span><span className="calendar-next-task"><small>UP NEXT</small><b>{nextTask ? `${nextTask.time} · ${nextTask.title}` : 'A little open space'}</b></span></div></section>;
}
function TimeBlockWidget({ selectedDay, sessions, onAdd, onEdit, onDelete, onStatus }: { selectedDay: string; sessions: CustomSession[]; onAdd: (session: CustomSession) => void; onEdit: (session: CustomSession) => void; onDelete: (session: CustomSession) => void; onStatus: (message: string) => void }) {
  const [time, setTime] = useState('15:00');
  const [subject, setSubject] = useState('Independent study');
  const [duration, setDuration] = useState('45');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const daySessions = sessions.filter((session) => session.day === selectedDay).sort((a, b) => a.time.localeCompare(b.time));
  function resetForm() { setEditingId(null); setTime('15:00'); setSubject('Independent study'); setDuration('45'); setError(''); }
  function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = subject.trim();
    if (!trimmed) { setError('Enter a subject or session name.'); return; }
    if (!timeOptions.includes(time) || !durationOptions.includes(duration)) { setError('Choose a valid start time and length.'); return; }
    const sessionDay = editingId ? sessions.find((item) => item.id === editingId)?.day ?? selectedDay : selectedDay;
    const session: CustomSession = { id: editingId ?? makeId('session'), day: sessionDay, time, title: trimmed, subject: trimmed, kind: 'FOCUS', length: `${duration} min`, custom: true };
    if (editingId) { onEdit(session); onStatus(`Updated ${trimmed} on ${selectedDay}.`); } else { onAdd(session); onStatus(`Added ${trimmed} to ${selectedDay}.`); }
    resetForm();
  }
  function beginEdit(session: CustomSession) { setEditingId(session.id); setTime(session.time); setSubject(session.title); setDuration(session.length.replace(' min', '')); setError(''); }
  return <section className="workspace-panel time-block-widget" aria-label="Time blocking"><div className="time-block-heading"><span className="panel-eyebrow">MAKE ROOM FOR FOCUS</span><span className="time-block-day">{selectedDay}</span></div><h3>Time block</h3><p className="time-block-hint">Set aside a little time for what matters.</p><form className="time-block-form" onSubmit={saveBlock}><label>SUBJECT<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={42} aria-label="Study block subject" /></label><div className="time-block-fields"><label>START<select value={time} onChange={(event) => setTime(event.target.value)} aria-label="Study block start time">{timeOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>LENGTH<select value={duration} onChange={(event) => setDuration(event.target.value)} aria-label="Study block length">{durationOptions.map((option) => <option key={option} value={option}>{option} min</option>)}</select></label></div>{error && <span role="alert" className="demo-footnote">{error}</span>}<button className="time-block-add" type="submit"><Plus size={13} /> {editingId ? 'Save changes' : `Add to ${selectedDay}`}</button>{editingId && <button type="button" className="subtle-button" onClick={resetForm}>Cancel edit</button>}</form><div className="time-block-list" aria-live="polite">{daySessions.length === 0 ? <span className="time-block-empty"><Clock3 size={12} /> Your added blocks will appear here.</span> : daySessions.map((block) => <div className="time-block-item" key={block.id}><span className="time-block-item-time">{block.time}</span><span className="time-block-item-copy"><b>{block.subject}</b><small>{block.length} · {block.day}</small></span><button type="button" className="subtle-button" aria-label={`Edit ${block.subject} block`} onClick={() => beginEdit(block)}>Edit</button><button type="button" aria-label={`Remove ${block.subject} block`} onClick={() => { onDelete(block); if (editingId === block.id) resetForm(); onStatus(`Removed ${block.subject} from ${block.day}.`); }}>×</button></div>)}</div></section>;
}

function Overview({ onChange, selectedDay, setSelectedDay, sessions, backendSessions, completed, onToggle, range, setRange, progress, prioritiesLoaded, onStatus, onAddSession, onEditSession, onDeleteSession, subjects, displayName, connected, onEditInputs }: { onChange: (section: DashboardSection) => void; selectedDay: string; setSelectedDay: (day: string) => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void; range: Range; setRange: (range: Range) => void; progress: ProgressSummary | null; prioritiesLoaded: boolean; onStatus: (message: string) => void; onAddSession: (session: CustomSession) => void; onEditSession: (session: CustomSession) => void; onDeleteSession: (session: CustomSession) => void; subjects: Subject[]; displayName: string; connected: boolean; onEditInputs: () => void }) {
  const tasks = getTasks(selectedDay, sessions, backendSessions);
  const hours = progress ? progress.focusedHours.toFixed(1) : range === 'THIS WEEK' ? '8.4' : '7.1';
  const goalPercent = range === 'THIS WEEK' ? '68' : '59';
  const hasPriorities = subjects.some((subject) => subject.metricLabel === 'PREVIOUS MARKS');
  return (
    <div className="dashboard-overview">
      <div className="overview-light-zone">
        <div className="dashboard-greeting">
          <div>
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} <span>·</span> A little room to focus</p>
            <h2>Good morning, {displayName}<span>.</span></h2>
            <span className="greeting-sub">One focused session at a time.</span>
          </div>
          {!progress && <RangeSelector value={range} onChange={setRange} label="Choose overview date range" />}
        </div>
        <div className="overview-planning-row">
          <WeekCalendar selectedDay={selectedDay} onSelect={setSelectedDay} onOpenSchedule={() => onChange('Schedule')} sessions={sessions} backendSessions={backendSessions} />
          {connected
            ? <section className="workspace-panel time-block-widget"><span className="panel-eyebrow">PLAN AROUND YOUR REAL TIME</span><h3>Study blocks follow your availability.</h3><p className="demo-footnote">Your backend-generated sessions stay within the days and times you saved.</p><button type="button" className="subtle-button" onClick={onEditInputs}>Edit study availability <ArrowRight size={13} /></button></section>
            : <TimeBlockWidget selectedDay={selectedDay} sessions={sessions} onAdd={onAddSession} onEdit={onEditSession} onDelete={onDeleteSession} onStatus={onStatus} />}
        </div>
        <div className="workspace-stats">
          <article className="stat-tile">
            <span>FOCUS {progress ? 'ALL TIME' : range}</span>
            <b>{hours} <small>hrs</small></b>
            <div className="stat-foot"><ArrowUpRight size={12} /> {progress ? `${progress.completedSessions} sessions completed` : '14% from last week'}</div>
            {progress ? <span className="demo-footnote">Daily detail unavailable</span> : <div className="stat-mini-bars">{[35, 55, 42, 70, 48, 84, 61, 75, 52, 93, 66, 78, 49, 81].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>}
          </article>
          <article className="stat-tile">
            <span>STUDY STREAK</span>
            <b>{progress?.streakDays ?? (progress ? '—' : '6')} <small>days</small></b>
            <div className="stat-foot stat-foot--plain"><Flame size={12} /> {progress ? 'Not reported by backend' : 'Your rhythm is holding'}</div>
            <div className="streak-dots">{week.map((day, i) => <i key={day} className={!progress && i < 5 ? 'is-filled' : ''} />)}</div>
          </article>
          <article className="stat-tile">
            <span>WEEKLY GOAL</span>
            <b>{progress ? '—' : goalPercent}<small>{progress ? '' : '%'}</small></b>
            <div className="stat-foot stat-foot--plain">{progress ? 'Not reported by backend' : range === 'THIS WEEK' ? '5.5 of 8 hours so far' : '4.7 of 8 hours so far'}</div>
            <div className="stat-progress"><i style={{ width: `${progress ? 0 : goalPercent}%` }} /></div>
          </article>
        </div>
      </div>
      <div className="overview-dark-zone">
        <div className="dashboard-grid-two">
          <section className="workspace-panel today-panel">
            <div className="panel-heading">
              <div><span className="panel-eyebrow">TODAY, IN FOCUS</span><h3>The day ahead</h3></div>
              <SectionButton section="Schedule" onClick={() => onChange('Schedule')} />
            </div>
            <TaskList day={selectedDay} tasks={tasks} completed={completed} onToggle={onToggle} />
          </section>
          <section className="workspace-panel adapt-card">
            <div className="adapt-card-orb"><Sparkles size={16} /></div>
            <span className="panel-eyebrow">{prioritiesLoaded ? 'PRIORITY PREDICTION' : 'A QUIET ADJUSTMENT'}</span>
            <h3>{prioritiesLoaded ? hasPriorities ? 'Your study order has adapted.' : 'No priority suggestions yet.' : <>Your next focus window<br />is still ahead.</>}</h3>
            <p>{prioritiesLoaded ? subjects[0]?.next ?? 'Add subject details to receive a study priority.' : 'Biology now sits at 11:00, when your energy tends to be stronger. Everything else still fits—take the day one block at a time.'}</p>
            <span className="adapt-meta"><i /> {prioritiesLoaded ? hasPriorities ? 'MODEL PRIORITY, GENERATED NOW' : 'NO MODEL OUTPUT' : 'PLAN, ADAPTED 2 MIN AGO'}</span>
          </section>
        </div>
        <section className="workspace-panel subjects-panel">
          <div className="panel-heading">
            <div><span className="panel-eyebrow">YOUR CLASSES, IN CONTEXT</span><h3>Courses in motion</h3></div>
            <SectionButton section="Subjects" onClick={() => onChange('Subjects')} />
          </div>
          <div className="subject-progress-list">{subjects.length === 0 ? <p className="demo-footnote">No connected subjects are available.</p> : subjects.slice(0, 3).map((subject) => <div className="subject-progress-row" key={subject.code}><span className={`subject-indicator ${subject.color}`} /><span className="subject-title">{subject.name}<small>{subject.metricLabel === 'PREVIOUS MARKS' ? `${subject.progress}% previous marks · ${subject.next}` : subject.next}</small></span><span className="subject-bar"><i style={{ width: `${subject.progress}%` }} /></span><span className="subject-percent">{subject.progress}%</span></div>)}</div>
        </section>
      </div>
    </div>
  );
}
function Schedule({ day, setDay, sessions, backendSessions, completed, onToggle, onOpenPlanner, connected }: { day: string; setDay: (day: string) => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void; onOpenPlanner: () => void; connected: boolean }) {
  const tasks = getTasks(day, sessions, backendSessions);
  return <><div className="section-intro-line"><p>A week shaped around your time, energy, and priorities.</p><button className="subtle-button" type="button" onClick={onOpenPlanner}>{connected ? <><Plus size={13} /> Update availability</> : <><Plus size={13} /> Add a study block</>}</button></div><div className="workspace-panel week-picker" role="group" aria-label="Choose schedule day">{week.map((label, index) => <button key={label} type="button" aria-pressed={day === label} aria-label={`${label}, ${shortDate(calendarDates[index])}`} className={`week-day ${day === label ? 'is-selected' : ''}`} onClick={() => setDay(label)}><span>{label}</span><b>{calendarDates[index].getDate()}</b><i className={getTasks(label, sessions, backendSessions).length ? 'has-items' : ''} /></button>)}</div><section className="workspace-panel schedule-detail"><div className="panel-heading"><div><span className="panel-eyebrow">{day}, {shortDate(calendarDates[week.indexOf(day)])}</span><h3>Study blocks</h3></div><span className="block-count">{tasks.length} BLOCKS</span></div><TaskList day={day} tasks={tasks} completed={completed} onToggle={onToggle} /></section><div className="workspace-panel schedule-note"><Sparkles size={15} /><span><b>There’s room in this plan.</b> If your day shifts, your study blocks can shift with it.</span></div></>;
}
function SubjectActions({ subject, onEdit, onRemove, onView }: { subject: Subject; onEdit: () => void; onRemove: () => void; onView: () => void }) {
  const [open, setOpen] = useState(false);
  return <span><button type="button" className="subtle-button" aria-label={`More actions for ${subject.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><MoreHorizontal size={15} /></button>{open && <span role="menu" aria-label={`${subject.name} actions`}><button type="button" className="subtle-button" role="menuitem" onClick={() => { onView(); setOpen(false); }}>View</button><button type="button" className="subtle-button" role="menuitem" onClick={() => { onEdit(); setOpen(false); }}>Edit</button><button type="button" className="subtle-button" role="menuitem" onClick={() => { onRemove(); setOpen(false); }}>Remove</button></span>}</span>;
}
function Subjects({ subjects, onAdd, onEdit, onRemove, onStatus }: { subjects: Subject[]; onAdd: () => void; onEdit: (subject: Subject) => void; onRemove: (subject: Subject) => void; onStatus: (message: string) => void }) {
  return <><div className="section-intro-line"><p>A clear view of the work ahead in each course.</p><button className="subtle-button" type="button" onClick={onAdd}><Plus size={13} /> Add a subject</button></div>{subjects.length === 0 ? <p className="demo-footnote">No subjects are available yet.</p> : <div className="subject-card-grid">{subjects.map((subject, i) => <article className="workspace-panel subject-card" key={subject.code}><div className="subject-card-top"><span className={`subject-indicator ${subject.color}`} /><span>{subject.code}</span><SubjectActions subject={subject} onView={() => onStatus(`${subject.name}: ${subject.metricLabel === 'PREVIOUS MARKS' ? `${subject.progress}% previous marks` : `${subject.progress}% course rhythm`}, ${subject.next}.`)} onEdit={() => onEdit(subject)} onRemove={() => onRemove(subject)} /></div><h3>{subject.name}</h3><p>{subject.metricLabel === 'PREVIOUS MARKS' ? 'Connected subject · Priority model' : 'Current course · Fall term'}</p><div className="subject-card-progress"><div><span>{subject.metricLabel ?? 'COURSE RHYTHM'}</span><b>{subject.progress}%</b></div><span className="subject-bar"><i style={{ width: `${subject.progress}%` }} /></span></div><div className="subject-card-next"><span>{subject.metricLabel === 'PREVIOUS MARKS' ? 'PRIORITY NOTE' : 'NEXT UP'}</span><b>{subject.next}</b></div><span className="subject-card-number">0{i + 1}</span></article>)}</div>}</>;
}
function Progress({ range, setRange, backendProgress }: { range: Range; setRange: (range: Range) => void; backendProgress: ProgressSummary | null }) {
  const demo = range === 'THIS WEEK' ? { hours: '8.4', sessions: '12', streak: '6', bars: [53, 78, 43, 88, 65, 28, 38] } : { hours: '7.1', sessions: '10', streak: '5', bars: [42, 65, 38, 76, 55, 20, 31] };
  const hours = backendProgress ? backendProgress.focusedHours.toFixed(1) : demo.hours;
  const sessions = backendProgress ? String(backendProgress.completedSessions) : demo.sessions;
  const streak = backendProgress?.streakDays == null ? backendProgress ? '—' : demo.streak : String(backendProgress.streakDays);
  const rangeLabel = backendProgress ? 'ALL TIME' : range;
  return <><div className="section-intro-line"><p>A record of showing up. Progress at your own pace.</p>{!backendProgress && <RangeSelector value={range} onChange={setRange} label="Choose progress date range" />}</div><div className="progress-summary"><article className="workspace-panel progress-total"><span className="panel-eyebrow">FOCUSED HOURS · {rangeLabel}</span><b>{hours} <small>hours</small></b><span><ArrowUpRight size={13} /> {backendProgress ? 'Saved completed sessions' : '+14% from last week'}</span></article><article className="workspace-panel progress-total"><span className="panel-eyebrow">SESSIONS COMPLETED</span><b>{sessions} <small>sessions</small></b><span><Check size={13} /> {backendProgress ? `${backendProgress.missedSessions ?? 0} missed` : 'across 4 subjects'}</span></article><article className="workspace-panel progress-total"><span className="panel-eyebrow">CONSISTENCY</span><b>{streak} <small>{backendProgress ? '' : 'day streak'}</small></b><span><Flame size={13} /> {backendProgress ? 'Not reported by backend' : 'A rhythm is forming'}</span></article></div><section className="workspace-panel weekly-chart"><div className="panel-heading"><div><span className="panel-eyebrow">SMALL STEPS ADD UP</span><h3>Time in focus</h3></div><span className="chart-legend"><i /> {rangeLabel}</span></div><div className="focus-chart">{backendProgress ? <p className="demo-footnote">The progress endpoint returns lifetime totals, not daily focus data.</p> : demo.bars.map((height, i) => <div className="chart-day" key={`${i}-${height}`}><span>{(height / 20).toFixed(1)}h</span><i style={{ height: `${height}%` }} /><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small></div>)}</div></section><div className="workspace-panel milestone-card"><span className="milestone-icon"><Target size={17} /></span><div><span className="panel-eyebrow">A MOMENT WORTH NOTICING</span><b>{backendProgress ? `${sessions} completed sessions recorded.` : `You showed up ${streak} days in this range.`}</b><p>{backendProgress ? 'Streak and goal data are not exposed by the backend.' : 'That’s a lovely rhythm. Keep the next step small and steady.'}</p></div><ArrowUpRight size={16} /></div></>;
}
function Goals({ goals, checked, onToggle, onAdd, isDeadlineData }: { goals: Goal[]; checked: Record<string, boolean>; onToggle: (goal: Goal) => void; onAdd: () => void; isDeadlineData: boolean }) {
  const complete = goals.filter((goal) => checked[goal.id]).length;
  const percent = goals.length ? Math.round((complete / goals.length) * 100) : 0;
  return <><div className="section-intro-line"><p>{isDeadlineData ? 'Stay oriented to the work that is coming up.' : 'Keep the week gentle, focused, and yours.'}</p><button className="subtle-button" type="button" onClick={onAdd}><Plus size={13} /> Add an intention</button></div><section className="workspace-panel goals-overview" aria-label={isDeadlineData ? 'Deadline summary' : 'Weekly goal summary'}><div className="goals-overview-top"><div><span className="panel-eyebrow">{isDeadlineData ? 'YOUR ACADEMIC DEADLINES' : `YOUR WEEK · ${shortDate(calendarDates[0])}—${shortDate(calendarDates[6])}`}</span><h3>{isDeadlineData ? 'Deadlines, one step at a time.' : 'A steady week, one intention at a time.'}</h3></div><span className="goal-count-badge">{isDeadlineData ? `${goals.length} DEADLINES` : `${complete} / ${goals.length} COMPLETE`}</span></div><div className="goals-progress-row"><div className="goals-progress-copy"><b>{isDeadlineData ? goals.length : `${percent}%`}</b><span>{isDeadlineData ? 'upcoming' : 'weekly progress'}</span></div><span className="goal-progress" role="progressbar" aria-valuenow={isDeadlineData ? 0 : percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${isDeadlineData ? 0 : percent}%` }} /></span><span className="goals-progress-detail">{isDeadlineData ? 'Read-only from your academic plan' : `${complete} of ${goals.length} intentions`}</span></div></section><section className="workspace-panel goals-list" aria-label={isDeadlineData ? 'Academic deadlines' : "This week's intentions"}><div className="goals-list-head"><div><span className="panel-eyebrow">{isDeadlineData ? 'DUE DATES FROM YOUR PLAN' : 'A FEW THINGS TO COME BACK TO'}</span><h3>{isDeadlineData ? 'Upcoming' : 'This week'}</h3></div><span>{goals.length} {isDeadlineData ? 'deadlines' : 'intentions'}</span></div><div className="goals-list-body">{goals.length === 0 ? <p className="demo-footnote">{isDeadlineData ? 'No deadlines have been saved yet.' : 'No intentions added yet.'}</p> : goals.map((goal) => <label className={`goal-row ${checked[goal.id] ? 'is-complete' : ''}`} key={goal.id}><input type="checkbox" checked={Boolean(checked[goal.id])} disabled={isDeadlineData} onChange={() => onToggle(goal)} /><span className="goal-custom-check">{checked[goal.id] && <Check size={12} />}</span><span className="goal-copy"><span className="goal-category">{goal.category}</span><b>{goal.title}</b><small>{goal.detail}</small></span><span className="goal-due"><small>{isDeadlineData ? 'SUBJECT' : 'WHEN'}</small><b>{isDeadlineData ? goal.subject ?? '—' : goal.target}</b></span></label>)}</div></section>{!isDeadlineData && <p className="demo-footnote"><Clock3 size={12} /> Sample intentions for this frontend demo.</p>}</>;
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState('TUE');
  const [planning, setPlanning] = useState(loadPlanningState);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [displayName, setDisplayName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [goals, setGoals] = useState(initialGoals);
  const [backendSessions, setBackendSessions] = useState<CustomSession[] | null>(null);
  const [backendProgress, setBackendProgress] = useState<ProgressSummary | null>(null);
  const [backendDeadlines, setBackendDeadlines] = useState<Deadline[] | null>(null);
  const [backendPriorities, setBackendPriorities] = useState<StudyPriority[]>([]);
  const [backendResources, setBackendResources] = useState<StudyResourceRecommendation[]>([]);
  const [unscheduledWork, setUnscheduledWork] = useState<UnscheduledWork[]>([]);
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false);
  const [backendLoading, setBackendLoading] = useState(hasApiBaseUrl);
  const [apiError, setApiError] = useState('');
  const [backendReady, setBackendReady] = useState(!hasApiBaseUrl);
  const [setupRequired, setSetupRequired] = useState(false);
  const [editingInput, setEditingInput] = useState(false);
  const [studyInput, setStudyInput] = useState<StudentStudyInput | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [checkedGoals, setCheckedGoals] = useState<Record<string, boolean>>({ 'goal-focus': true });
  const [overviewRange, setOverviewRange] = useState<Range>('THIS WEEK');
  const [progressRange, setProgressRange] = useState<Range>('LAST 7 DAYS');
  const [statusMessage, setStatusMessage] = useState('');
  const activeKey = params.get('section')?.toLowerCase() ?? 'overview';
  const active = sectionNames[activeKey] ?? 'Overview';
  const selectSection = (section: DashboardSection) => setParams({ section: section.toLowerCase() }, { replace: true });
  useEffect(() => { try { window.localStorage.setItem('adaptivestudy-dashboard-planning', JSON.stringify(planning)); } catch { setStatusMessage('Planning changes are active for this visit but could not be saved locally.'); } }, [planning]);
  useEffect(() => {
    if (!hasApiBaseUrl) return;
    let mounted = true;
    setBackendLoading(true);
    setBackendReady(false);
    setApiError('');
    const load = async () => {
      try {
        const input = await services.student.getStudyInput();
        if (!mounted) return;
        setStudyInput(input);
        if (!input || !isCompleteStudyInput(input)) {
          setSetupRequired(true);
          setBackendLoading(false);
          return;
        }
        const [schedule, progress, deadlines, priorities, recommendations] = await Promise.all([
          services.planner.listSchedule(),
          services.progress.getProgress('ALL TIME'),
          services.deadlines.listDeadlines(),
          services.priorities.listPriorities(),
          services.resources.listRecommendations(),
        ]);
        if (!mounted) return;
        setBackendSessions(schedule);
        setBackendProgress(progress);
        setBackendDeadlines(deadlines);
        setBackendPriorities(priorities);
        setBackendResources(recommendations);
        setPrioritiesLoaded(true);
        setSubjects(prioritySubjects(priorities));
        setDisplayName(input.studentName.trim().split(/\s+/)[0]);
        setProfileName(input.studentName);
        setSetupRequired(false);
        setBackendReady(true);
        setStatusMessage(`Connected profile for ${input.studentName}.`);
      } catch (error) {
        if (!mounted) return;
        setApiError(error instanceof Error ? error.message : 'Connected student data could not be loaded.');
      } finally {
        if (mounted) setBackendLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [reloadCount]);

  async function submitStudyInput(input: StudentStudyInput): Promise<StudyPlanResults> {
    setBackendLoading(true);
    setApiError('');
    try {
      const inputsChanged = !studyInput || studyInputSignature(studyInput) !== studyInputSignature(input);
      const result = await services.student.submitStudyInput(input, inputsChanged);
      const [progress, deadlines] = await Promise.all([
        services.progress.getProgress('ALL TIME'),
        services.deadlines.listDeadlines(),
      ]);
      setBackendSessions(result.sessions);
      setBackendProgress(progress);
      setBackendDeadlines(deadlines);
      setBackendPriorities(result.priorities);
      setBackendResources(result.recommendations);
      setUnscheduledWork(result.unscheduledWork);
      setPrioritiesLoaded(true);
      setSubjects(prioritySubjects(result.priorities));
      setStudyInput(input);
      setProfileName(input.studentName);
      setDisplayName(input.studentName.trim().split(/\s+/)[0]);
      setStatusMessage('Your profile was saved and the backend returned an updated study plan.');
      return result;
    } finally {
      setBackendLoading(false);
    }
  }

  function completeStudyInput(result: StudyPlanResults) {
    setBackendPriorities(result.priorities);
    setBackendResources(result.recommendations);
    setUnscheduledWork(result.unscheduledWork);
    setSetupRequired(false);
    setEditingInput(false);
    setBackendReady(true);
  }
  async function toggleTask(task: StudyTask, day: string) {
    if (task.scheduledDate && isBackendEnabled) {
      if (task.status === 'completed') {
        setApiError('The backend does not support reopening a completed session.');
        return;
      }
      try {
        await services.sessions.updateStatus(task.id, 'completed');
        setBackendSessions((current) => current?.map((session) => session.id === task.id ? { ...session, status: 'completed' } : session) ?? null);
        setApiError('');
        setStatusMessage(`${task.title} marked complete.`);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'The session status could not be updated.');
      }
      return;
    }
    const key = `${day}:${task.id}`;
    setPlanning((current) => ({ ...current, completed: { ...current.completed, [key]: !current.completed[key] } }));
    setStatusMessage(`${task.title} marked ${planning.completed[key] ? 'incomplete' : 'complete'}.`);
  }
  const updateSession = (session: CustomSession) => setPlanning((current) => ({ ...current, sessions: current.sessions.some((item) => item.id === session.id) ? current.sessions.map((item) => item.id === session.id ? session : item) : [...current.sessions, session] }));
  const addSubject = () => { if (hasApiBaseUrl) { setEditingInput(true); return; } const name = window.prompt('Subject name'); if (!name?.trim()) return; const subject = { name: name.trim(), code: `CUSTOM${subjects.length + 1}`, color: 'blue', progress: 0, next: 'Choose your next step' }; setSubjects((current) => [...current, subject]); setStatusMessage(`${subject.name} added.`); };
  const editSubject = (subject: Subject) => { if (hasApiBaseUrl) { setEditingInput(true); return; } const name = window.prompt('Edit subject name', subject.name); if (!name?.trim()) return; setSubjects((current) => current.map((item) => item.code === subject.code ? { ...item, name: name.trim() } : item)); setStatusMessage(`${subject.name} updated.`); };
  const removeSubject = (subject: Subject) => { if (hasApiBaseUrl) { setEditingInput(true); return; } setSubjects((current) => current.filter((item) => item.code !== subject.code)); setStatusMessage(`${subject.name} removed.`); };
  const addGoal = () => { const title = window.prompt('Intention'); if (!title?.trim()) return; const goal = { id: makeId('goal'), title: title.trim(), detail: 'A local intention for this week.', category: 'STUDY', target: 'THIS WEEK' }; setGoals((current) => [...current, goal]); setStatusMessage(`${goal.title} added.`); };
  const deadlineGoals: Goal[] = (backendDeadlines ?? []).map((deadline) => ({
    id: deadline.id,
    title: deadline.title,
    detail: deadline.notes || deadline.subject,
    category: deadline.type?.toUpperCase() ?? 'DEADLINE',
    target: new Date(`${deadline.dueAt}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    subject: deadline.subject,
  }));
  return <WorkspaceShell active={active} onSectionChange={selectSection} eyebrow={`YOUR STUDY SPACE / ${active.toUpperCase()}`} title={active === 'Overview' ? 'Your week, in rhythm.' : `${active}.`} profileName={profileName} profileDetail={hasApiBaseUrl ? 'Connected study profile' : 'Computer Science · Year 2'}>
    {hasApiBaseUrl && backendLoading && <div className="workspace-panel schedule-note" role="status">Loading and verifying your connected study data…</div>}
    {hasApiBaseUrl && apiError && !backendReady && <section className="workspace-panel student-intake-error-panel" role="alert"><h2>We couldn’t load your study profile.</h2><p>{apiError}</p><div className="student-intake-actions"><Link className="subtle-button" to="/login">Sign in</Link><button className="student-intake-primary" type="button" onClick={() => setReloadCount((count) => count + 1)}>Try again</button></div></section>}
    {hasApiBaseUrl && (setupRequired || editingInput) && !apiError && <StudentIntake
      initialValue={studyInput}
      onSubmit={submitStudyInput}
      onComplete={completeStudyInput}
      onCancel={editingInput && backendReady ? () => setEditingInput(false) : undefined}
    />}
    {(!hasApiBaseUrl || (backendReady && !setupRequired && !editingInput)) && <>
      {!hasApiBaseUrl && <div className="workspace-panel schedule-note" role="note">Demo preview only: example student data is not real, is not saved, and is never sent to a backend.</div>}
      {hasApiBaseUrl && (apiError
        ? <section className="workspace-panel student-intake-error-panel" role="alert"><h2>A connected study action failed.</h2><p>{apiError}</p><button className="subtle-button" type="button" onClick={() => setApiError('')}>Dismiss</button></section>
        : <div className="workspace-panel schedule-note" role="status">Connected study data loaded from your account. <button type="button" className="subtle-button" onClick={() => setEditingInput(true)}>Edit study inputs</button></div>)}
      <span aria-live="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{statusMessage}</span>
      {hasApiBaseUrl && <PlanResults priorities={backendPriorities} warnings={unscheduledWork} recommendations={backendResources} />}
      {active === 'Overview' && <Overview onChange={selectSection} selectedDay={selectedDay} setSelectedDay={setSelectedDay} sessions={hasApiBaseUrl ? [] : planning.sessions} backendSessions={backendSessions} completed={hasApiBaseUrl ? {} : planning.completed} onToggle={toggleTask} range={overviewRange} setRange={setOverviewRange} progress={backendProgress} prioritiesLoaded={prioritiesLoaded} onStatus={setStatusMessage} onAddSession={updateSession} onEditSession={updateSession} onDeleteSession={(session) => setPlanning((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }))} subjects={subjects} displayName={displayName} connected={hasApiBaseUrl} onEditInputs={() => setEditingInput(true)} />}
      {active === 'Schedule' && <Schedule day={selectedDay} setDay={setSelectedDay} sessions={hasApiBaseUrl ? [] : planning.sessions} backendSessions={backendSessions} completed={hasApiBaseUrl ? {} : planning.completed} onToggle={toggleTask} connected={hasApiBaseUrl} onOpenPlanner={() => { if (hasApiBaseUrl) setEditingInput(true); else { setStatusMessage('Planner opened. Add a block for the selected day.'); selectSection('Overview'); } }} />}
      {active === 'Subjects' && <Subjects subjects={subjects} onAdd={addSubject} onEdit={editSubject} onRemove={removeSubject} onStatus={setStatusMessage} />}
      {active === 'Progress' && <Progress range={progressRange} setRange={setProgressRange} backendProgress={backendProgress} />}
      {active === 'Goals' && <Goals goals={backendDeadlines === null ? goals : deadlineGoals} checked={checkedGoals} onToggle={(goal) => { setCheckedGoals((current) => ({ ...current, [goal.id]: !current[goal.id] })); setStatusMessage(`${goal.title} ${checkedGoals[goal.id] ? 'unchecked' : 'complete'}.`); }} onAdd={addGoal} isDeadlineData={backendDeadlines !== null} />}
    </>}
  </WorkspaceShell>;
}
