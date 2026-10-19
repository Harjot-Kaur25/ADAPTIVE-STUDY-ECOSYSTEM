import type { BurnoutPageData } from '../data/burnoutDemoData';
import type { CustomSession } from '../data/studyDemoData';

/** App-facing contracts, independent of the backend's JSON payload shape. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

/** The UI receives no raw auth token; the Supabase client manages it internally. */
export interface AuthSession {
  user: AuthUser;
}

export interface SignInInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
}

export interface AuthenticationService {
  signIn(input: SignInInput): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession | null>;
  getCurrentSession(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}

export interface StudentProfile {
  id: string;
  fullName: string;
  email: string;
  displayName: string;
  timezone: string;
  school: string;
  program: string;
  currentYear: string;
  term: string;
  preferences: {
    studyBlockMinutes: number;
    preferredSession?: '1h' | '2h' | '2-3h';
    breakLengthMinutes: number;
    dailyGoalHours: number;
    focusTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
    availableDays: string[];
    availabilityStartHour: number;
    availabilityEndHour: number;
  };
}

export type StudentProfileUpdate = Partial<Omit<StudentProfile, 'id' | 'preferences'>> & {
  preferences?: Partial<StudentProfile['preferences']>;
};

export interface StudentProfileService {
  getProfile(): Promise<StudentProfile>;
  updateProfile(update: StudentProfileUpdate): Promise<StudentProfile>;
  saveAvailability(profile: Pick<StudentProfile, 'preferences'>): Promise<void>;
  getStudyInput(): Promise<StudentStudyInput | null>;
  submitStudyInput(input: StudentStudyInput, regenerateFuture?: boolean): Promise<StudyPlanResults>;
}

export interface StudentStudySubjectInput {
  subjectId: string;
  subjectName: string;
  previousMarks: string;
  examDate: string;
  assignmentDeadlines: Array<{ title: string; dueDate: string }>;
  improvementTopics: string;
}

export interface StudentAvailabilityInput {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface StudentStudyInput {
  studentName: string;
  registrationNumber: string;
  subjects: StudentStudySubjectInput[];
  availability: StudentAvailabilityInput[];
  preferredSession: '1h' | '2h' | '2-3h';
  breakMinutes: string;
}

export interface StudyResourceRecommendation {
  subjectId: string;
  subjectName: string;
  topic: string | null;
  scope: 'subject' | 'topic';
  priorityContext?: string | null;
  previousMarks?: number;
  resources: Array<{
    title: string;
    provider: string;
    resourceType: string;
    searchQuery: string;
    searchUrl: string;
  }>;
}

export interface UnscheduledWork {
  subjectName: string;
  remainingMinutes: number;
  reason: string;
}

export interface StudyPlanResults {
  priorities: StudyPriority[];
  sessions: CustomSession[];
  unscheduledWork: UnscheduledWork[];
  recommendations: StudyResourceRecommendation[];
}

export interface ScheduleService {
  listSchedule(day?: string): Promise<CustomSession[]>;
  generateSchedule(startDate?: string, horizonDays?: number): Promise<CustomSession[]>;
}

export interface StudySession {
  id: string;
  subject: string;
  title: string;
  scheduledDay?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes: number;
  status: 'planned' | 'accepted' | 'in-progress' | 'completed' | 'missed' | 'skipped';
}

export interface StudySessionService {
  listSessions(): Promise<StudySession[]>;
  updateStatus(id: string, status: 'completed' | 'missed'): Promise<StudySession>;
  acceptSession(id: string): Promise<StudySession>;
  skipSession(id: string): Promise<StudySession>;
  editSession(id: string, update: { sessionDate: string; startTime: string; endTime: string }): Promise<StudySession>;
}

export type ProgressRange = 'THIS WEEK' | 'LAST 7 DAYS' | 'ALL TIME';

export interface DailyProgress {
  day: string;
  focusedMinutes: number;
  completedSessions: number;
}

export interface ProgressSummary {
  range: ProgressRange;
  focusedHours: number;
  completedSessions: number;
  missedSessions?: number;
  totalSessions?: number;
  streakDays: number | null;
  weeklyGoalHours: number | null;
  daily: DailyProgress[];
}

export interface ProgressService {
  getProgress(range: ProgressRange): Promise<ProgressSummary>;
}

export interface Deadline {
  id: string;
  title: string;
  subject: string;
  dueAt: string;
  status: 'upcoming' | 'completed' | 'overdue';
  type?: 'exam' | 'assignment';
  priorityId?: string;
  subjectId?: string;
  notes?: string;
}

export interface DeadlineService {
  listDeadlines(): Promise<Deadline[]>;
  createDeadline(deadline: Omit<Deadline, 'id'>): Promise<Deadline>;
}

export interface StudyPriority {
  id: string;
  title: string;
  subject?: string;
  rank: number;
  reason?: string;
  previousMarks?: number;
  priority?: string;
  classScores?: Record<string, number>;
  scoreNote?: string;
}

export interface PriorityService {
  listPriorities(): Promise<StudyPriority[]>;
}

export interface ResourceRecommendationService {
  listRecommendations(): Promise<StudyResourceRecommendation[]>;
}

export interface BurnoutService {
  getDashboardData(): Promise<BurnoutPageData>;
}

/** Grouped dependency boundary for app features. */
export interface FrontendServices {
  auth: AuthenticationService;
  student: StudentProfileService;
  planner: ScheduleService;
  sessions: StudySessionService;
  progress: ProgressService;
  deadlines: DeadlineService;
  priorities: PriorityService;
  resources: ResourceRecommendationService;
  burnout: BurnoutService;
}
