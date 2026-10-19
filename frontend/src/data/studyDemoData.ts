export interface StudyTask {
  id: string;
  time: string;
  title: string;
  subject: string;
  kind: string;
  length: string;
  custom?: boolean;
  scheduledDate?: string;
  status?: string;
  priority?: 'High' | 'Medium' | 'Low';
}

export interface CustomSession extends StudyTask {
  day: string;
}

export interface Subject {
  name: string;
  code: string;
  color: string;
  progress: number;
  next: string;
  metricLabel?: string;
}

export interface Goal {
  id: string;
  title: string;
  detail: string;
  category: string;
  target: string;
  subject?: string;
}

/** Shared week preview used by the Schedule, Overview, and Progress views. */
export const schedules: Record<string, StudyTask[]> = {
  MON: [
    { id: 'demo-schedule-mon-math', time: '09:00', title: 'Calculus & Integration Practice', subject: 'Mathematics', kind: 'FOCUS', length: '60 min', status: 'completed', priority: 'High' },
    { id: 'demo-schedule-mon-networks', time: '14:00', title: 'Routing Protocols', subject: 'Computer Networks', kind: 'FOCUS', length: '45 min', status: 'planned', priority: 'Medium' },
  ],
  TUE: [
    { id: 'demo-schedule-tue-dbms', time: '10:00', title: 'SQL Queries & Normalization', subject: 'Database Management Systems', kind: 'FOCUS', length: '60 min', status: 'planned', priority: 'High' },
    { id: 'demo-schedule-tue-embedded', time: '16:00', title: 'Microcontroller Fundamentals', subject: 'Embedded Systems', kind: 'FOCUS', length: '45 min', status: 'planned', priority: 'Medium' },
  ],
  WED: [
    { id: 'demo-schedule-wed-math', time: '09:00', title: 'Differential Equations Practice', subject: 'Mathematics', kind: 'FOCUS', length: '60 min', status: 'planned', priority: 'High' },
    { id: 'demo-schedule-wed-networks', time: '15:00', title: 'Transport Layer & TCP', subject: 'Computer Networks', kind: 'FOCUS', length: '45 min', status: 'planned', priority: 'Medium' },
  ],
  THU: [
    { id: 'demo-schedule-thu-dbms', time: '10:00', title: 'Transactions & Indexing', subject: 'Database Management Systems', kind: 'FOCUS', length: '60 min', status: 'planned', priority: 'High' },
    { id: 'demo-schedule-thu-embedded', time: '17:00', title: 'GPIO & Sensor Interfaces', subject: 'Embedded Systems', kind: 'FOCUS', length: '45 min', status: 'planned', priority: 'Medium' },
  ],
  FRI: [
    { id: 'demo-schedule-fri-math', time: '09:00', title: 'Revision & Problem Solving', subject: 'Mathematics', kind: 'FOCUS', length: '60 min', status: 'planned', priority: 'High' },
    { id: 'demo-schedule-fri-networks', time: '14:00', title: 'Network Security Basics', subject: 'Computer Networks', kind: 'FOCUS', length: '45 min', status: 'planned', priority: 'Medium' },
  ],
  SAT: [
    { id: 'demo-schedule-sat-dbms', time: '10:00', title: 'Practice Questions', subject: 'Database Management Systems', kind: 'FOCUS', length: '60 min', status: 'planned', priority: 'Medium' },
  ],
  SUN: [
    { id: 'demo-schedule-sun-review', time: '11:00', title: 'Review completed study topics', subject: 'Weekly Review', kind: 'REVIEW', length: '45 min', status: 'planned', priority: 'Low' },
  ],
};

export const studyPreviewProgress = {
  focusedHours: 7.1,
  completedSessions: 10,
  missedSessions: 2,
  streakDays: 5,
  weeklyGoalHours: 10,
  weeklyProgress: Math.round((7.1 / 10) * 100),
};

export const studyPreviewDaily = [
  { day: 'Monday', shortDay: 'Mon', hours: 1.1 },
  { day: 'Tuesday', shortDay: 'Tue', hours: 1.2 },
  { day: 'Wednesday', shortDay: 'Wed', hours: 0.8 },
  { day: 'Thursday', shortDay: 'Thu', hours: 1.4 },
  { day: 'Friday', shortDay: 'Fri', hours: 1.0 },
  { day: 'Saturday', shortDay: 'Sat', hours: 0.9 },
  { day: 'Sunday', shortDay: 'Sun', hours: 0.7 },
];

export const initialSubjects: Subject[] = [
  { name: 'Mathematics', code: 'MATH', color: 'steel', progress: 81, metricLabel: 'SAMPLE MARKS', next: 'LOW PRIORITY · Sample previous marks: 81%' },
  { name: 'Computer Networks', code: 'NET', color: 'blue', progress: 72, metricLabel: 'SAMPLE MARKS', next: 'MEDIUM PRIORITY · Sample previous marks: 72%' },
  { name: 'Database Management Systems', code: 'DBMS', color: 'ice', progress: 58, metricLabel: 'SAMPLE MARKS', next: 'HIGH PRIORITY · Sample previous marks: 58%' },
  { name: 'Embedded Systems', code: 'EMB', color: 'sky', progress: 46, metricLabel: 'SAMPLE MARKS', next: 'HIGH PRIORITY · Sample previous marks: 46%' },
];

export const initialGoals: Goal[] = [
  { id: 'goal-focus', title: 'Complete a Mathematics practice block', detail: 'Calculus & Integration Practice · 60 minutes.', category: 'STUDY', target: 'MON · 1 BLOCK' },
  { id: 'goal-networks', title: 'Review Computer Networks routing', detail: 'Routing Protocols · 45 minutes.', category: 'COURSEWORK', target: 'MON · 2 PM' },
  { id: 'goal-review', title: 'Review this week’s study topics', detail: 'Use the weekly review block to revisit completed work.', category: 'STUDY', target: 'SUN · 11 AM' },
];
