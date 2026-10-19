import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, Flame, MoreHorizontal, Plus, Sparkles, Target } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import WorkspaceShell, { type DashboardSection } from '../components/WorkspaceShell';
import { initialGoals, initialSubjects, schedules, studyPreviewDaily, studyPreviewProgress, type CustomSession, type Goal, type StudyTask, type Subject } from '../data/studyDemoData';
import { hasApiBaseUrl, isBackendEnabled, isProfileMissingError, services } from '../services';
import type { Deadline, ProgressSummary, StudentProfile, StudentSubject, StudyPriority } from '../services/contracts';
import './SubjectPriorityDetails.css';

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
const demoWeeklySchedule: CustomSession[] = week.flatMap((day, index) =>
  (schedules[day] ?? []).map((task) => ({
    ...task,
    day,
    scheduledDate: dateKey(calendarDates[index]),
  })),
);
const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
const timeOptions = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
const durationOptions = ['25', '45', '60', '90'];
function subjectsFromProfile(subjects: StudentSubject[]): Subject[] {
  const colors = ['blue', 'ice', 'steel', 'sky'];
  return subjects.map((subject, index) => ({
    name: subject.name,
    code: subject.id,
    color: colors[index % colors.length],
    progress: Math.max(0, Math.min(100, Math.round(subject.previousMarks))),
    metricLabel: 'PREVIOUS MARKS',
    next: `${subject.examCount} exams recorded`,
  }));
}
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
function getTasks(day: string, sessions: CustomSession[], backendSessions: CustomSession[] | null = null, demoSchedulePreview = false) {
  const dayIndex = week.indexOf(day);
  const date = dayIndex >= 0 ? dateKey(calendarDates[dayIndex]) : '';
  const source = hasApiBaseUrl
    ? backendSessions?.length
      ? backendSessions.filter((session) => session.day === day && session.scheduledDate === date)
      : demoSchedulePreview
        ? demoWeeklySchedule.filter((session) => session.day === day && session.scheduledDate === date)
        : []
    : schedules[day] ?? [];
  return [...source, ...(hasApiBaseUrl ? [] : sessions.filter((session) => session.day === day))]
    .sort((a, b) => a.time.localeCompare(b.time));
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(task: StudyTask) {
  const [hours, minutes] = task.time.split(':').map(Number);
  const duration = Number.parseInt(task.length, 10) || 0;
  const endTime = new Date(2000, 0, 1, hours, minutes + duration);
  return `${formatTime(task.time)}–${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function SectionButton({ section, onClick }: { section: DashboardSection; onClick: () => void }) { return <button type="button" className="subtle-button" onClick={onClick}>View {section.toLowerCase()} <ArrowRight size={13} /></button>; }
function parsePriorityNote(note: string): { priority: string; reasons: string[] } {
  const separator = note.indexOf('·');
  if (separator < 0) return { priority: '', reasons: [] };
  const heading = note.slice(0, separator).trim();
  if (!/(?:LOW|MEDIUM|HIGH|RANK\s+\d+)\s+PRIORITY/i.test(heading)) return { priority: '', reasons: [] };
  const priority = heading.replace(/\s+PRIORITY$/i, '').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const reasons = note.slice(separator + 1).split(';').flatMap((part) => {
    const reason = part.trim().replace(/[.;\s]+$/, '');
    if (!reason || /\b(?:it[-_])?[a-f0-9]{16,}\b/i.test(reason)
      || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(reason)
      || /\b(?:integration\s+test\s+subject|test\s+subject)\b/i.test(reason)) return [];
    const criteria = reason.match(/^(Marks are at least \d+)\s+and\s+(fewer than \d+ sessions were missed)$/i);
    if (criteria) return [criteria[1], criteria[2]];
    const deadline = reason.match(/^(.+ deadline) in (\d+) day\(s\)$/i);
    if (deadline) return [`${deadline[1]} is in ${deadline[2]} ${deadline[2] === '1' ? 'day' : 'days'}`];
    return [reason];
  });
  return { priority: `Priority: ${priority}`, reasons };
}

function PriorityDetails({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const { priority, reasons } = parsePriorityNote(note);
  if (!priority) return <span className="priority-details-unavailable">Priority guidance will appear when available.</span>;
  return <div className="priority-details">
    <button type="button" className="priority-details-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((open) => !open)}>
      <span>Priority details</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    <div id={panelId} className={`priority-details-panel ${expanded ? 'is-open' : ''}`} aria-hidden={!expanded}>
      <div className="priority-details-inner"><strong>{priority}</strong>{reasons.length > 0 && <ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>}</div>
    </div>
  </div>;
}
function RangeSelector({ value, onChange, label }: { value: Range; onChange: (range: Range) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return <div className="range-selector"><button type="button" className="date-select" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{value} <span>⌄</span></button>{open && <div role="listbox" aria-label={`${label} options`}>{(['THIS WEEK', 'LAST 7 DAYS'] as Range[]).map((option) => <button type="button" role="option" aria-selected={value === option} aria-pressed={value === option} key={option} className="subtle-button" onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div>;
}
function TaskList({ day, tasks, completed, onToggle, loading, error }: { day: string; tasks: StudyTask[]; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void; loading: boolean; error: string }) {
  return <div className="study-task-list">{tasks.length === 0 ? <p className="demo-footnote" role={error ? 'alert' : undefined}>{loading ? 'Loading saved study sessions…' : error || 'No study blocks are planned for this day.'}</p> : tasks.map((task) => {
    const demoSession = task.id.startsWith('demo-schedule-');
    const completionKey = `${day}:${task.id}`;
    const checked = demoSession && Object.prototype.hasOwnProperty.call(completed, completionKey)
      ? Boolean(completed[completionKey])
      : task.status === 'completed' || Boolean(completed[completionKey]);
    const terminal = !demoSession && (task.status === 'completed' || task.status === 'missed' || task.status === 'skipped');
    const state = checked ? 'COMPLETED' : demoSession && task.status === 'completed' ? 'PLANNED' : task.status ? task.status.replace('-', ' ').toUpperCase() : task.kind;
    const canComplete = demoSession || !hasApiBaseUrl || !task.scheduledDate || canMarkSessionComplete(task);
    return <div className={`study-task ${checked ? 'is-done' : ''}`} key={`${day}-${task.id}`}><span className="study-task-time">{formatTime(task.time)}</span><button type="button" className="task-check" disabled={terminal || !canComplete} aria-label={checked ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`} aria-pressed={checked} onClick={() => onToggle(task, day)}>{checked && <Check size={11} />}</button><span className="task-time-line" /><div className="study-task-copy"><b>{task.title}</b><small>{task.subject} <i>·</i> {formatTimeRange(task)} <i>·</i> {task.length}{task.priority && <> <i>·</i> {task.priority} priority</>}</small></div><span className="study-task-kind" style={task.status === 'missed' || task.status === 'skipped' ? { color: '#f2a6a6' } : undefined}>{state}</span></div>;
  })}</div>;
}
function WeekCalendar({ selectedDay, onSelect, onOpenSchedule, sessions, backendSessions, demoSchedulePreview, demoScheduleMessage, loading, error }: { selectedDay: string; onSelect: (day: string) => void; onOpenSchedule: () => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null; demoSchedulePreview: boolean; demoScheduleMessage: string; loading: boolean; error: string }) {
  const selectedTasks = getTasks(selectedDay, sessions, backendSessions, demoSchedulePreview);
  const nextTask = selectedTasks[0];
  const selectedDate = calendarDates[week.indexOf(selectedDay)];
  const label = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return <section className="workspace-panel overview-calendar" aria-label="Weekly study calendar"><div className="overview-calendar-head"><div><span className="panel-eyebrow"><CalendarDays size={12} /> YOUR WEEK AT A GLANCE</span><h3>{label(calendarDates[0])} <i>—</i> {label(calendarDates[6])}</h3></div><button type="button" className="subtle-button" onClick={onOpenSchedule}>Open schedule <ArrowRight size={13} /></button></div><div className="overview-calendar-days" role="group" aria-label="Choose a day">{week.map((day, index) => <button type="button" key={day} aria-pressed={selectedDay === day} aria-label={`${day}, ${label(calendarDates[index])}`} className={`overview-calendar-day ${selectedDay === day ? 'is-selected' : ''}`} onClick={() => onSelect(day)}><span>{day.slice(0, 1)}<small>{day.slice(1).toLowerCase()}</small></span><b>{calendarDates[index].getDate()}</b><i className={getTasks(day, sessions, backendSessions, demoSchedulePreview).length ? 'has-items' : ''} /></button>)}</div>{demoSchedulePreview && <p className="demo-footnote">{demoScheduleMessage}</p>}<div className="overview-calendar-next"><span className="calendar-selected-date">{selectedDay} <i>·</i> {label(selectedDate)}</span><span className="calendar-session-count">{loading ? 'Loading sessions…' : error && !demoSchedulePreview ? 'Schedule unavailable' : `${selectedTasks.length} planned ${selectedTasks.length === 1 ? 'session' : 'sessions'}`}</span><span className="calendar-next-task"><small>UP NEXT</small><b>{loading ? 'Loading saved schedule…' : error && !demoSchedulePreview ? 'Schedule unavailable' : nextTask ? `${formatTime(nextTask.time)} · ${nextTask.title}` : 'A little open space'}</b></span></div></section>;
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

function Overview({ onChange, selectedDay, setSelectedDay, sessions, backendSessions, demoSchedulePreview, demoScheduleMessage, completed, onToggle, range, setRange, progress, progressLoading, progressError, backendEnabled, prioritiesLoaded, prioritiesAvailable, priorityLoading, priorityError, deadlines, deadlinesLoading, deadlinesError, scheduleLoading, scheduleError, onStatus, onAddSession, onEditSession, onDeleteSession, subjects, subjectsLoading, displayName, profileLoading }: { onChange: (section: DashboardSection) => void; selectedDay: string; setSelectedDay: (day: string) => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null; demoSchedulePreview: boolean; demoScheduleMessage: string; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void; range: Range; setRange: (range: Range) => void; progress: ProgressSummary | null; progressLoading: boolean; progressError: string; backendEnabled: boolean; prioritiesLoaded: boolean; prioritiesAvailable: boolean; priorityLoading: boolean; priorityError: string; deadlines: Deadline[] | null; deadlinesLoading: boolean; deadlinesError: string; scheduleLoading: boolean; scheduleError: string; onStatus: (message: string) => void; onAddSession: (session: CustomSession) => void; onEditSession: (session: CustomSession) => void; onDeleteSession: (session: CustomSession) => void; subjects: Subject[]; subjectsLoading: boolean; displayName: string; profileLoading: boolean }) {
  const tasks = getTasks(selectedDay, sessions, backendSessions, demoSchedulePreview);
  const upcomingDeadlines = deadlines?.filter((deadline) => deadline.status !== 'completed') ?? [];
  const normalizedProgress = getProgressDisplayData({
    progress,
    sessions: backendSessions,
    backendEnabled,
    progressLoading,
    progressError,
    sessionsLoading: scheduleLoading,
    sessionsError: scheduleError,
  });
  const { demoPreviewMode, focusedHours, completedCount, streakDays, weeklyGoalHours, weeklyHours, weeklyProgress } = normalizedProgress;
  const hasPriorities = prioritiesAvailable;
  return (
    <div className="dashboard-overview">
      <div className="overview-light-zone">
        <div className="dashboard-greeting">
          <div>
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} <span>·</span> A little room to focus</p>
            <h2>{profileLoading ? 'Loading your profile…' : `Good morning, ${displayName || 'there'}.`}</h2>
            <span className="greeting-sub">One focused session at a time.</span>
          </div>
          {!backendEnabled && <RangeSelector value={range} onChange={setRange} label="Choose overview date range" />}
        </div>
        <div className="overview-planning-row">
          <WeekCalendar selectedDay={selectedDay} onSelect={setSelectedDay} onOpenSchedule={() => onChange('Schedule')} sessions={sessions} backendSessions={backendSessions} demoSchedulePreview={demoSchedulePreview} demoScheduleMessage={demoScheduleMessage} loading={scheduleLoading} error={scheduleError} />
          {backendEnabled
            ? <div className="workspace-panel schedule-note"><Sparkles size={15} /><span><b>Connected schedule.</b> Generate saved study sessions from the Schedule page.</span><SectionButton section="Schedule" onClick={() => onChange('Schedule')} /></div>
            : <TimeBlockWidget selectedDay={selectedDay} sessions={sessions} onAdd={onAddSession} onEdit={onEditSession} onDelete={onDeleteSession} onStatus={onStatus} />}
        </div>
        <div className="workspace-stats">
          <article className="stat-tile">
            <span>FOCUS ALL TIME</span>
            <b>{demoPreviewMode || focusedHours > 0 ? focusedHours.toFixed(1) : progressLoading ? 'Loading…' : 'No focus yet'} <small>{demoPreviewMode || focusedHours > 0 ? 'hrs' : ''}</small></b>
            <div className="stat-foot"><ArrowUpRight size={12} /> {demoPreviewMode ? `${completedCount} sessions completed · Demo preview` : `${completedCount} sessions completed`}</div>
          </article>
          <article className="stat-tile">
            <span>STUDY STREAK</span>
            <b>{streakDays ?? (progressLoading ? 'Loading…' : 'Start today')} <small>{streakDays !== null ? 'days' : ''}</small></b>
            <div className="stat-foot stat-foot--plain"><Flame size={12} /> {demoPreviewMode ? 'Consistent study activity · Demo preview' : streakDays !== null ? 'Consistent study activity' : 'Build a streak with your next session'}</div>
            <div className="streak-dots">{week.map((day, i) => <i key={day} className={i < (streakDays ?? 0) ? 'is-filled' : ''} />)}</div>
          </article>
          <article className="stat-tile">
            <span>WEEKLY GOAL</span>
            <b>{weeklyGoalHours ? `${weeklyHours.toFixed(1)} / ${weeklyGoalHours}` : progressLoading ? 'Loading…' : 'Set a goal'}<small>{weeklyGoalHours ? ' hrs' : ''}</small></b>
            <div className="stat-foot stat-foot--plain">{weeklyProgress !== null ? `${weeklyProgress}% of weekly goal${demoPreviewMode ? ' · Demo preview' : ''}` : 'Set a weekly goal to track progress'}</div>
            {weeklyProgress !== null && <div className="stat-progress"><i style={{ width: `${weeklyProgress}%` }} /></div>}
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
            {demoSchedulePreview && <p className="demo-footnote">{demoScheduleMessage}</p>}
            <TaskList day={selectedDay} tasks={tasks} completed={completed} onToggle={onToggle} loading={scheduleLoading} error={scheduleError} />
          </section>
          <section className="workspace-panel adapt-card">
            <div className="adapt-card-orb"><Sparkles size={16} /></div>
            <span className="panel-eyebrow">{prioritiesLoaded ? 'PRIORITY PREDICTION' : 'A QUIET ADJUSTMENT'}</span>
            <h3>{prioritiesLoaded ? hasPriorities ? 'Your study order has adapted.' : 'No priority suggestions yet.' : backendEnabled ? priorityLoading ? 'Loading study priorities…' : 'Study priorities unavailable.' : <>Your next focus window<br />is still ahead.</>}</h3>
            <p>{prioritiesLoaded ? subjects[0]?.next ?? 'Add subject details to receive a study priority.' : backendEnabled ? priorityError || 'Priority suggestions have not loaded.' : 'Sample planning insight · not live data.'}</p>
            <span className="adapt-meta"><i /> {prioritiesLoaded ? hasPriorities ? 'BACKEND PRIORITY PREDICTION' : 'NO MODEL OUTPUT' : backendEnabled ? 'CONNECTED PRIORITY DATA' : 'DEMO PREVIEW'}</span>
          </section>
        </div>
        <section className="workspace-panel subjects-panel">
          <div className="panel-heading">
            <div><span className="panel-eyebrow">YOUR CLASSES, IN CONTEXT</span><h3>Courses in motion</h3></div>
            <SectionButton section="Subjects" onClick={() => onChange('Subjects')} />
          </div>
          <div className="subject-progress-list">{subjects.length === 0 ? <p className="demo-footnote">{subjectsLoading ? 'Loading connected subjects…' : 'No subjects are available yet.'}</p> : subjects.slice(0, 3).map((subject) => <div className="subject-progress-row" key={subject.code}><span className={`subject-indicator ${subject.color}`} /><span className="subject-title">{subject.name}<small>{subject.metricLabel === 'PREVIOUS MARKS' || subject.metricLabel === 'SAMPLE MARKS' ? `${subject.metricLabel === 'SAMPLE MARKS' ? 'Sample marks' : 'Previous marks'}: ${subject.progress}% · ${parsePriorityNote(subject.next).priority || 'Priority guidance not available'}` : subject.next}</small></span><span className="subject-bar"><i style={{ width: `${subject.progress}%` }} /></span><span className="subject-percent">{subject.progress}%</span></div>)}</div>
        </section>
        <section className="workspace-panel subjects-panel" aria-label="Upcoming academic deadlines">
          <div className="panel-heading"><div><span className="panel-eyebrow">COMING UP</span><h3>Academic deadlines</h3></div><SectionButton section="Goals" onClick={() => onChange('Goals')} /></div>
          {deadlinesLoading ? <p className="demo-footnote">Loading connected deadlines…</p>
            : deadlinesError ? <p className="demo-footnote">{deadlinesError}</p>
              : !upcomingDeadlines.length ? <p className="demo-footnote">{deadlines?.length ? 'All saved deadlines are complete.' : backendEnabled ? 'No academic deadlines are saved.' : 'Sample goals are shown in Goals.'}</p>
                : upcomingDeadlines.slice(0, 3).map((deadline) => {
                  const dueDate = new Date(`${deadline.dueAt}T00:00:00`);
                  const daysRemaining = Math.ceil((dueDate.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
                  const urgency = daysRemaining < 0 ? 'OVERDUE' : daysRemaining <= 7 ? 'DUE SOON' : 'UPCOMING';
                  return <div className="subject-progress-row" key={deadline.id}><span className={`subject-indicator ${urgency === 'OVERDUE' ? 'sky' : urgency === 'DUE SOON' ? 'ice' : 'blue'}`} /><span className="subject-title">{deadline.title}<small>{deadline.subject} · {urgency} · {deadline.dueAt}</small></span><span className="subject-percent">{daysRemaining < 0 ? `${Math.abs(daysRemaining)}d late` : `${daysRemaining}d`}</span></div>;
                })}
        </section>
      </div>
    </div>
  );
}
function Schedule({ day, setDay, sessions, backendSessions, demoSchedulePreview, demoScheduleMessage, completed, onToggle, onOpenPlanner, onGenerateSchedule, isGeneratingSchedule, connected, loading, error }: { day: string; setDay: (day: string) => void; sessions: CustomSession[]; backendSessions: CustomSession[] | null; demoSchedulePreview: boolean; demoScheduleMessage: string; completed: Record<string, boolean>; onToggle: (task: StudyTask, day: string) => void; onOpenPlanner: () => void; onGenerateSchedule: () => void; isGeneratingSchedule: boolean; connected: boolean; loading: boolean; error: string }) {
  const tasks = getTasks(day, sessions, backendSessions, demoSchedulePreview);
  return <><div className="section-intro-line"><p>A week shaped around your time, energy, and priorities.</p><span>{connected && <button className="subtle-button" type="button" onClick={onGenerateSchedule} disabled={isGeneratingSchedule || loading}><Sparkles size={13} /> {isGeneratingSchedule ? 'Generating schedule…' : 'Generate study schedule'}</button>} {!connected && <button className="subtle-button" type="button" onClick={onOpenPlanner}><Plus size={13} /> Add a study block</button>}</span></div>{demoSchedulePreview && <p className="demo-footnote">{demoScheduleMessage}</p>}<div className="workspace-panel week-picker" role="group" aria-label="Choose schedule day">{week.map((label, index) => <button key={label} type="button" aria-pressed={day === label} aria-label={`${label}, ${shortDate(calendarDates[index])}`} className={`week-day ${day === label ? 'is-selected' : ''}`} onClick={() => setDay(label)}><span>{label}</span><b>{calendarDates[index].getDate()}</b><i className={getTasks(label, sessions, backendSessions, demoSchedulePreview).length ? 'has-items' : ''} /></button>)}</div><section className="workspace-panel schedule-detail"><div className="panel-heading"><div><span className="panel-eyebrow">{day}, {shortDate(calendarDates[week.indexOf(day)])}</span><h3>Study blocks</h3></div><span className="block-count">{loading ? 'LOADING' : `${tasks.length} ${tasks.length === 1 ? 'BLOCK' : 'BLOCKS'}`}</span></div><TaskList day={day} tasks={tasks} completed={completed} onToggle={onToggle} loading={loading} error={error} /></section><div className="workspace-panel schedule-note"><Sparkles size={15} /><span><b>{demoSchedulePreview ? 'Demo schedule preview.' : connected ? 'Saved schedule data.' : 'There’s room in this plan.'}</b> {demoSchedulePreview ? `${error ? 'Connected schedule data is unavailable; ' : ''}these sample blocks are not saved to your account.` : connected ? 'Session changes are made through the connected schedule tools.' : 'If your day shifts, your study blocks can shift with it.'}</span></div></>;
}
function SubjectActions({ subject, onEdit, onRemove, onView }: { subject: Subject; onEdit: () => void; onRemove: () => void; onView: () => void }) {
  const [open, setOpen] = useState(false);
  return <span><button type="button" className="subtle-button" aria-label={`More actions for ${subject.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><MoreHorizontal size={15} /></button>{open && <span role="menu" aria-label={`${subject.name} actions`}><button type="button" className="subtle-button" role="menuitem" onClick={() => { onView(); setOpen(false); }}>View</button><button type="button" className="subtle-button" role="menuitem" onClick={() => { onEdit(); setOpen(false); }}>Edit</button><button type="button" className="subtle-button" role="menuitem" onClick={() => { onRemove(); setOpen(false); }}>Remove</button></span>}</span>;
}
function Subjects({ subjects, onAdd, onEdit, onRemove, onStatus, connected, canManage, loading, error }: { subjects: Subject[]; onAdd: () => void; onEdit: (subject: Subject) => void; onRemove: (subject: Subject) => void; onStatus: (message: string) => void; connected: boolean; canManage: boolean; loading: boolean; error: string }) {
  const previewSubjects = subjects.some((subject) => subject.metricLabel === 'SAMPLE MARKS');
  return <><div className="section-intro-line"><p>A clear view of the work ahead in each course.</p>{canManage && <button className="subtle-button" type="button" onClick={onAdd}><Plus size={13} /> Add a subject</button>}</div>{error && <p className="demo-footnote" role="alert">{error}</p>}{previewSubjects && <p className="demo-footnote">Demo subject preview · sample marks and priority cues are not saved to an account.</p>}{subjects.length === 0 ? <p className="demo-footnote">{loading ? 'Loading connected subjects and priorities…' : error ? 'Subject insights could not be loaded.' : connected ? 'No subjects are saved to this study account yet.' : 'Sample subjects are unavailable.'}</p> : <div className="subject-card-grid">{subjects.map((subject, i) => <article className="workspace-panel subject-card" key={subject.code}><div className="subject-card-top"><span className={`subject-indicator ${subject.color}`} />{!connected && !/^(?:it[-_])?[a-f0-9]{8,}$/i.test(subject.code) && <span>{subject.code}</span>}{canManage && <SubjectActions subject={subject} onView={() => onStatus(`${subject.name}: ${subject.metricLabel === 'PREVIOUS MARKS' || subject.metricLabel === 'SAMPLE MARKS' ? `${subject.progress}% previous marks` : `${subject.progress}% course rhythm`}, ${subject.next}.`)} onEdit={() => onEdit(subject)} onRemove={() => onRemove(subject)} />}</div><h3>{subject.name}</h3><p>{subject.metricLabel === 'PREVIOUS MARKS' ? 'Connected subject · previous marks' : subject.metricLabel === 'SAMPLE MARKS' ? 'Demo subject · sample marks' : 'Sample subject · not connected'}</p><div className="subject-card-progress"><div><span>{subject.metricLabel ?? 'COURSE RHYTHM'}</span><b>{subject.progress}%</b></div><span className="subject-bar"><i style={{ width: `${subject.progress}%` }} /></span></div><div className="subject-card-next">{subject.metricLabel === 'PREVIOUS MARKS' || subject.metricLabel === 'SAMPLE MARKS' ? <><span>PRIORITY NOTE</span><PriorityDetails note={subject.next} /></> : <><span>NEXT UP</span><b>{subject.next}</b></>}</div><span className="subject-card-number">0{i + 1}</span></article>)}</div>}</>;
}
function sessionIsComplete(task: StudyTask) {
  return task.status === 'completed';
}

function sessionIsMissed(task: StudyTask) {
  return task.status === 'missed' || task.status === 'skipped';
}

function canMarkSessionComplete(task: StudyTask) {
  if (!task.scheduledDate || !task.time) return false;
  const [hour, minute] = task.time.split(':').map(Number);
  const end = new Date(`${task.scheduledDate}T00:00:00`);
  end.setMinutes(hour * 60 + minute + (Number.parseInt(task.length, 10) || 0));
  return Date.now() >= end.getTime();
}

function getProgressDisplayData({
  progress,
  sessions,
  backendEnabled,
  progressLoading,
  progressError,
  sessionsLoading,
  sessionsError,
}: {
  progress: ProgressSummary | null;
  sessions: CustomSession[] | null;
  backendEnabled: boolean;
  progressLoading: boolean;
  progressError: string;
  sessionsLoading: boolean;
  sessionsError: string;
}) {
  const realSessions = sessions ?? [];
  const sessionFocusedHours = realSessions
    .filter(sessionIsComplete)
    .reduce((total, session) => total + (Number.parseInt(session.length, 10) || 0), 0) / 60;
  const focusedHours = Math.max(progress?.focusedHours ?? 0, sessionFocusedHours);
  const completedCount = Math.max(progress?.completedSessions ?? 0, realSessions.filter(sessionIsComplete).length);
  const missedCount = Math.max(progress?.missedSessions ?? 0, realSessions.filter(sessionIsMissed).length);
  const hasRealProgress = focusedHours > 0 || completedCount > 0 || missedCount > 0;
  const demoPreviewMode = !backendEnabled || (
    !progressLoading && !sessionsLoading && !hasRealProgress
  );
  const completedDates = [...new Set(realSessions
    .filter(sessionIsComplete)
    .map((session) => session.scheduledDate)
    .filter((date): date is string => Boolean(date)))].sort().reverse();
  let derivedStreak: number | null = null;
  if (completedDates.length) {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    const firstDate = new Date(`${completedDates[0]}T00:00:00`);
    if (Math.floor((current.getTime() - firstDate.getTime()) / 86400000) <= 1) {
      derivedStreak = 1;
      for (let index = 1; index < completedDates.length; index += 1) {
        const previous = new Date(`${completedDates[index - 1]}T00:00:00`);
        const next = new Date(`${completedDates[index]}T00:00:00`);
        if (Math.round((previous.getTime() - next.getTime()) / 86400000) !== 1) break;
        derivedStreak += 1;
      }
    }
  }
  const streakDays = demoPreviewMode
    ? studyPreviewProgress.streakDays
    : progress?.streakDays ?? derivedStreak;
  const daily = progress?.daily.length
    ? progress.daily.map((item) => ({
        day: item.day,
        shortDay: item.day.slice(0, 3),
        hours: item.focusedMinutes / 60,
      }))
    : realSessions.length
      ? calendarDates.map((date, index) => ({
          day: date.toLocaleDateString('en-US', { weekday: 'long' }),
          shortDay: week[index].slice(0, 1) + week[index].slice(1).toLowerCase(),
          hours: realSessions
            .filter((session) => session.status === 'completed' && session.scheduledDate === dateKey(date))
            .reduce((total, session) => total + (Number.parseInt(session.length, 10) || 0), 0) / 60,
        }))
      : [];
  const weeklyGoalHours = demoPreviewMode ? studyPreviewProgress.weeklyGoalHours : progress?.weeklyGoalHours ?? null;
  const weeklyHours = demoPreviewMode ? studyPreviewProgress.focusedHours : daily.reduce((total, item) => total + item.hours, 0);
  const weeklyProgress = demoPreviewMode
    ? studyPreviewProgress.weeklyProgress
    : weeklyGoalHours && daily.length
      ? Math.min(100, Math.round((weeklyHours / weeklyGoalHours) * 100))
      : null;
  return {
    demoPreviewMode,
    previewUnavailable: Boolean(progressError || sessionsError),
    focusedHours: demoPreviewMode ? studyPreviewProgress.focusedHours : focusedHours,
    completedCount: demoPreviewMode ? studyPreviewProgress.completedSessions : completedCount,
    missedCount: demoPreviewMode ? studyPreviewProgress.missedSessions : missedCount,
    streakDays,
    weeklyGoalHours,
    weeklyHours,
    weeklyProgress,
    daily: demoPreviewMode ? studyPreviewDaily : daily,
  };
}

function Progress({ range, setRange, backendProgress, backendEnabled, demoSchedulePreview, demoScheduleMessage, loading, error, sessions, sessionsLoading, sessionsError, completed, onToggleSession }: {
  range: Range;
  setRange: (range: Range) => void;
  backendProgress: ProgressSummary | null;
  backendEnabled: boolean;
  demoSchedulePreview: boolean;
  demoScheduleMessage: string;
  loading: boolean;
  error: string;
  sessions: CustomSession[] | null;
  sessionsLoading: boolean;
  sessionsError: string;
  completed: Record<string, boolean>;
  onToggleSession: (session: CustomSession) => void;
}) {
  const normalized = getProgressDisplayData({
    progress: backendProgress,
    sessions,
    backendEnabled,
    progressLoading: loading,
    progressError: error,
    sessionsLoading,
    sessionsError,
  });
  const realSessions = sessions ?? [];
  const { demoPreviewMode, previewUnavailable, focusedHours, completedCount, missedCount, streakDays, weeklyGoalHours, weeklyProgress } = normalized;
  const showDemoTasks = demoSchedulePreview;
  const taskSessions = showDemoTasks ? demoWeeklySchedule : realSessions;
  const isDemoSession = (session: CustomSession) => session.id.startsWith('demo-schedule-');
  const isTaskComplete = (session: CustomSession) => {
    const key = `${session.day}:${session.id}`;
    return isDemoSession(session) && Object.prototype.hasOwnProperty.call(completed, key)
      ? Boolean(completed[key])
      : sessionIsComplete(session) || Boolean(completed[key]);
  };
  const completedTasks = taskSessions.filter(isTaskComplete).length;
  const missedTasks = taskSessions.filter(sessionIsMissed).length;
  const pendingTasks = taskSessions.length - completedTasks - missedTasks;
  const subjectRows = backendProgress?.subjects ?? [];
  const streak = streakDays === null ? 'No streak yet' : String(streakDays);
  const chartData = normalized.daily;
  return <>
    <div className="section-intro-line">
        <p>A record of showing up. Progress at your own pace.</p>
        {!backendEnabled && <RangeSelector value={range} onChange={setRange} label="Choose overview date range" />}
    </div>
    {demoPreviewMode && <p className="demo-footnote">Demo activity preview · {previewUnavailable ? 'Connected activity could not be loaded; these sample values are not saved.' : 'sample totals and focus chart are separate from saved account history.'}</p>}
    <div className="progress-summary">
        <article className="workspace-panel progress-total"><span className="panel-eyebrow">FOCUSED HOURS · {demoPreviewMode ? 'SAMPLE' : 'ALL TIME'}</span><b>{demoPreviewMode ? '7.1' : focusedHours > 0 ? focusedHours.toFixed(1) : 'No focus time'} <small>{demoPreviewMode || focusedHours > 0 ? 'hours' : ''}</small></b><span><ArrowUpRight size={13} /> {demoPreviewMode ? 'Demo activity preview' : focusedHours > 0 ? 'Saved and completed study sessions' : 'No focus time recorded yet'}</span></article>
        <article className="workspace-panel progress-total"><span className="panel-eyebrow">SESSIONS COMPLETED</span><b>{demoPreviewMode ? '10' : completedCount} <small>sessions</small></b><span><Check size={13} /> {demoPreviewMode ? '2 missed · demo activity preview' : missedCount > 0 ? `${missedCount} missed` : 'No missed sessions recorded'}</span></article>
        <article className="workspace-panel progress-total"><span className="panel-eyebrow">STREAK</span><b>{streak} <small>{streakDays !== null ? 'days' : ''}</small></b><span><Flame size={13} /> {demoPreviewMode ? 'Demo activity preview' : 'Build a rhythm one session at a time'}</span></article>
    </div>
    <div className="goals-overview-top" aria-label="Weekly study goal"><span className="goal-count-badge">{weeklyGoalHours ? `WEEKLY GOAL · ${weeklyGoalHours} HOURS` : 'WEEKLY GOAL · SET A GOAL'}</span><span className="goal-count-badge">{weeklyProgress !== null ? `${weeklyProgress}%${demoPreviewMode ? ' · DEMO PREVIEW' : ' COMPLETE'}` : 'Weekly progress will appear here'}</span></div>
    <section className="workspace-panel weekly-chart">
        <div className="panel-heading"><div><span className="panel-eyebrow">SMALL STEPS ADD UP</span><h3>Time in focus</h3></div><span className="chart-legend"><i /> {demoPreviewMode ? 'SAMPLE 7-DAY ACTIVITY' : chartData.length ? 'CONNECTED ACTIVITY' : 'ACTIVITY'}</span></div>
        <div className="focus-chart">{chartData.length
          ? chartData.map((item) => {
              const height = Math.max(3, (item.hours / Math.max(...chartData.map((entry) => entry.hours), 1)) * 88);
              return <div className="chart-day" key={`${item.day}-${item.hours}`} aria-label={`${item.day}: ${item.hours.toFixed(1)} hours`}><span>{item.hours.toFixed(1)}h</span><i style={{ height: `${height}%` }} /><small>{item.shortDay}</small></div>;
            })
          : <p className="demo-footnote">No daily activity has been recorded yet.</p>}</div>
    </section>
    {subjectRows.length > 0 && <section className="workspace-panel goals-list">
        <div className="goals-list-head"><div><span className="panel-eyebrow">SAVED SUBJECT TOTALS</span><h3>Progress by subject</h3></div><span>{subjectRows.length} subjects</span></div>
        <div className="goals-list-body">{subjectRows.map((subject) => <div className="goal-row" key={subject.subjectId}><span className="goal-copy"><span className="goal-category">PREVIOUS MARKS · {subject.previousMarks}%</span><b>{subject.subjectName}</b><small>{subject.focusedHours > 0 ? `${subject.focusedHours.toFixed(1)} focused hours` : 'No focus time recorded'} · {subject.completedSessions} completed · {subject.missedSessions} missed</small></span></div>)}</div>
    </section>}
    <section className="workspace-panel goals-list" aria-label="Study session task completion">
        <div className="goals-list-head"><div><span className="panel-eyebrow">{showDemoTasks ? 'DEMO WEEKLY SCHEDULE' : 'SAVED STUDY SESSIONS'}</span><h3>Tasks / Study sessions</h3></div><span>{sessionsLoading ? 'Loading sessions…' : sessionsError && !showDemoTasks ? 'Sessions unavailable' : `${completedTasks} of ${taskSessions.length} completed`}</span></div>
        {showDemoTasks && !sessionsLoading && <p className="demo-footnote">{demoScheduleMessage} · checkbox changes are saved locally and never sent to your account.</p>}
        {!sessionsLoading && (!sessionsError || showDemoTasks) && <div className="goals-overview-top" aria-label="Session totals"><span className="goal-count-badge">{pendingTasks} pending</span><span className="goal-count-badge">{missedTasks} missed / skipped</span><span className="goal-count-badge">{taskSessions.length} total</span>{showDemoTasks && <span className="goal-count-badge">{taskSessions.length ? Math.round((completedTasks / taskSessions.length) * 100) : 0}% complete</span>}</div>}
        <div className="goals-list-body">
          {sessionsLoading ? <p className="demo-footnote">Loading saved study sessions…</p>
            : sessionsError && !showDemoTasks ? <p className="demo-footnote" role="alert">Saved study sessions could not be loaded.</p>
            : taskSessions.length === 0 ? <p className="demo-footnote">No study sessions are available yet.</p>
              : taskSessions.map((task) => {
                const complete = isTaskComplete(task);
                const missed = sessionIsMissed(task);
                const canComplete = !backendEnabled || canMarkSessionComplete(task);
                const status = complete ? 'COMPLETED' : task.status?.toUpperCase() ?? 'PENDING';
                return <label className={`goal-row ${complete ? 'is-complete' : ''}`} key={task.id}>
                  <input type="checkbox" checked={complete} disabled={backendEnabled && !isDemoSession(task) && (complete || missed || !canComplete)} onChange={() => onToggleSession(task)} />
                  <span aria-hidden="true" />
                  <span className="goal-custom-check">{complete && <Check size={12} />}</span>
                  <span className="goal-copy"><span className="goal-category" style={{ alignSelf: 'flex-start', ...(missed ? { color: '#f2a6a6' } : {}) }}>{status}</span><b>{task.title}</b><small>{task.subject} · {task.scheduledDate ? new Date(`${task.scheduledDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : task.day} · {task.time} · {task.length}</small></span>
                  <span className="goal-due"><small>STATE</small><b>{status}</b></span>
                </label>;
              })}
        </div>
        {backendEnabled && !showDemoTasks && <p className="demo-footnote">Saved sessions can be marked complete after their scheduled end time. Completed sessions cannot be reopened.</p>}
    </section>
    <div className="workspace-panel milestone-card"><span className="milestone-icon"><Target size={17} /></span><div><span className="panel-eyebrow">{demoPreviewMode ? 'DEMO ACTIVITY PREVIEW' : 'A MOMENT WORTH NOTICING'}</span><b>{demoPreviewMode ? '5-day study streak' : streakDays === null ? 'Start a study streak' : `${streak}-day study streak`}</b><p>{demoPreviewMode ? 'Your recent activity shows consistent study sessions across the week.' : streakDays === null ? 'Your next completed session can start a new rhythm.' : 'Based on your dated completed study sessions.'}</p></div><ArrowUpRight size={16} /></div>
  </>;
}
function Goals({ goals, checked, onToggle, onAdd, isDeadlineData, loading, error }: { goals: Goal[]; checked: Record<string, boolean>; onToggle: (goal: Goal) => void; onAdd: () => void; isDeadlineData: boolean; loading: boolean; error: string }) {
  const complete = goals.filter((goal) => checked[goal.id]).length;
  const percent = goals.length ? Math.round((complete / goals.length) * 100) : 0;
  return <><div className="section-intro-line"><p>{isDeadlineData ? 'Stay oriented to the work that is coming up.' : 'Keep the week gentle, focused, and yours.'}</p>{!isDeadlineData && <button className="subtle-button" type="button" onClick={onAdd}><Plus size={13} /> Add an intention</button>}</div><section className="workspace-panel goals-overview" aria-label={isDeadlineData ? 'Deadline summary' : 'Weekly goal summary'}><div className="goals-overview-top"><div><span className="panel-eyebrow">{isDeadlineData ? 'YOUR ACADEMIC DEADLINES' : `YOUR WEEK · ${shortDate(calendarDates[0])}—${shortDate(calendarDates[6])}`}</span><h3>{isDeadlineData ? 'Deadlines, one step at a time.' : 'A steady week, one intention at a time.'}</h3></div><span className="goal-count-badge">{isDeadlineData ? loading ? 'LOADING' : error ? 'UNAVAILABLE' : `${goals.length} DEADLINES` : `${complete} / ${goals.length} COMPLETE`}</span></div><div className="goals-progress-row"><div className="goals-progress-copy"><b>{isDeadlineData ? loading ? '—' : error ? '—' : goals.length : `${percent}%`}</b><span>{isDeadlineData ? 'saved deadlines' : 'weekly progress'}</span></div>{!isDeadlineData && <span className="goal-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></span>}<span className="goals-progress-detail">{isDeadlineData ? 'Read-only from your academic plan' : `${complete} of ${goals.length} intentions`}</span></div></section><section className="workspace-panel goals-list" aria-label={isDeadlineData ? 'Academic deadlines' : "This week's intentions"}><div className="goals-list-head"><div><span className="panel-eyebrow">{isDeadlineData ? 'DUE DATES FROM YOUR PLAN' : 'A FEW THINGS TO COME BACK TO'}</span><h3>{isDeadlineData ? 'Upcoming' : 'This week'}</h3></div><span>{loading ? 'LOADING' : error ? 'UNAVAILABLE' : `${goals.length} ${isDeadlineData ? 'deadlines' : 'intentions'}`}</span></div><div className="goals-list-body">{loading ? <p className="demo-footnote">Loading academic deadlines…</p> : error ? <p className="demo-footnote" role="alert">{error}</p> : goals.length === 0 ? <p className="demo-footnote">{isDeadlineData ? 'No deadlines have been saved yet.' : 'No intentions added yet.'}</p> : goals.map((goal) => <label className={`goal-row ${checked[goal.id] ? 'is-complete' : ''}`} key={goal.id}><input type="checkbox" checked={Boolean(checked[goal.id])} disabled={isDeadlineData} onChange={() => onToggle(goal)} /><span className="goal-custom-check">{checked[goal.id] && <Check size={12} />}</span><span className="goal-copy"><span className="goal-category">{goal.category}</span><b>{goal.title}</b><small>{goal.detail}</small></span><span className="goal-due"><small>{isDeadlineData ? 'SUBJECT' : 'WHEN'}</small><b>{isDeadlineData ? goal.subject || 'Subject unavailable' : goal.target}</b></span></label>)}</div></section>{!isDeadlineData && <p className="demo-footnote"><Clock3 size={12} /> Sample intentions for this frontend demo.</p>}</>;
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState(() => week[(new Date().getDay() + 6) % 7]);
  const [planning, setPlanning] = useState(loadPlanningState);
  const [subjects, setSubjects] = useState(hasApiBaseUrl ? [] : initialSubjects);
  const [profileSubjects, setProfileSubjects] = useState<StudentSubject[]>([]);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [displayName, setDisplayName] = useState(hasApiBaseUrl ? '' : 'Student');
  const [profileName, setProfileName] = useState(hasApiBaseUrl ? '' : 'Student');
  const [identityLoaded, setIdentityLoaded] = useState(!hasApiBaseUrl);
  const [goals, setGoals] = useState(initialGoals);
  const [backendSessions, setBackendSessions] = useState<CustomSession[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(hasApiBaseUrl);
  const [scheduleError, setScheduleError] = useState('');
  const [backendProgress, setBackendProgress] = useState<ProgressSummary | null>(null);
  const [progressLoading, setProgressLoading] = useState(hasApiBaseUrl);
  const [progressError, setProgressError] = useState('');
  const [backendDeadlines, setBackendDeadlines] = useState<Deadline[] | null>(null);
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false);
  const [prioritiesAvailable, setPrioritiesAvailable] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(hasApiBaseUrl);
  const [priorityError, setPriorityError] = useState('');
  const [deadlinesLoading, setDeadlinesLoading] = useState(hasApiBaseUrl);
  const [deadlinesError, setDeadlinesError] = useState('');
  const [backendLoading, setBackendLoading] = useState(hasApiBaseUrl);
  const [profileLoading, setProfileLoading] = useState(hasApiBaseUrl);
  const [scheduleGenerating, setScheduleGenerating] = useState(false);
  const [apiError, setApiError] = useState('');
  const [checkedGoals, setCheckedGoals] = useState<Record<string, boolean>>({ 'goal-focus': true });
  const [overviewRange, setOverviewRange] = useState<Range>('THIS WEEK');
  const [progressRange, setProgressRange] = useState<Range>('LAST 7 DAYS');
  const [statusMessage, setStatusMessage] = useState('');
  const activeKey = params.get('section')?.toLowerCase() ?? 'overview';
  const active = sectionNames[activeKey] ?? 'Overview';
  const demoSchedulePreview = !hasApiBaseUrl || (
    !scheduleLoading && !backendSessions?.length && (Boolean(scheduleError) || backendSessions !== null)
  );
  const demoScheduleMessage = scheduleError
    ? 'Demo schedule preview · Connected schedule unavailable'
    : 'Demo schedule preview · No saved sessions yet';
  const selectSection = (section: DashboardSection) => setParams({ section: section.toLowerCase() }, { replace: true });
  useEffect(() => { try { window.localStorage.setItem('adaptivestudy-dashboard-planning', JSON.stringify(planning)); } catch { setStatusMessage('Planning changes are active for this visit but could not be saved locally.'); } }, [planning]);
  useEffect(() => {
    if (!hasApiBaseUrl) {
      let mounted = true;
      void services.student.getProfile().then((profile) => {
        if (!mounted) return;
        const name = profile.fullName.trim() || profile.displayName.trim();
        const savedSubjects = profile.subjects ?? [];
        setDisplayName(name);
        setProfileName(name);
        setProfileSubjects(savedSubjects);
        setSubjects(savedSubjects.length ? subjectsFromProfile(savedSubjects) : initialSubjects);
      }).catch((error: unknown) => {
        if (mounted) setProfileError(error instanceof Error ? error.message : 'The local study profile could not be loaded.');
      });
      return () => { mounted = false; };
    }
    let mounted = true;
    const load = async () => {
      const identityRequest = services.auth.getCurrentSession().then((session) => {
        const name = session?.user.displayName.trim();
        if (mounted) {
          setIdentityLoaded(true);
          if (name && !/^(?:student|demo student)$/i.test(name)) {
            setDisplayName((current) => current || name);
            setProfileName((current) => current || name);
          }
        }
        return session;
      }, (error: unknown) => {
        if (mounted) {
          setIdentityLoaded(true);
          setApiError('Your signed-in identity could not be loaded.');
        }
        throw error;
      });
      const profileRequest = services.student.getProfile().then((profile) => {
        if (mounted) {
          const name = profile.fullName.trim() || profile.displayName.trim();
          setDisplayName(name);
          setProfileName(name);
          const savedSubjects = profile.subjects ?? [];
          setProfileMissing(false);
          setProfileError('');
          setProfileSubjects(savedSubjects);
          setSubjects(subjectsFromProfile(savedSubjects));
          setProfileLoading(false);
          setStatusMessage(`Connected profile for ${profile.fullName}.`);
        }
        return profile;
      }, (error: unknown) => {
        if (mounted) {
          const missing = isProfileMissingError(error);
          setProfileMissing(missing);
          setProfileError(missing ? '' : error instanceof Error ? error.message : 'The connected study profile could not be loaded.');
          setProfileLoading(false);
        }
        throw error;
      });
      const progressRequest = services.progress.getProgress('ALL TIME').then((progress) => {
        if (mounted) {
          setBackendProgress(progress);
          setProgressLoading(false);
          setProgressError('');
        }
        return progress;
      }, (error: unknown) => {
        if (mounted) {
          setProgressLoading(false);
          setProgressError(error instanceof TypeError ? 'Connected progress could not be reached.' : 'Connected progress could not be loaded.');
        }
        throw error;
      });
      const scheduleRequest = services.planner.listSchedule().then((result) => {
        if (mounted) {
          setBackendSessions(result);
          setScheduleError('');
        }
        return result;
      }, (error: unknown) => {
        if (mounted) setScheduleError(error instanceof TypeError ? 'Connected schedule could not be reached.' : 'Connected schedule could not be loaded.');
        throw error;
      }).finally(() => { if (mounted) setScheduleLoading(false); });
      const deadlinesRequest = services.deadlines.listDeadlines().then((result) => {
        if (mounted) {
          setBackendDeadlines(result);
          setDeadlinesError('');
        }
        return result;
      }, (error: unknown) => {
        if (mounted) setDeadlinesError(error instanceof TypeError ? 'Connected deadlines could not be reached.' : 'Connected deadlines could not be loaded.');
        throw error;
      }).finally(() => { if (mounted) setDeadlinesLoading(false); });
      const prioritiesRequest = services.priorities.listPriorities().then((result) => {
        if (mounted) {
          setPrioritiesLoaded(true);
          setPriorityError('');
          setPrioritiesAvailable(result.length > 0);
          if (result.length) {
            const colors = ['blue', 'ice', 'steel', 'sky'];
            setSubjects(result.map((priority: StudyPriority, index) => ({
              name: priority.title,
              code: priority.id,
              color: colors[index % colors.length],
              progress: Math.max(0, Math.min(100, Math.round(priority.previousMarks ?? 0))),
              metricLabel: 'PREVIOUS MARKS',
              next: `${priority.priority?.toUpperCase() ?? `RANK ${priority.rank}`} PRIORITY${priority.reason ? ` · ${priority.reason}` : ''}`,
            })));
          }
        }
        return result;
      }, (error: unknown) => {
        if (mounted) setPriorityError(error instanceof TypeError ? 'Connected priority insights could not be reached.' : 'Connected priority insights could not be loaded.');
        throw error;
      }).finally(() => { if (mounted) setPriorityLoading(false); });
      const results = await Promise.allSettled([
        identityRequest,
        profileRequest,
        scheduleRequest,
        progressRequest,
        deadlinesRequest,
        prioritiesRequest,
      ]);
      if (!mounted) return;
      const failedRequests = results.some((result, index) => (
        result.status === 'rejected' && !(index === 1 && isProfileMissingError(result.reason))
      ));
      setApiError(failedRequests ? 'Some connected data could not be loaded. Clearly labeled sample previews are shown where needed.' : '');
      setBackendLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, []);
  async function generateBackendSchedule() {
    setScheduleGenerating(true);
    setApiError('');
    try {
      const generatedSessions = await services.planner.generateSchedule();
      setBackendSessions(generatedSessions);
      setScheduleError('');
      setStatusMessage(generatedSessions.length
        ? 'Your study schedule was generated and refreshed.'
        : 'No saved sessions were generated. The demo schedule preview is still available.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The study schedule could not be generated.';
      setApiError('The connected schedule could not be generated.');
      setScheduleError(message);
      setStatusMessage('Schedule generation failed.');
    } finally {
      setScheduleGenerating(false);
    }
  }
  async function toggleTask(task: StudyTask, day: string) {
    const demoSession = task.id.startsWith('demo-progress-') || task.id.startsWith('demo-schedule-');
    if (task.scheduledDate && isBackendEnabled && !demoSession) {
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
        setApiError('The connected session status could not be updated.');
      }
      return;
    }
    const key = `${day}:${task.id}`;
    setPlanning((current) => {
      const currentComplete = Object.prototype.hasOwnProperty.call(current.completed, key)
        ? Boolean(current.completed[key])
        : task.status === 'completed';
      return { ...current, completed: { ...current.completed, [key]: !currentComplete } };
    });
    const currentlyComplete = Object.prototype.hasOwnProperty.call(planning.completed, key)
      ? Boolean(planning.completed[key])
      : task.status === 'completed';
    setStatusMessage(`${task.title} marked ${currentlyComplete ? 'incomplete' : 'complete'}.`);
  }
  const updateSession = (session: CustomSession) => setPlanning((current) => ({ ...current, sessions: current.sessions.some((item) => item.id === session.id) ? current.sessions.map((item) => item.id === session.id ? session : item) : [...current.sessions, session] }));
  const saveProfileSubjects = async (nextSubjects: StudentSubject[]) => {
    try {
      let savedProfile: StudentProfile;
      if (profileMissing) {
        let fullName = profileName.trim() || displayName.trim();
        if (!fullName || /^(?:student|demo student)$/i.test(fullName)) {
          fullName = window.prompt('Your name for the study profile')?.trim() ?? '';
        }
        if (!fullName) throw new Error('A profile name is required to create your study profile.');
        savedProfile = await services.student.createProfile({
          fullName,
          subjects: nextSubjects.map(({ name, previousMarks, examCount }) => ({ name, previousMarks, examCount })),
        });
      } else {
        savedProfile = await services.student.updateProfile({ subjects: nextSubjects });
      }
      const savedSubjects = savedProfile.subjects ?? [];
      setProfileSubjects(savedSubjects);
      setSubjects(subjectsFromProfile(savedSubjects));
      setProfileMissing(false);
      setProfileError('');
      setStatusMessage('Subject changes saved to your study profile.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Subject changes could not be saved.';
      setProfileError(`Subject changes were not saved: ${message}`);
      setStatusMessage('Subject changes were not saved.');
    }
  };
  const addSubject = () => {
    const name = window.prompt('Subject name')?.trim();
    if (!name) return;
    if (name.length > 120 || subjects.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setProfileError('Enter a unique subject name with 120 characters or fewer.');
      return;
    }
    const marksValue = window.prompt('Previous marks (0–100)');
    if (marksValue === null) return;
    const examCountValue = window.prompt('Completed exams (1–10)');
    if (examCountValue === null) return;
    const previousMarks = Number(marksValue);
    const examCount = Number(examCountValue);
    if (!Number.isFinite(previousMarks) || previousMarks < 0 || previousMarks > 100
      || !Number.isInteger(examCount) || examCount < 1 || examCount > 10) {
      setProfileError('Enter previous marks from 0 to 100 and a whole number of completed exams from 1 to 10.');
      return;
    }
    setProfileError('');
    void saveProfileSubjects([...profileSubjects, {
      id: makeId('subject'),
      name,
      previousMarks,
      examCount,
      completedSessions: 0,
      missedSessions: 0,
    }]);
  };
  const editSubject = (subject: Subject) => {
    const current = profileSubjects.find((item) => item.id === subject.code);
    if (!current && hasApiBaseUrl) {
      setProfileError('This connected subject is not available to edit. Reload the profile and try again.');
      return;
    }
    if (!current) {
      const name = window.prompt('Edit subject name', subject.name)?.trim();
      if (!name) return;
      setSubjects((items) => items.map((item) => item.code === subject.code ? { ...item, name } : item));
      setStatusMessage(`${subject.name} updated in this demo.`);
      return;
    }
    const name = window.prompt('Edit subject name', current.name)?.trim();
    if (!name) return;
    const marksValue = window.prompt('Previous marks (0–100)', String(current.previousMarks));
    if (marksValue === null) return;
    const examCountValue = window.prompt('Completed exams (1–10)', String(current.examCount));
    if (examCountValue === null) return;
    const previousMarks = Number(marksValue);
    const examCount = Number(examCountValue);
    if (name.length > 120 || profileSubjects.some((item) => item.id !== current.id && item.name.toLowerCase() === name.toLowerCase())
      || !Number.isFinite(previousMarks) || previousMarks < 0 || previousMarks > 100
      || !Number.isInteger(examCount) || examCount < 1 || examCount > 10) {
      setProfileError('Enter a unique subject name, marks from 0 to 100, and a whole number of completed exams from 1 to 10.');
      return;
    }
    setProfileError('');
    void saveProfileSubjects(profileSubjects.map((item) => item.id === current.id
      ? { ...item, name, previousMarks, examCount }
      : item));
  };
  const removeSubject = (subject: Subject) => {
    const current = profileSubjects.find((item) => item.id === subject.code);
    if (!current && hasApiBaseUrl) {
      setProfileError('This connected subject is not available to remove. Reload the profile and try again.');
      return;
    }
    if (!window.confirm(`Remove ${subject.name} from your subjects?`)) return;
    if (!current) {
      setSubjects((items) => items.filter((item) => item.code !== subject.code));
      setStatusMessage(`${subject.name} removed from this demo.`);
      return;
    }
    if (profileSubjects.length <= 1) {
      setProfileError('Keep at least one subject in your study profile.');
      return;
    }
    setProfileError('');
    void saveProfileSubjects(profileSubjects.filter((item) => item.id !== current.id));
  };
  const addGoal = () => { const title = window.prompt('Intention'); if (!title?.trim()) return; const goal = { id: makeId('goal'), title: title.trim(), detail: 'A local intention for this week.', category: 'STUDY', target: 'THIS WEEK' }; setGoals((current) => [...current, goal]); setStatusMessage(`${goal.title} added.`); };
  const deadlineGoals: Goal[] = (backendDeadlines ?? []).map((deadline) => ({
    id: deadline.id,
    title: deadline.title,
    detail: [deadline.subject, deadline.notes].filter(Boolean).join(' · '),
    category: `${deadline.type?.toUpperCase() ?? 'DEADLINE'} · ${deadline.status.toUpperCase()}`,
    target: new Date(`${deadline.dueAt}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    subject: deadline.subject,
  }));
  return <WorkspaceShell active={active} onSectionChange={selectSection} eyebrow={`YOUR STUDY SPACE / ${active.toUpperCase()}`} title={active === 'Overview' ? 'Your week, in rhythm.' : `${active}.`} profileName={profileName || (profileLoading ? 'Loading profile…' : 'Study space')} profileDetail={profileLoading ? 'Loading profile' : hasApiBaseUrl ? profileName ? 'Connected study profile' : 'Study profile' : 'Demo study profile'}>
    <div className="workspace-panel schedule-note" role={apiError ? 'alert' : 'status'}>{backendLoading ? 'Loading connected study data…' : apiError || (!hasApiBaseUrl ? 'Demo preview · sample data is not saved to an account.' : 'Connected study data loaded.')}</div>
    <span aria-live="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{statusMessage}</span>
    {active === 'Overview' && <Overview onChange={selectSection} selectedDay={selectedDay} setSelectedDay={setSelectedDay} sessions={planning.sessions} backendSessions={backendSessions} demoSchedulePreview={demoSchedulePreview} demoScheduleMessage={demoScheduleMessage} completed={planning.completed} onToggle={toggleTask} range={overviewRange} setRange={setOverviewRange} progress={backendProgress} progressLoading={progressLoading} progressError={progressError} backendEnabled={hasApiBaseUrl} prioritiesLoaded={prioritiesLoaded} prioritiesAvailable={prioritiesAvailable} priorityLoading={priorityLoading} priorityError={priorityError} deadlines={backendDeadlines} deadlinesLoading={deadlinesLoading} deadlinesError={deadlinesError} scheduleLoading={scheduleLoading} scheduleError={scheduleError} onStatus={setStatusMessage} onAddSession={updateSession} onEditSession={updateSession} onDeleteSession={(session) => setPlanning((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }))} subjects={subjects} subjectsLoading={hasApiBaseUrl && (profileLoading || priorityLoading)} displayName={displayName} profileLoading={profileLoading} />}
    {active === 'Schedule' && <Schedule day={selectedDay} setDay={setSelectedDay} sessions={planning.sessions} backendSessions={backendSessions} demoSchedulePreview={demoSchedulePreview} demoScheduleMessage={demoScheduleMessage} completed={planning.completed} onToggle={toggleTask} onOpenPlanner={() => { setStatusMessage('Planner opened. Add a block for the selected day.'); selectSection('Overview'); }} onGenerateSchedule={() => void generateBackendSchedule()} isGeneratingSchedule={scheduleGenerating} connected={hasApiBaseUrl} loading={scheduleLoading} error={scheduleError} />}
    {active === 'Subjects' && <Subjects subjects={subjects} onAdd={addSubject} onEdit={editSubject} onRemove={removeSubject} onStatus={setStatusMessage} connected={hasApiBaseUrl} canManage={!hasApiBaseUrl || (!profileLoading && (profileMissing ? identityLoaded : !profileError || profileSubjects.length > 0))} loading={hasApiBaseUrl && (profileLoading || priorityLoading)} error={profileError || (!profileMissing && subjects.length === 0 ? priorityError : '')} />}
    {active === 'Progress' && <Progress range={progressRange} setRange={setProgressRange} backendProgress={backendProgress} backendEnabled={hasApiBaseUrl} demoSchedulePreview={demoSchedulePreview} demoScheduleMessage={demoScheduleMessage} loading={progressLoading} error={progressError} sessions={backendSessions} sessionsLoading={hasApiBaseUrl && backendSessions === null && scheduleLoading} sessionsError={hasApiBaseUrl && backendSessions === null && !scheduleLoading ? scheduleError : ''} completed={planning.completed} onToggleSession={(session) => void toggleTask(session, session.day)} />}
    {active === 'Goals' && <Goals goals={hasApiBaseUrl ? deadlineGoals : goals} checked={checkedGoals} onToggle={(goal) => { setCheckedGoals((current) => ({ ...current, [goal.id]: !current[goal.id] })); setStatusMessage(`${goal.title} ${checkedGoals[goal.id] ? 'unchecked' : 'complete'}.`); }} onAdd={addGoal} isDeadlineData={hasApiBaseUrl} loading={deadlinesLoading} error={deadlinesError} />}
  </WorkspaceShell>;
}
