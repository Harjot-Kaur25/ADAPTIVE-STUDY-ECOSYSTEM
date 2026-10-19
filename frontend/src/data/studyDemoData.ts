export interface StudyTask {
  id: string;
  time: string;
  title: string;
  subject: string;
  kind: string;
  length: string;
  custom?: boolean;
  scheduledDate?: string;
  endTime?: string;
  status?: string;
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

/** Existing frontend demo schedule, extracted without changing its content. */
export const schedules: Record<string, StudyTask[]> = {
  MON: [{ id: 'seed-mon-0900-cellular', time: '09:00', title: 'Cellular respiration', subject: 'Biology', kind: 'FOCUS', length: '35 min' }, { id: 'seed-mon-1115-problem', time: '11:15', title: 'Problem set 04', subject: 'Calculus', kind: 'PRACTICE', length: '45 min' }, { id: 'seed-mon-1400-neural', time: '14:00', title: 'Neural pathways', subject: 'Psychology', kind: 'REVIEW', length: '25 min' }],
  TUE: [{ id: 'seed-tue-0930-data', time: '09:30', title: 'Data structures', subject: 'Computer Science', kind: 'FOCUS', length: '40 min' }, { id: 'seed-tue-1100-cellular', time: '11:00', title: 'Cellular respiration', subject: 'Biology', kind: 'PRACTICE', length: '35 min' }, { id: 'seed-tue-1430-integration', time: '14:30', title: 'Calculus: integration', subject: 'Calculus', kind: 'REVIEW', length: '25 min' }],
  WED: [{ id: 'seed-wed-1000-sorting', time: '10:00', title: 'Algorithms: sorting', subject: 'Computer Science', kind: 'FOCUS', length: '45 min' }, { id: 'seed-wed-1315-psychology', time: '13:15', title: 'Psychology lecture notes', subject: 'Psychology', kind: 'REVIEW', length: '30 min' }],
  THU: [{ id: 'seed-thu-0900-calculus', time: '09:00', title: 'Calculus problem set', subject: 'Calculus', kind: 'PRACTICE', length: '45 min' }, { id: 'seed-thu-1100-cells', time: '11:00', title: 'Cell systems', subject: 'Biology', kind: 'FOCUS', length: '35 min' }],
  FRI: [{ id: 'seed-fri-1030-recall', time: '10:30', title: 'Weekly recall', subject: 'All subjects', kind: 'REVIEW', length: '30 min' }],
  SAT: [{ id: 'seed-sat-1100-open', time: '11:00', title: 'Open study block', subject: 'Choose a subject', kind: 'FLEXIBLE', length: '45 min' }],
  SUN: [{ id: 'seed-sun-1600-plan', time: '16:00', title: 'Plan the week ahead', subject: 'Weekly review', kind: 'PLANNING', length: '20 min' }],
};

export const initialSubjects: Subject[] = [
  { name: 'Computer Science', code: 'CS204', color: 'blue', progress: 72, next: 'Data structures · Today' },
  { name: 'Biology', code: 'BIO112', color: 'ice', progress: 58, next: 'Cellular respiration · Today' },
  { name: 'Calculus II', code: 'MAT201', color: 'steel', progress: 81, next: 'Integration · Tomorrow' },
  { name: 'Psychology', code: 'PSY108', color: 'sky', progress: 46, next: 'Neural pathways · Thu' },
];

export const initialGoals: Goal[] = [
  { id: 'goal-focus', title: 'Complete 3 focused sessions', detail: 'Build momentum with one session at a time.', category: 'STUDY', target: '3 SESSIONS' },
  { id: 'goal-biology', title: 'Review Biology before Friday', detail: 'Cellular respiration · 20 minutes.', category: 'COURSEWORK', target: 'THU, OCT 24' },
  { id: 'goal-rest', title: 'Protect one evening to rest', detail: 'A little open space belongs in the plan, too.', category: 'WELLBEING', target: 'FRI EVENING' },
];
