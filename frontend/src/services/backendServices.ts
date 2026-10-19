import type { CustomSession } from '../data/studyDemoData';
import { burnoutService } from './burnoutService';
import type {
  AuthSession,
  Deadline,
  FrontendServices,
  ProgressRange,
  ProgressSummary,
  StudentProfile,
  StudentSubject,
  StudentProfileUpdate,
  StudyPriority,
  StudySession,
} from './contracts';
import { supabase } from './supabase';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

export const hasApiBaseUrl = Boolean(apiBaseUrl);

type BackendSubject = {
  subject_id: string;
  subject_name: string;
  previous_marks: number;
  exam_count: number;
  completed_sessions_count?: number;
  missed_sessions_count?: number;
  deadlines?: BackendDeadline[];
};

type BackendAvailability = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type BackendProfile = {
  student_id: string;
  student_name: string;
  subjects: BackendSubject[];
  availability?: BackendAvailability[];
  preferences?: {
    preferred_session?: string;
    break_minutes?: number;
    daily_goal_hours?: number;
    focus_time?: StudentProfile['preferences']['focusTime'];
  } | null;
};

type BackendAvailabilityResponse = {
  periods: BackendAvailability[];
  preferred_session: string;
  break_minutes: number;
};

type BackendDeadline = {
  deadline_id?: number | string;
  subject_id: string;
  deadline_type: 'exam' | 'assignment';
  title: string;
  due_date: string;
  notes?: string | null;
};

type BackendSession = {
  session_id: number | string;
  subject_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  reason?: string;
};

type BackendPriority = {
  subject_id: string;
  subject_name: string;
  priority?: string;
  predicted_priority?: string;
  reason?: string;
  recommendations?: string[];
  previous_marks?: number;
};

function configurationError(message: string): Error {
  return new Error(message);
}

async function accessToken(): Promise<string> {
  if (!supabase) {
    throw configurationError('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to the student API.');
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) {
    throw configurationError('Sign in with Supabase Auth before loading student data.');
  }
  return data.session.access_token;
}

async function studentIdentity(): Promise<{ id: string; email: string }> {
  if (!supabase) {
    throw configurationError('Supabase Auth is not configured.');
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw configurationError('Sign in with Supabase Auth before loading student data.');
  const configuredId = data.user.user_metadata.student_id;
  return {
    id: typeof configuredId === 'string' && configuredId.trim() ? configuredId : data.user.id,
    email: data.user.email ?? '',
  };
}

async function studentId(): Promise<string> {
  return (await studentIdentity()).id;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw configurationError('Configure VITE_API_BASE_URL to connect to the study backend.');
  }
  const token = await accessToken();
  const requestBaseUrl = import.meta.env.DEV ? '' : apiBaseUrl;
  const response = await fetch(`${requestBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `The study service returned ${response.status}.`;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // Keep the HTTP status message when an error response is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function formatHour(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
  const hour = Number(value?.slice(0, 2));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

const knownSubjectNamesById = new Map([
  ['it-3444874be53248f1ae57593dd6ee373a', 'Computer Networks'],
]);

function displaySubjectName(value?: string, subjectId?: string): string {
  const knownName = subjectId ? knownSubjectNamesById.get(subjectId.toLowerCase()) : undefined;
  if (knownName) return knownName;

  const name = value?.trim() ?? '';
  if (name.toLowerCase() === 'maths') return 'Mathematics';
  const containsIdentifier = /\b(?:it[-_])?[a-f0-9]{16,}\b/i.test(name)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(name);
  const isTestLabel = /\b(?:integration\s+test\s+subject|test\s+subject)\b/i.test(name);
  const isIdentifier = /^(?:it[-_])?[a-f0-9]{8,}$/i.test(name)
    || /^[a-z][a-z0-9_-]{19,}$/i.test(name);
  if (!name || containsIdentifier || isTestLabel || isIdentifier) return 'Subject';
  return name.split(/\s+/).map((word) => (
    word.length <= 3 && word === word.toUpperCase()
      ? word
      : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
  )).join(' ');
}

function displayStudentName(value?: string): string {
  const name = value?.trim() ?? '';
  const containsIdentifier = /\b(?:it[-_])?[a-f0-9]{16,}\b/i.test(name)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(name);
  const isTestLabel = /\b(?:integration\s+test|test\s+student)\b/i.test(name);
  const isIdentifier = /^(?:it[-_])?[a-f0-9]{8,}$/i.test(name)
    || /^[a-z][a-z0-9_-]{19,}$/i.test(name);
  return name && !containsIdentifier && !isTestLabel && !isIdentifier ? name : 'Student';
}

function toProfile(dto: BackendProfile, email = ''): StudentProfile {
  const availability = dto.availability ?? [];
  const preferences = dto.preferences;
  const firstPeriod = availability[0];
  const fullName = displayStudentName(dto.student_name);
  return {
    id: dto.student_id,
    fullName,
    email,
    displayName: fullName.split(/\s+/)[0] ?? fullName,
    subjects: dto.subjects.map((subject): StudentSubject => ({
      id: subject.subject_id,
      name: displaySubjectName(subject.subject_name, subject.subject_id),
      previousMarks: subject.previous_marks,
      examCount: subject.exam_count,
      completedSessions: subject.completed_sessions_count ?? 0,
      missedSessions: subject.missed_sessions_count ?? 0,
    })),
    timezone: 'UTC',
    school: '',
    program: '',
    currentYear: '',
    term: '',
    preferences: {
      studyBlockMinutes: preferences?.preferred_session === '2h' ? 120 : preferences?.preferred_session === '2-3h' ? 150 : 60,
      preferredSession: preferences?.preferred_session === '2h' || preferences?.preferred_session === '2-3h'
        ? preferences.preferred_session
        : '1h',
      breakLengthMinutes: typeof preferences?.break_minutes === 'number'
        && Number.isFinite(preferences.break_minutes)
        && preferences.break_minutes > 0
        ? preferences.break_minutes
        : 10,
      dailyGoalHours: typeof preferences?.daily_goal_hours === 'number'
        && Number.isFinite(preferences.daily_goal_hours)
        && preferences.daily_goal_hours > 0
        ? preferences.daily_goal_hours
        : 3,
      focusTime: preferences?.focus_time
        && ['morning', 'afternoon', 'evening', 'flexible'].includes(preferences.focus_time)
        ? preferences.focus_time
        : 'evening',
      availableDays: [...new Set(availability.map((period) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][period.day_of_week]).filter(Boolean))],
      availabilityStartHour: formatHour(firstPeriod?.start_time, 9),
      availabilityEndHour: formatHour(firstPeriod?.end_time, 18),
    },
  };
}

function profilePayload(dto: BackendProfile, name: string): Record<string, unknown> {
  return {
    student_id: dto.student_id,
    student_name: name,
    subjects: dto.subjects.map((subject) => ({
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      previous_marks: subject.previous_marks,
      exam_count: subject.exam_count,
      completed_sessions_count: subject.completed_sessions_count ?? 0,
      missed_sessions_count: subject.missed_sessions_count ?? 0,
      deadlines: (subject.deadlines ?? []).map((deadline) => ({
        deadline_type: deadline.deadline_type,
        title: deadline.title,
        due_date: deadline.due_date,
        notes: deadline.notes ?? '',
      })),
    })),
  };
}

function weekDay(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00`).getDay();
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day];
}

function mapSession(dto: BackendSession, subjects: Map<string, string>): CustomSession {
  const start = dto.start_time.slice(0, 5);
  const subject = displaySubjectName(subjects.get(dto.subject_id), dto.subject_id);
  return {
    id: String(dto.session_id),
    day: weekDay(dto.session_date),
    time: start,
    title: subject,
    subject,
    kind: 'FOCUS',
    length: `${dto.duration_minutes} min`,
    custom: false,
    scheduledDate: dto.session_date.slice(0, 10),
    status: dto.status.toLowerCase(),
  };
}

function mapStudySession(session: CustomSession): StudySession {
  const status = session.status ?? 'scheduled';
  return {
    id: session.id,
    subject: session.subject,
    title: session.title,
    scheduledDay: session.scheduledDate,
    startedAt: session.scheduledDate ? `${session.scheduledDate}T${session.time}:00` : undefined,
    endedAt: session.scheduledDate
      ? `${session.scheduledDate}T${(() => {
          const [hour, minute] = session.time.split(':').map(Number);
          const totalMinutes = hour * 60 + minute + (Number.parseInt(session.length, 10) || 0);
          return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
        })()}:00`
      : undefined,
    durationMinutes: Number.parseInt(session.length, 10) || 0,
    status: status === 'scheduled' || status === 'planned' || status === 'pending'
      || status === 'in-progress' || status === 'completed' || status === 'missed'
      || status === 'skipped' || status === 'accepted'
      ? status
      : 'planned',
  };
}

function mapDeadline(dto: BackendDeadline, subjectNames: Map<string, string>): Deadline {
  const dueAt = dto.due_date.slice(0, 10);
  const status = dueAt < new Date().toISOString().slice(0, 10) ? 'overdue' : 'upcoming';
  return {
    id: String(dto.deadline_id ?? `${dto.subject_id}-${dueAt}-${dto.title}`),
    title: dto.title,
    subject: displaySubjectName(subjectNames.get(dto.subject_id), dto.subject_id),
    subjectId: dto.subject_id,
    dueAt,
    status,
    notes: dto.notes ?? '',
    type: dto.deadline_type,
  };
}

let cachedProfile: BackendProfile | null = null;
supabase?.auth.onAuthStateChange((event) => {
  if (event !== 'TOKEN_REFRESHED') cachedProfile = null;
});

const auth = {
  async signIn(input: { email: string; password: string }): Promise<AuthSession> {
    if (!supabase) throw configurationError('Supabase Auth is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw error;
    if (!data.user) throw configurationError('Supabase Auth did not return a user.');
    return { user: { id: data.user.id, email: data.user.email ?? input.email, displayName: String(data.user.user_metadata.display_name ?? data.user.user_metadata.full_name ?? input.email) } };
  },
  async signUp(input: { displayName: string; email: string; password: string }): Promise<AuthSession | null> {
    if (!supabase) throw configurationError('Supabase Auth is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: input.displayName, full_name: input.displayName } },
    });
    if (error) throw error;
    if (!data.user || !data.session) return null;
    return { user: { id: data.user.id, email: data.user.email ?? input.email, displayName: input.displayName } };
  },
  async getCurrentSession(): Promise<AuthSession | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    return user ? { user: { id: user.id, email: user.email ?? '', displayName: String(user.user_metadata.display_name ?? user.user_metadata.full_name ?? user.email ?? 'Student') } } : null;
  },
  async signOut(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async requestPasswordReset(email: string): Promise<void> {
    if (!supabase) throw configurationError('Supabase Auth is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    if (error) throw error;
  },
};

export const backendServices: FrontendServices = {
  auth,
  student: {
    async getProfile() {
      const identity = await studentIdentity();
      const profile = await apiRequest<BackendProfile>(`/api/v1/students/${encodeURIComponent(identity.id)}`);
      cachedProfile = profile;
      return toProfile(profile, identity.email);
    },
    async updateProfile(update: StudentProfileUpdate) {
      const id = await studentId();
      const current = cachedProfile ?? await apiRequest<BackendProfile>(`/api/v1/students/${encodeURIComponent(id)}`);
      const name = update.fullName ?? update.displayName ?? current.student_name;
      const response = await apiRequest<BackendProfile>(`/api/v1/students/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(profilePayload(current, name)),
      });
      cachedProfile = { ...current, ...response, student_name: name };
      return toProfile(cachedProfile);
    },
    async saveAvailability(profile) {
      const id = await studentId();
      const preferences = profile.preferences;
      const dayNumbers = new Map(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => [day, index]));
      const originalPeriods = cachedProfile?.availability ?? [];
      const originalDays = [...new Set(originalPeriods.map((period) => period.day_of_week))].sort();
      const requestedDays = preferences.availableDays.map((day) => dayNumbers.get(day)).filter((day): day is number => day !== undefined).sort();
      const firstPeriod = originalPeriods[0];
      const preservesPeriods = originalPeriods.length > 0
        && JSON.stringify(requestedDays) === JSON.stringify(originalDays)
        && preferences.availabilityStartHour === formatHour(firstPeriod.start_time, preferences.availabilityStartHour)
        && preferences.availabilityEndHour === formatHour(firstPeriod.end_time, preferences.availabilityEndHour);
      const periods = preservesPeriods
        ? originalPeriods.map((period) => ({
            day_of_week: period.day_of_week,
            start_time: period.start_time.slice(0, 5),
            end_time: period.end_time.slice(0, 5),
          }))
        : preferences.availableDays.map((day) => ({
            day_of_week: dayNumbers.get(day),
            start_time: `${String(preferences.availabilityStartHour).padStart(2, '0')}:00`,
            end_time: `${String(preferences.availabilityEndHour).padStart(2, '0')}:00`,
          }));
      const preferredSession = preferences.preferredSession
        ?? (preferences.studyBlockMinutes <= 60 ? '1h' : preferences.studyBlockMinutes <= 120 ? '2h' : '2-3h');
      const response = await apiRequest<BackendAvailabilityResponse>(`/api/v1/students/${encodeURIComponent(id)}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ periods, preferred_session: preferredSession, break_minutes: preferences.breakLengthMinutes }),
      });
      if (cachedProfile) {
        cachedProfile.availability = response.periods;
        cachedProfile.preferences = { preferred_session: response.preferred_session, break_minutes: response.break_minutes };
      }
    },
  },
  planner: {
    async listSchedule(day) {
      const id = await studentId();
      const [profile, schedule] = await Promise.all([
        cachedProfile ? Promise.resolve(cachedProfile) : apiRequest<BackendProfile>(`/api/v1/students/${encodeURIComponent(id)}`),
        apiRequest<{ upcoming_sessions: BackendSession[]; past_sessions: BackendSession[] }>(`/api/v1/students/${encodeURIComponent(id)}/schedule`),
      ]);
      cachedProfile = profile;
      const subjectNames = new Map(profile.subjects.map((subject) => [subject.subject_id, subject.subject_name]));
      return [...schedule.upcoming_sessions, ...schedule.past_sessions]
        .map((item) => mapSession(item, subjectNames))
        .filter((item) => !day || item.day === day)
        .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || a.time.localeCompare(b.time));
    },
    async generateSchedule(startDate, horizonDays) {
      const id = await studentId();
      const body = {
        ...(startDate ? { start_date: startDate } : {}),
        ...(horizonDays ? { horizon_days: horizonDays } : {}),
      };
      await apiRequest(`/api/v1/students/${encodeURIComponent(id)}/schedule`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return this.listSchedule();
    },
  },
  sessions: {
    async listSessions() {
      return (await backendServices.planner.listSchedule()).map(mapStudySession);
    },
    async updateStatus(id, status) {
      const updated = await apiRequest<BackendSession>(`/api/v1/sessions/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return mapStudySession(mapSession(updated, new Map()));
    },
    async acceptSession(id) {
      const updated = await apiRequest<BackendSession>(`/api/v1/sessions/${encodeURIComponent(id)}/accept`, { method: 'POST' });
      return mapStudySession(mapSession(updated, new Map()));
    },
    async skipSession(id) {
      const updated = await apiRequest<BackendSession>(`/api/v1/sessions/${encodeURIComponent(id)}/skip`, { method: 'POST' });
      return mapStudySession(mapSession(updated, new Map()));
    },
    async editSession(id, update) {
      const updated = await apiRequest<BackendSession>(`/api/v1/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          session_date: update.sessionDate,
          start_time: update.startTime,
          end_time: update.endTime,
        }),
      });
      return mapStudySession(mapSession(updated, new Map()));
    },
  },
  progress: {
    async getProgress(_range: ProgressRange): Promise<ProgressSummary> {
      const id = await studentId();
      const result = await apiRequest<{
        completed_sessions: number;
        missed_sessions: number;
        study_hours: number;
        subjects?: Array<{
          subject_id: string;
          subject_name: string;
          previous_marks: number;
          completed_sessions: number;
          missed_sessions: number;
          study_hours: number;
        }>;
      }>(
        `/api/v1/students/${encodeURIComponent(id)}/progress`,
      );
      return {
        range: 'ALL TIME',
        focusedHours: result.study_hours,
        completedSessions: result.completed_sessions,
        missedSessions: result.missed_sessions,
        streakDays: null,
        weeklyGoalHours: null,
        daily: [],
        subjects: result.subjects?.map((subject) => ({
          subjectId: subject.subject_id,
          subjectName: displaySubjectName(subject.subject_name, subject.subject_id),
          previousMarks: subject.previous_marks,
          completedSessions: subject.completed_sessions,
          missedSessions: subject.missed_sessions,
          focusedHours: subject.study_hours,
        })),
      };
    },
  },
  deadlines: {
    async listDeadlines() {
      const id = await studentId();
      const [result, profile] = await Promise.all([
        apiRequest<BackendDeadline[]>(`/api/v1/students/${encodeURIComponent(id)}/deadlines`),
        cachedProfile ? Promise.resolve(cachedProfile) : apiRequest<BackendProfile>(`/api/v1/students/${encodeURIComponent(id)}`),
      ]);
      cachedProfile = profile;
      const subjectNames = new Map(profile.subjects.map((subject) => [subject.subject_id, subject.subject_name]));
      return result.map((item) => mapDeadline(item, subjectNames));
    },
    async createDeadline(deadline) {
      const id = await studentId();
      if (!deadline.subjectId) throw new Error('Choose a subject before saving this deadline.');
      const result = await apiRequest<{ deadlines: BackendDeadline[] }>(`/api/v1/students/${encodeURIComponent(id)}/deadlines`, {
        method: 'POST',
        body: JSON.stringify({
          subject_id: deadline.subjectId,
          deadline_type: deadline.type ?? 'assignment',
          title: deadline.title,
          due_date: deadline.dueAt.slice(0, 10),
          notes: deadline.notes ?? '',
        }),
      });
      const subjectNames = new Map((cachedProfile?.subjects ?? []).map((subject) => [subject.subject_id, subject.subject_name]));
      const created = result.deadlines[result.deadlines.length - 1];
      if (!created) throw new Error('The study service did not return the saved deadline.');
      return mapDeadline(created, subjectNames);
    },
  },
  priorities: {
    async listPriorities() {
      const id = await studentId();
      const result = await apiRequest<{ predictions: BackendPriority[] }>(`/api/v1/students/${encodeURIComponent(id)}/priorities`, { method: 'POST', body: '{}' });
      return result.predictions.map((item, index): StudyPriority => ({
        id: item.subject_id,
        title: displaySubjectName(item.subject_name, item.subject_id),
        subject: displaySubjectName(item.subject_name, item.subject_id),
        rank: index + 1,
        reason: item.reason ?? item.recommendations?.[0],
        previousMarks: typeof item.previous_marks === 'number' ? item.previous_marks : undefined,
        priority: item.predicted_priority ?? item.priority,
      }));
    },
  },
  burnout: {
    getDashboardData: () => burnoutService.getDashboardData(),
  },
};
