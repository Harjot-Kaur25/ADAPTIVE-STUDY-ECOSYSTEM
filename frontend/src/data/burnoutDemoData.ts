import { schedules, studyPreviewDaily, studyPreviewProgress } from './studyDemoData';

export type BurnoutTone = 'blue' | 'amber' | 'mint' | 'sky';

export interface BurnoutBehaviorStat {
  label: string;
  value: number;
  decimals: number;
  suffix: string;
  note: string;
  tone: BurnoutTone;
}

export interface BurnoutTrendPoint {
  day: string;
  value: number;
}

export interface BurnoutRiskFactor {
  label: string;
  detail: string;
  points: number;
  tone: BurnoutTone;
}

export interface BurnoutRecommendedAction {
  id: string;
  title: string;
  detail: string;
  when: string;
}

/** Frontend-only estimate assembled from the shared study preview data. */
export interface BurnoutPageData {
  period: {
    weekLabel: string;
    topbarDate: string;
    rangeLabel: string;
  };
  student: {
    initials: string;
    name: string;
    program: string;
  };
  risk: {
    score: number;
    status: 'LOW' | 'MODERATE' | 'HIGH';
    previousWeekScore: number | null;
    moderateRangeLabel: string;
    contextLabel: string;
  };
  signals: {
    studyIntensity: {
      value: number;
      usualHours: number;
      unit: string;
    };
    missedSessions: {
      value: number;
      planned: number;
      periodLabel: string;
    };
    recovery: {
      value: number;
      unit: string;
      note: string;
    };
  };
  behaviorStats: BurnoutBehaviorStat[];
  trend: BurnoutTrendPoint[];
  trendSummary: string;
  explanationSummary: string;
  riskFactors: BurnoutRiskFactor[];
  riskFactorScale: number;
  plan: {
    currentFocusBlocks: number;
    currentDuration: string;
    adaptedFocusBlocks: number;
    recoveryBufferCount: number;
    projectedRisk: number;
    projectionDays: number;
  };
  recommendedActions: BurnoutRecommendedAction[];
}

function currentWeekDates() {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function dateLabel(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleDateString('en-US', options).toUpperCase();
}

function sessionDurationMinutes(length: string) {
  return Number.parseInt(length, 10) || 0;
}

export function createBurnoutPreviewData(studentName = '', overdueDeadlines = 0): BurnoutPageData {
  const dates = currentWeekDates();
  const sessions = Object.entries(schedules).flatMap(([day, tasks]) => tasks.map((task) => ({ ...task, day })));
  const plannedSessions = sessions.filter((session) => session.status !== 'completed');
  const plannedHours = plannedSessions.reduce((total, session) => total + sessionDurationMinutes(session.length), 0) / 60;
  const missedPoints = Math.round(
    (studyPreviewProgress.missedSessions / (studyPreviewProgress.completedSessions + studyPreviewProgress.missedSessions)) * 35,
  );
  const deadlinePoints = Math.min(Math.max(overdueDeadlines, 0) * 12, 30);
  const workloadPoints = Math.min(Math.max(Math.round((plannedHours - 12) * 3), 0), 35);
  const score = Math.min(missedPoints + deadlinePoints + workloadPoints, 100);
  const status = score >= 60 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW';
  const dayGoal = studyPreviewProgress.weeklyGoalHours / 7;
  const trend = studyPreviewDaily.map((item) => ({
    day: item.shortDay.toUpperCase(),
    value: Math.min(100, Math.round((item.hours / dayGoal) * 100)),
  }));
  const initials = studentName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'DP';
  const riskFactors: BurnoutRiskFactor[] = [
    ...(missedPoints > 0 ? [{
      label: 'Missed sessions',
      detail: `${studyPreviewProgress.missedSessions} of ${studyPreviewProgress.completedSessions + studyPreviewProgress.missedSessions} sample activity sessions`,
      points: missedPoints,
      tone: 'amber' as const,
    }] : []),
    ...(deadlinePoints > 0 ? [{
      label: 'Overdue deadlines',
      detail: `${overdueDeadlines} saved deadlines overdue`,
      points: deadlinePoints,
      tone: 'blue' as const,
    }] : []),
    ...(workloadPoints > 0 ? [{
      label: 'Upcoming scheduled time',
      detail: `${plannedHours.toFixed(1)} planned hours in the weekly preview`,
      points: workloadPoints,
      tone: 'sky' as const,
    }] : []),
  ];
  const recommendedActions: BurnoutRecommendedAction[] = [
    ...(studyPreviewProgress.missedSessions > 0 ? [{
      id: 'missed-sessions',
      title: 'Review missed sample sessions before planning the next week.',
      detail: 'Choose a manageable next step for the topics you want to revisit.',
      when: `${studyPreviewProgress.missedSessions} SAMPLE SESSIONS`,
    }] : []),
    ...(overdueDeadlines > 0 ? [{
      id: 'overdue-deadlines',
      title: 'Break an overdue deadline into a small next step.',
      detail: 'This suggestion is based on saved deadline data.',
      when: `${overdueDeadlines} SAVED DEADLINES`,
    }] : []),
    ...(!studyPreviewProgress.missedSessions && !overdueDeadlines && !workloadPoints ? [{
      id: 'steady-rhythm',
      title: 'Keep the current study rhythm steady.',
      detail: 'The preview schedule is within the weekly workload threshold.',
      when: 'THIS WEEK',
    }] : []),
  ];
  const openEvenings = Object.keys(schedules).filter((day) => {
    const latestEnd = (schedules[day] ?? []).reduce((latest, session) => {
      const [hours, minutes] = session.time.split(':').map(Number);
      return Math.max(latest, hours * 60 + minutes + sessionDurationMinutes(session.length));
    }, 0);
    return latestEnd < 18 * 60;
  }).length;
  const focusPace = trend.length
    ? `${Math.min(...trend.map((point) => point.value))}%–${Math.max(...trend.map((point) => point.value))}%`
    : 'No sample focus pace yet';

  return {
    period: {
      weekLabel: `WELLBEING · WEEK OF ${dateLabel(dates[0], { month: 'short', day: 'numeric' })}`,
      topbarDate: dateLabel(new Date(), { weekday: 'long', month: 'short', day: 'numeric' }),
      rangeLabel: `${dateLabel(dates[0], { month: 'short', day: 'numeric' })} — ${dateLabel(dates[6], { month: 'short', day: 'numeric' })}`,
    },
    student: {
      initials,
      name: studentName.trim() || 'Demo preview',
      program: 'Sample study activity',
    },
    risk: {
      score,
      status,
      previousWeekScore: null,
      moderateRangeLabel: '30–59 is moderate',
      contextLabel: 'Calculated from labeled preview activity',
    },
    signals: {
      studyIntensity: {
        value: studyPreviewProgress.focusedHours,
        usualHours: studyPreviewProgress.weeklyGoalHours,
        unit: 'hrs / week',
      },
      missedSessions: {
        value: studyPreviewProgress.missedSessions,
        planned: studyPreviewProgress.completedSessions + studyPreviewProgress.missedSessions,
        periodLabel: 'sample activity',
      },
      recovery: {
        value: openEvenings,
        unit: 'evenings',
        note: 'No preview block runs after 5:45 PM',
      },
    },
    behaviorStats: [
      { label: 'Focused hours', value: studyPreviewProgress.focusedHours, decimals: 1, suffix: 'hrs', note: 'sample activity this week', tone: 'blue' },
      { label: 'Completed sessions', value: studyPreviewProgress.completedSessions, decimals: 0, suffix: '', note: 'sample activity', tone: 'mint' },
      { label: 'Missed sessions', value: studyPreviewProgress.missedSessions, decimals: 0, suffix: '', note: 'sample activity', tone: 'amber' },
      { label: 'Planned hours', value: plannedHours, decimals: 1, suffix: 'hrs', note: 'weekly schedule preview', tone: 'sky' },
    ],
    trend,
    trendSummary: `Daily sample focus is ${focusPace} of the daily share of the ${studyPreviewProgress.weeklyGoalHours}-hour goal.`,
    explanationSummary: `The sample activity includes ${studyPreviewProgress.missedSessions} missed sessions and ${studyPreviewProgress.completedSessions} completed sessions. The weekly schedule preview contains ${plannedHours.toFixed(1)} planned hours; the score is calculated from these activity signals${overdueDeadlines ? ` and ${overdueDeadlines} saved overdue deadlines` : ''}.`,
    riskFactors,
    riskFactorScale: 35,
    plan: {
      currentFocusBlocks: sessions.length,
      currentDuration: `${sessions.reduce((total, session) => total + sessionDurationMinutes(session.length), 0) / 60} hr scheduled`,
      adaptedFocusBlocks: score >= 60 ? Math.max(1, Math.round(sessions.length * 0.75)) : score >= 30 ? Math.max(1, sessions.length - 1) : sessions.length,
      recoveryBufferCount: score >= 30 ? 1 : 0,
      projectedRisk: Math.max(0, score - (score >= 30 ? 5 : 0)),
      projectionDays: 7,
    },
    recommendedActions,
  };
}

export const burnoutDemoData = createBurnoutPreviewData();
