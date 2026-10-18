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
  risk: number;
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

/** Frontend-only sample data; replace this fixture with a typed API response later. */
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
    previousWeekScore: number;
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

/**
 * Demo data only. The UI consumes the BurnoutPageData shape, so a future approved
 * API integration can replace this import without coupling data to presentation.
 * No request, server, or backend code is implemented here.
 */
export const burnoutDemoData: BurnoutPageData = {
  period: {
    weekLabel: 'WELLBEING · WEEK 43',
    topbarDate: 'TUESDAY, OCT 22',
    rangeLabel: 'OCT 21 — 27',
  },
  student: {
    initials: 'AM',
    name: 'Alex Morgan',
    program: 'Computer Science · Year 2',
  },
  risk: {
    score: 42,
    status: 'MODERATE',
    previousWeekScore: 48,
    moderateRangeLabel: '40–59 is moderate',
    contextLabel: 'Within your manageable range',
  },
  signals: {
    studyIntensity: {
      value: 7.2,
      usualHours: 6.1,
      unit: 'hrs / day',
    },
    missedSessions: {
      value: 3,
      planned: 18,
      periodLabel: 'this week',
    },
    recovery: {
      value: 68,
      note: 'Two restorative evenings',
    },
  },
  behaviorStats: [
    { label: 'Study hours', value: 28.5, decimals: 1, suffix: 'hrs', note: 'this week', tone: 'blue' },
    { label: 'Missed sessions', value: 3, decimals: 0, suffix: '', note: 'of 18 planned', tone: 'amber' },
    { label: 'Average score', value: 84, decimals: 0, suffix: '%', note: 'steady this month', tone: 'mint' },
    { label: 'Workload', value: 78, decimals: 0, suffix: '%', note: 'of weekly capacity', tone: 'sky' },
  ],
  trend: [
    { day: 'MON', risk: 56 },
    { day: 'TUE', risk: 53 },
    { day: 'WED', risk: 51 },
    { day: 'THU', risk: 48 },
    { day: 'FRI', risk: 46 },
    { day: 'SAT', risk: 43 },
    { day: 'SUN', risk: 42 },
  ],
  trendSummary: 'Your risk signal has eased as study time has become more balanced.',
  explanationSummary: 'Your study intensity and {missedSessions} missed sessions are adding some pressure. At the same time, your average score is steady, your weekly workload is below capacity, and recovery has improved. The combination points to a manageable signal—one that may benefit from a lighter evening and a little more breathing room.',
  riskFactors: [
    { label: 'Study intensity', detail: '7.2 h average per day', points: 16, tone: 'amber' },
    { label: 'Missed sessions', detail: '3 sessions this week', points: 11, tone: 'blue' },
    { label: 'Recovery gaps', detail: 'Two short-rest evenings', points: 8, tone: 'mint' },
    { label: 'Workload density', detail: '78% of weekly capacity', points: 7, tone: 'sky' },
  ],
  riskFactorScale: 18,
  plan: {
    currentFocusBlocks: 4,
    currentDuration: '3h 30m planned',
    adaptedFocusBlocks: 3,
    recoveryBufferCount: 1,
    projectedRisk: 35,
    projectionDays: 7,
  },
  recommendedActions: [
    { id: 'buffer', title: 'Add a recovery buffer', detail: 'Take 15 minutes between Biology and Calculus.', when: 'TODAY · 11:45' },
    { id: 'move', title: 'Move one low-priority session', detail: 'Shift the optional review to a lighter day.', when: '1 SESSION' },
    { id: 'evening', title: 'Keep one evening open', detail: 'Protect Thursday after your final class.', when: 'THU · EVENING' },
  ],
};
