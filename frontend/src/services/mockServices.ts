import { schedules, type CustomSession } from '../data/studyDemoData';
import { burnoutService } from './burnoutService';
import type {
  AuthSession,
  AuthUser,
  Deadline,
  FrontendServices,
  ProgressRange,
  ProgressSummary,
  StudentProfile,
  StudyPriority,
  StudySession,
} from './contracts';

const clone = <T,>(value: T): T => structuredClone(value);
let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-demo-${idCounter}`;
}

const demoUser: AuthUser = { id: 'demo-student', email: '', displayName: 'Student' };
let activeDemoSession: AuthSession | null = null;

const demoProfile: StudentProfile = {
  id: demoUser.id,
  fullName: 'Student',
  email: demoUser.email,
  displayName: 'Student',
  timezone: 'America/New_York',
  school: 'Northbridge University',
  program: 'Computer Science',
  currentYear: 'second',
  term: 'fall',
  preferences: {
    studyBlockMinutes: 45,
    breakLengthMinutes: 10,
    dailyGoalHours: 2,
    focusTime: 'morning',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    availabilityStartHour: 9,
    availabilityEndHour: 18,
  },
};
let profile = clone(demoProfile);

const demoSchedule: CustomSession[] = Object.entries(schedules).flatMap(([day, tasks]) =>
  tasks.map((task) => ({ ...task, day, custom: false })),
);
let schedule = clone(demoSchedule);
let deadlines: Deadline[] = [];
let priorities: StudyPriority[] = [];

function createCollectionService<T extends { id: string }>(prefix: string, initial: T[]) {
  let items = clone(initial);
  return {
    list: async () => clone(items),
    create: async (item: Omit<T, 'id'>) => {
      const created = { ...item, id: makeId(prefix) } as T;
      items = [...items, created];
      return clone(created);
    },
    update: async (id: string, update: Partial<Omit<T, 'id'>>) => {
      const existing = items.find((item) => item.id === id);
      if (!existing) throw new Error(`${prefix} not found: ${id}`);
      const updated = { ...existing, ...update, id } as T;
      items = items.map((item) => item.id === id ? updated : item);
      return clone(updated);
    },
    remove: async (id: string) => {
      items = items.filter((item) => item.id !== id);
    },
  };
}

const sessionCollection = createCollectionService<StudySession>('session', []);
const deadlineCollection = createCollectionService<Deadline>('deadline', deadlines);
const priorityCollection = createCollectionService<StudyPriority>('priority', priorities);

const progressData: Record<ProgressRange, ProgressSummary> = {
  'THIS WEEK': {
    range: 'THIS WEEK', focusedHours: 8.4, completedSessions: 12, streakDays: 6, weeklyGoalHours: 8, daily: [],
  },
  'LAST 7 DAYS': {
    range: 'LAST 7 DAYS', focusedHours: 7.1, completedSessions: 10, streakDays: 5, weeklyGoalHours: 8, daily: [],
  },
  'ALL TIME': {
    range: 'ALL TIME', focusedHours: 8.4, completedSessions: 12, streakDays: 6, weeklyGoalHours: 8, daily: [],
  },
};

/** Safe local adapters used when the Flask API base URL is not configured. */
export const mockServices: FrontendServices = {
  auth: {
    async signIn(input) {
      activeDemoSession = { user: { ...demoUser, email: input.email } };
      return clone(activeDemoSession);
    },
    async signUp(input) {
      const user = { id: makeId('student'), email: input.email, displayName: input.displayName };
      activeDemoSession = { user };
      return clone(activeDemoSession);
    },
    async getCurrentSession() {
      return clone(activeDemoSession);
    },
    async signOut() {
      activeDemoSession = null;
    },
    async requestPasswordReset() {
      // Intentionally no email is sent in demo mode.
    },
  },
  student: {
    async getProfile() {
      return clone(profile);
    },
    async updateProfile(update) {
      const { preferences, ...fields } = update;
      profile = { ...profile, ...fields, preferences: { ...profile.preferences, ...preferences } };
      return clone(profile);
    },
    async saveAvailability() {},
  },
  planner: {
    async listSchedule(day) {
      return clone(schedule.filter((block) => !day || block.day === day).sort((a, b) => a.time.localeCompare(b.time)));
    },
    async generateSchedule() {
      return clone(schedule);
    },
  },
  sessions: {
    async listSessions() {
      return sessionCollection.list();
    },
    async updateStatus(id, status) {
      return sessionCollection.update(id, { status });
    },
    async acceptSession(id) {
      return sessionCollection.update(id, { status: 'accepted' });
    },
    async skipSession(id) {
      return sessionCollection.update(id, { status: 'skipped' });
    },
    async editSession(id, update) {
      return sessionCollection.update(id, {
        scheduledDay: update.sessionDate,
        startedAt: update.startTime,
        endedAt: update.endTime,
      });
    },
  },
  progress: {
    async getProgress(range) {
      return clone(progressData[range]);
    },
  },
  deadlines: {
    async listDeadlines() {
      return deadlineCollection.list();
    },
    async createDeadline(deadline) {
      return deadlineCollection.create(deadline);
    },
  },
  priorities: {
    async listPriorities() {
      return priorityCollection.list();
    },
  },
  burnout: burnoutService,
};
