import { useEffect, useState, type CSSProperties } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  Moon,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { hasApiBaseUrl, services } from '../services';
import type { Deadline, ProgressSummary, StudySession, StudentProfile } from '../services/contracts';
import { burnoutService } from '../services/burnoutService';
import type { BurnoutPageData, BurnoutTrendPoint } from '../services/burnoutService';
import './BurnoutPage.css';

const navigation = [
  { label: 'Overview', to: '/dashboard?section=overview', icon: LayoutDashboard },
  { label: 'Schedule', to: '/dashboard?section=schedule', icon: CalendarDays },
  { label: 'Progress', to: '/dashboard?section=progress', icon: BarChart3 },
  { label: 'Subjects', to: '/dashboard?section=subjects', icon: BookOpen },
  { label: 'Burnout', to: '/burnout', icon: Activity },
  { label: 'Goals', to: '/dashboard?section=goals', icon: Target },
  { label: 'Settings', to: '/settings', icon: Settings2 },
] as const;

type ConnectedBurnoutData = {
  profile: StudentProfile | null;
  sessions: StudySession[] | null;
  deadlines: Deadline[] | null;
  progress: ProgressSummary | null;
  errors: string[];
};

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ConnectedBurnout({ data }: { data: ConnectedBurnoutData }) {
  const today = new Date();
  const todayKey = toDayKey(today);
  const recentStart = new Date(today);
  recentStart.setDate(today.getDate() - 6);
  const recentStartKey = toDayKey(recentStart);
  const upcomingEnd = new Date(today);
  upcomingEnd.setDate(today.getDate() + 6);
  const upcomingEndKey = toDayKey(upcomingEnd);
  const recentSessions = data.sessions?.filter((session) => Boolean(session.scheduledDay && session.scheduledDay >= recentStartKey && session.scheduledDay <= todayKey)) ?? [];
  const upcomingSessions = data.sessions?.filter((session) => Boolean(session.scheduledDay && session.scheduledDay >= todayKey && session.scheduledDay <= upcomingEndKey && !['completed', 'missed', 'skipped'].includes(session.status))) ?? [];
  const missedSessions = recentSessions.filter((session) => session.status === 'missed').length;
  const upcomingHours = upcomingSessions.reduce((sum, session) => sum + session.durationMinutes, 0) / 60;
  const overdueDeadlines = data.deadlines?.filter((deadline) => deadline.status === 'overdue' || (deadline.status !== 'completed' && deadline.dueAt < todayKey)).length ?? 0;
  const hasEstimateInputs = data.sessions !== null && data.deadlines !== null && Boolean(data.sessions.length || data.deadlines.length);
  const missedPoints = recentSessions.length ? Math.round((missedSessions / recentSessions.length) * 35) : 0;
  const deadlinePoints = Math.min(overdueDeadlines * 12, 30);
  const workloadPoints = Math.min(Math.max(Math.round((upcomingHours - 12) * 3), 0), 35);
  const score = Math.min(missedPoints + deadlinePoints + workloadPoints, 100);
  const riskStatus = score >= 60 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW';
  const name = data.profile?.fullName || data.profile?.displayName || 'Connected student';
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  const factors = [
    { label: 'Missed sessions', detail: `${missedSessions} of ${recentSessions.length} saved sessions in the last 7 days`, points: missedPoints, tone: 'amber' },
    { label: 'Overdue deadlines', detail: `${overdueDeadlines} saved deadlines overdue`, points: deadlinePoints, tone: 'blue' },
    { label: 'Upcoming scheduled time', detail: `${upcomingHours.toFixed(1)} scheduled hours in the next 7 days`, points: workloadPoints, tone: 'sky' },
  ].filter((factor) => factor.points > 0);
  const recommendations = [
    ...(missedSessions ? ['Review missed sessions and adjust the next study block.'] : []),
    ...(overdueDeadlines ? ['Break an overdue deadline into a small next step.'] : []),
    ...(upcomingHours > 12 ? ['Consider spreading the upcoming study blocks across more days.'] : []),
  ];
  if (!recommendations.length && hasEstimateInputs) recommendations.push('No elevated workload signals were found in the saved schedule and deadlines.');

  return <div className="site-shell burnout-app">
    <div className="burnout-layout">
      <aside className="burnout-sidebar">
        <div className="burnout-brand"><Brand /></div>
        <span className="burnout-nav-caption">YOUR STUDY SPACE</span>
        <nav className="burnout-nav" aria-label="Study space">
          {navigation.map(({ label, to, icon: Icon }) => <Link key={label} to={to} aria-current={label === 'Burnout' ? 'page' : undefined} className={`burnout-nav-link ${label === 'Burnout' ? 'is-active' : ''}`}><Icon size={16} strokeWidth={1.65} /><span>{label}</span>{label === 'Burnout' && <i />}</Link>)}
        </nav>
        <div className="burnout-sidebar-spacer" />
        <div className="burnout-sidebar-note"><span className="burnout-note-icon"><Sparkles size={14} /></span><span>YOUR STUDY RHYTHM<b>Make space to reset.</b></span></div>
        <div className="burnout-user"><span className="burnout-avatar">{initials}</span><span>{name}<small>{data.profile?.program || 'Connected study profile'}</small></span></div>
      </aside>
      <main className="burnout-main">
        <header className="burnout-topbar"><div className="burnout-crumb"><Link to="/">Adaptive Study</Link><span>/</span><b>Burnout</b></div><div className="burnout-topbar-right"><span className="burnout-demo-indicator"><i /> FRONTEND ESTIMATE</span><span className="burnout-topbar-date">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</span><span className="burnout-avatar burnout-avatar--small">{initials}</span></div></header>
        <div className="burnout-content">
          <div className="burnout-page-heading"><div><span className="burnout-eyebrow"><Activity size={12} /> CONNECTED STUDY DATA</span><h1>Burnout, in balance.</h1><p>A transparent frontend estimate from saved study sessions and deadlines.</p></div></div>
          {data.errors.length > 0 && <p className="burnout-panel-subtitle" role="status">Some connected data could not be loaded: {data.errors.join(' ')}</p>}
          {!hasEstimateInputs ? <section className="burnout-panel" role="status"><span className="burnout-overline">CONNECTED DATA</span><h2>Estimate unavailable</h2><p className="burnout-panel-subtitle">{data.sessions && data.deadlines ? 'There are no saved sessions or deadlines to assess yet.' : 'Saved session and deadline data is unavailable, so no estimate is shown.'}</p></section> : <>
            <section className="burnout-hero-grid" aria-label="Frontend burnout estimate">
              <article className="burnout-panel burnout-score-panel"><div className="burnout-panel-heading"><div><span className="burnout-overline">FRONTEND BURNOUT ESTIMATE</span><h2>Current planning signal</h2></div><span className="burnout-info-mark" title="A deterministic frontend heuristic, not an ML prediction"><CircleHelp size={15} /></span></div><RiskGauge value={score} status={riskStatus} contextLabel="Heuristic from saved schedule data" /><div className="burnout-score-foot"><span><Activity size={14} /> {factors.length} contributing factors</span><small>Based on available records only</small></div></article>
              <div className="burnout-signal-grid">
                <article className="burnout-panel burnout-signal-card burnout-signal-card--intensity"><span className="burnout-signal-icon"><Clock3 size={16} /></span><span className="burnout-overline">UPCOMING SCHEDULE</span><strong><CountUp value={upcomingHours} decimals={1} /> <small>hrs / 7 days</small></strong><span className="burnout-signal-note">{data.sessions ? `${upcomingSessions.length} saved sessions` : 'Unavailable'}</span></article>
                <article className="burnout-panel burnout-signal-card burnout-signal-card--missed"><span className="burnout-signal-icon"><CalendarDays size={16} /></span><span className="burnout-overline">MISSED SESSIONS</span><strong><CountUp value={missedSessions} /> <small>last 7 days</small></strong><span className="burnout-signal-note">{data.sessions ? `${recentSessions.length} saved sessions` : 'Unavailable'}</span></article>
                <article className="burnout-panel burnout-signal-card burnout-signal-card--recovery"><span className="burnout-signal-icon"><Moon size={16} /></span><span className="burnout-overline">LIFETIME FOCUS</span><strong>{data.progress ? <><CountUp value={data.progress.focusedHours} decimals={1} /> <small>hrs</small></> : '—'}</strong><span className="burnout-signal-note">{data.progress ? 'Backend lifetime total' : 'Not provided'}</span></article>
              </div>
            </section>
            <section className="burnout-panel burnout-behavior"><div className="burnout-section-head"><div><span className="burnout-overline">CURRENTLY AVAILABLE SIGNALS</span><h2>Behavioral Overview</h2></div><span className="burnout-muted-label">LIVE SAVED DATA</span></div><div className="burnout-behavior-grid">{[
              { label: 'Saved sessions', value: recentSessions.length, suffix: '', note: 'last 7 days', tone: 'blue' },
              { label: 'Upcoming study time', value: upcomingHours, suffix: 'hrs', note: 'next 7 days · scheduled duration', tone: 'sky' },
              { label: 'Overdue deadlines', value: overdueDeadlines, suffix: '', note: 'saved academic deadlines', tone: 'amber' },
            ].map((stat) => <article className={`burnout-behavior-stat tone-${stat.tone}`} key={stat.label}><span>{stat.label}</span><strong><CountUp value={stat.value} decimals={stat.suffix === 'hrs' ? 1 : 0} /><small>{stat.suffix}</small></strong><em>{stat.note}</em></article>)}</div></section>
            <section className="burnout-analysis-grid">
              <article className="burnout-panel burnout-trend-panel"><div className="burnout-section-head"><div><span className="burnout-overline">HISTORICAL DATA</span><h2>Burnout Risk Trend</h2></div></div><p className="burnout-panel-subtitle">Daily risk history is not provided by the backend. This estimate does not fabricate a trend.</p></article>
              <article className="burnout-panel burnout-breakdown-panel"><div className="burnout-section-head"><div><span className="burnout-overline">WHAT IS CONTRIBUTING</span><h2>Risk Breakdown</h2></div><span className="burnout-breakdown-total"><CountUp value={score} /> <small>pts</small></span></div><div className="burnout-factor-list">{factors.length ? factors.map((factor) => <div className="burnout-factor" key={factor.label}><div className="burnout-factor-top"><span>{factor.label}<small>{factor.detail}</small></span><b><CountUp value={factor.points} /><small>pts</small></b></div><div className="burnout-factor-track"><i className={`tone-${factor.tone}`} style={{ width: `${Math.min((factor.points / 35) * 100, 100)}%` }} /></div></div>) : <p className="burnout-panel-subtitle">No elevated pressure factors in the available records.</p>}</div><span className="burnout-breakdown-foot">This deterministic heuristic is not an ML/backend prediction or a medical assessment.</span></article>
            </section>
            <section className="burnout-response-grid"><article className="burnout-panel burnout-actions-panel"><div className="burnout-section-head"><div><span className="burnout-overline">SMALL STEPS, GENTLY</span><h2>Recommendations</h2></div></div><div className="burnout-action-list">{recommendations.length ? recommendations.map((recommendation) => <div className="burnout-action" key={recommendation}><button type="button" disabled aria-label="Suggested next step"><ArrowRight size={13} /></button><div><strong>{recommendation}</strong><p>Suggestion based on the current saved study data.</p><span>FRONTEND SUGGESTION</span></div></div>) : <p className="burnout-panel-subtitle">Recommendations are unavailable until study data is saved.</p>}</div></article></section>
          </>}
          <aside className="burnout-explanation"><span className="burnout-explanation-icon"><CircleHelp size={18} /></span><div><span className="burnout-overline">A LITTLE CONTEXT</span><h2>How to read this estimate</h2><p>The score is a simple frontend heuristic based on missed saved sessions, overdue deadlines, and scheduled study time. Recovery, daily focus history, and historical burnout data are not available.</p><span className="burnout-disclaimer">Not a backend/ML prediction and not a medical assessment.</span></div><span className="burnout-explanation-mark"><Sparkles size={22} /></span></aside>
          <footer className="burnout-footer"><span>ADAPTIVE STUDY ECOSYSTEM</span><span>Progress should leave room to recover.</span></footer>
        </div>
      </main>
    </div>
  </div>;
}

function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [count, setCount] = useState(() => {
    if (typeof window === 'undefined') return value;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0;
  });

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.matches) {
      setCount(value);
      return;
    }

    const duration = 1350;
    let frame = 0;
    let startedAt = 0;
    const animate = (time: number) => {
      if (!startedAt) startedAt = time;
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(value * eased);
      if (progress < 1) frame = requestAnimationFrame(animate);
      else setCount(value);
    };

    frame = requestAnimationFrame(animate);
    const finishForReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) {
        cancelAnimationFrame(frame);
        setCount(value);
      }
    };
    motionPreference.addEventListener('change', finishForReducedMotion);
    return () => {
      cancelAnimationFrame(frame);
      motionPreference.removeEventListener('change', finishForReducedMotion);
    };
  }, [value]);

  return <span>{count.toFixed(decimals)}</span>;
}

function RiskGauge({ value, status, contextLabel }: {
  value: number;
  status: BurnoutPageData['risk']['status'];
  contextLabel: string;
}) {
  const gaugeStyle = { '--burnout-gauge-dash': `${value} 100` } as CSSProperties;

  return (
    <div className="burnout-gauge-wrap">
      <svg className="burnout-gauge" viewBox="0 0 220 142" role="img" aria-label={`Burnout risk score ${value} out of 100`}>
        <defs>
          <linearGradient id="burnout-gauge-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#6bc8bf" />
            <stop offset="64%" stopColor="#8ec8d6" />
            <stop offset="100%" stopColor="#e7b568" />
          </linearGradient>
        </defs>
        <path className="burnout-gauge-track" d="M28 116 A82 82 0 0 1 192 116" pathLength="100" />
        <path className="burnout-gauge-value" d="M28 116 A82 82 0 0 1 192 116" pathLength="100" style={gaugeStyle} />
        <circle className="burnout-gauge-needle" cx="110" cy="116" r="3.5" />
      </svg>
      <div className="burnout-gauge-score"><strong><CountUp value={value} /></strong><span>/ 100</span></div>
      <span className="burnout-risk-pill"><i /> {status}</span>
      <span className="burnout-gauge-range">{contextLabel}</span>
    </div>
  );
}

function RiskTrendChart({ data }: { data: BurnoutTrendPoint[] }) {
  const width = 720;
  const left = 48;
  const right = 680;
  const bottom = 204;
  const points = data.length ? data : [{ day: '—', risk: 0 }];
  const first = points[0];
  const latest = points[points.length - 1];
  const x = (index: number) => left + ((right - left) * index) / Math.max(points.length - 1, 1);
  const y = (risk: number) => bottom - risk * 1.55;
  const linePath = points.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(item.risk)}`).join(' ');
  const areaPath = `${linePath} L ${right} ${bottom + 8} L ${left} ${bottom + 8} Z`;

  return (
    <svg className="burnout-trend-svg" viewBox={`0 0 ${width} 250`} role="img" aria-label={`Burnout risk trend from ${first.risk} on ${first.day} to ${latest.risk} on ${latest.day}`}>
      <defs>
        <linearGradient id="burnout-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#72c9c1" stopOpacity=".24" />
          <stop offset="100%" stopColor="#72c9c1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((level) => {
        const lineY = bottom - level * 1.55;
        return <g key={level}><line className="burnout-chart-gridline" x1={left} x2={right} y1={lineY} y2={lineY} /><text className="burnout-chart-axis" x="8" y={lineY + 4}>{level}</text></g>;
      })}
      <path className="burnout-trend-area" d={areaPath} fill="url(#burnout-trend-fill)" />
      <path className="burnout-trend-line" d={linePath} pathLength={1000} />
      {points.map((item, index) => <g key={`${item.day}-${index}`}>
        <circle className={`burnout-trend-dot ${index === points.length - 1 ? 'is-current' : ''}`} cx={x(index)} cy={y(item.risk)} r={index === points.length - 1 ? 5 : 3.5} />
        <text className={`burnout-chart-day ${index === points.length - 1 ? 'is-current' : ''}`} x={x(index)} y="235" textAnchor="middle">{item.day}</text>
      </g>)}
      <text className="burnout-current-value" x={right - 1} y={y(latest.risk) - 14} textAnchor="end">{latest.risk} · TODAY</text>
    </svg>
  );
}

export default function BurnoutPage() {
  const [dashboardData, setDashboardData] = useState<BurnoutPageData | null>(null);
  const [connectedData, setConnectedData] = useState<ConnectedBurnoutData | null>(null);
  const [dataLoadError, setDataLoadError] = useState(false);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [planApplied, setPlanApplied] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (hasApiBaseUrl) {
      void Promise.allSettled([
        services.student.getProfile(),
        services.sessions.listSessions(),
        services.deadlines.listDeadlines(),
        services.progress.getProgress('ALL TIME'),
      ]).then((results) => {
        if (!mounted) return;
        const errors = results.flatMap((result) => result.status === 'rejected'
          ? [result.reason instanceof Error ? result.reason.message : 'A connected study data request failed.']
          : []);
        setConnectedData({
          profile: results[0].status === 'fulfilled' ? results[0].value : null,
          sessions: results[1].status === 'fulfilled' ? results[1].value : null,
          deadlines: results[2].status === 'fulfilled' ? results[2].value : null,
          progress: results[3].status === 'fulfilled' ? results[3].value : null,
          errors,
        });
      });
      return () => { mounted = false; };
    }
    void burnoutService.getDashboardData()
      .then((result) => {
        if (mounted) setDashboardData(result);
      })
      .catch(() => {
        if (mounted) setDataLoadError(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dashboardData && !connectedData) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.burnout-app [data-burnout-reveal]'));
    if (!sections.length) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [dashboardData, connectedData]);

  if (hasApiBaseUrl) {
    if (!connectedData) return <div className="site-shell burnout-app"><div className="burnout-data-state" role="status">Loading connected study signals…</div></div>;
    return <ConnectedBurnout data={connectedData} />;
  }

  if (!dashboardData) {
    return (
      <div className="site-shell burnout-app">
        <div className="burnout-data-state" role={dataLoadError ? 'alert' : 'status'}>
          {dataLoadError ? 'Burnout insights could not be loaded.' : 'Loading burnout insights…'}
        </div>
      </div>
    );
  }

  const { period, student, risk, signals, behaviorStats, trend, trendSummary, explanationSummary, riskFactors, riskFactorScale, plan, recommendedActions } = dashboardData;
  const riskChange = risk.score - risk.previousWeekScore;
  const trendStart = trend[0]?.risk ?? risk.score;
  const trendEnd = trend[trend.length - 1]?.risk ?? risk.score;
  const trendChange = trendStart - trendEnd;
  const hoursAboveUsual = Math.abs(signals.studyIntensity.value - signals.studyIntensity.usualHours);
  const factorScale = Math.max(riskFactorScale, ...riskFactors.map((factor) => factor.points), 1);

  function toggleAction(id: string) {
    setCompletedActions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="site-shell burnout-app">
      <div className="burnout-layout">
        <aside className="burnout-sidebar">
          <div className="burnout-brand"><Brand /></div>
          <span className="burnout-nav-caption">YOUR STUDY SPACE</span>
          <nav className="burnout-nav" aria-label="Study space">
            {navigation.map(({ label, to, icon: Icon }) => <Link key={label} to={to} aria-current={label === 'Burnout' ? 'page' : undefined} className={`burnout-nav-link ${label === 'Burnout' ? 'is-active' : ''}`}>
              <Icon size={16} strokeWidth={1.65} /><span>{label}</span>{label === 'Burnout' && <i />}
            </Link>)}
          </nav>
          <div className="burnout-sidebar-spacer" />
          <div className="burnout-sidebar-note"><span className="burnout-note-icon"><Sparkles size={14} /></span><span>YOUR STUDY RHYTHM<b>Make space to reset.</b></span></div>
          <div className="burnout-user"><span className="burnout-avatar">{student.initials}</span><span>{student.name}<small>{student.program}</small></span></div>
        </aside>

        <main className="burnout-main">
          <header className="burnout-topbar">
            <div className="burnout-crumb"><Link to="/">Adaptive Study</Link><span>/</span><b>Burnout</b></div>
            <div className="burnout-topbar-right"><span className="burnout-demo-indicator"><i /> DEMO DATA</span><span className="burnout-topbar-date">{period.topbarDate}</span><span className="burnout-avatar burnout-avatar--small">{student.initials}</span></div>
          </header>

          <div className="burnout-content">
            <div className="burnout-page-heading" data-burnout-reveal>
              <div><span className="burnout-eyebrow"><Activity size={12} /> {period.weekLabel}</span><h1>Burnout, in balance.</h1><p>A thoughtful read on your study rhythm, workload, and recovery.</p></div>
              <span className="burnout-period"><CalendarDays size={14} /> {period.rangeLabel}</span>
            </div>

            <section className="burnout-hero-grid" aria-label="Burnout risk summary" data-burnout-reveal>
              <article className="burnout-panel burnout-score-panel">
                <div className="burnout-panel-heading"><div><span className="burnout-overline">OVERALL BURNOUT RISK</span><h2>Your current signal</h2></div><span className="burnout-info-mark" title="Illustrative study-pattern signal"><CircleHelp size={15} /></span></div>
                <RiskGauge value={risk.score} status={risk.status} contextLabel={risk.contextLabel} />
                <div className="burnout-score-foot"><span>{riskChange <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />} <CountUp value={Math.abs(riskChange)} /> points</span><small>{riskChange < 0 ? 'lower than last week' : riskChange > 0 ? 'higher than last week' : 'unchanged since last week'}</small><span className="burnout-score-foot-note">{risk.moderateRangeLabel}</span></div>
              </article>

              <div className="burnout-signal-grid">
                <article className="burnout-panel burnout-signal-card burnout-signal-card--intensity">
                  <span className="burnout-signal-icon"><Clock3 size={16} /></span><span className="burnout-overline">STUDY INTENSITY</span><strong><CountUp value={signals.studyIntensity.value} decimals={1} /> <small>{signals.studyIntensity.unit}</small></strong><span className="burnout-signal-note"><ArrowUpRight size={12} /> {hoursAboveUsual.toFixed(1)} hrs above your usual</span>
                </article>
                <article className="burnout-panel burnout-signal-card burnout-signal-card--missed">
                  <span className="burnout-signal-icon"><CalendarDays size={16} /></span><span className="burnout-overline">MISSED SESSIONS</span><strong><CountUp value={signals.missedSessions.value} /> <small>{signals.missedSessions.periodLabel}</small></strong><span className="burnout-signal-note">Of {signals.missedSessions.planned} planned sessions</span>
                </article>
                <article className="burnout-panel burnout-signal-card burnout-signal-card--recovery">
                  <span className="burnout-signal-icon"><Moon size={16} /></span><span className="burnout-overline">RECOVERY</span><strong><CountUp value={signals.recovery.value} /><small>%</small></strong><span className="burnout-signal-note">{signals.recovery.note}</span>
                </article>
              </div>
            </section>

            <section className="burnout-panel burnout-behavior" aria-labelledby="behavior-title" data-burnout-reveal>
              <div className="burnout-section-head"><div><span className="burnout-overline">YOUR WEEK, AT A GLANCE</span><h2 id="behavior-title">Behavioral Overview</h2></div><span className="burnout-muted-label">LAST 7 DAYS</span></div>
              <div className="burnout-behavior-grid">
                {behaviorStats.map((stat) => <article className={`burnout-behavior-stat tone-${stat.tone}`} key={stat.label}>
                  <span>{stat.label}</span><strong><CountUp value={stat.value} decimals={stat.decimals} /><small>{stat.suffix}</small></strong><em>{stat.note}</em>
                </article>)}
              </div>
            </section>

            <section className="burnout-analysis-grid" data-burnout-reveal>
              <article className="burnout-panel burnout-trend-panel">
                <div className="burnout-section-head"><div><span className="burnout-overline">A WEEK IN CONTEXT</span><h2>Burnout Risk Trend</h2></div><span className="burnout-trend-badge"><i /> {trendChange > 0 ? '−' : trendChange < 0 ? '+' : ''}{Math.abs(trendChange)} pts</span></div>
                <p className="burnout-panel-subtitle">{trendSummary}</p>
                <RiskTrendChart data={trend} />
                <div className="burnout-chart-foot"><span><i /> Risk score</span><span>Lower is lighter</span></div>
              </article>

              <article className="burnout-panel burnout-breakdown-panel">
                <div className="burnout-section-head"><div><span className="burnout-overline">WHAT IS CONTRIBUTING</span><h2>Risk Breakdown</h2></div><span className="burnout-breakdown-total"><CountUp value={risk.score} /> <small>pts</small></span></div>
                <div className="burnout-factor-list">
                  {riskFactors.map((factor) => <div className="burnout-factor" key={factor.label}>
                    <div className="burnout-factor-top"><span>{factor.label}<small>{factor.detail}</small></span><b><CountUp value={factor.points} /><small>pts</small></b></div>
                    <div className="burnout-factor-track"><i className={`tone-${factor.tone}`} style={{ width: `${Math.min((factor.points / factorScale) * 100, 100)}%` }} /></div>
                  </div>)}
                </div>
                <span className="burnout-breakdown-foot">Signals are relative planning cues, not a diagnosis.</span>
              </article>
            </section>

            <section className="burnout-response-grid" data-burnout-reveal>
              <article className={`burnout-panel burnout-adaptive-panel ${planApplied ? 'is-plan-applied' : ''}`}>
                <div className="burnout-section-head"><div><span className="burnout-overline"><Sparkles size={12} /> ADAPTIVE RESPONSE</span><h2>A lighter plan, by design.</h2></div><span className="burnout-response-tag">PLAN PREVIEW</span></div>
                <p className="burnout-panel-subtitle">Your study plan responds to the signal—not just the calendar.</p>
                <div className="burnout-plan-compare">
                  <div><span>THIS WEEK</span><strong><CountUp value={plan.currentFocusBlocks} /> <small>focus blocks</small></strong><em>{plan.currentDuration}</em></div>
                  <ArrowRight size={18} />
                  <div className="burnout-plan-next"><span>ADAPTED</span><strong><CountUp value={plan.adaptedFocusBlocks} /> <small>focus blocks</small></strong><em>+ {plan.recoveryBufferCount} recovery buffer{plan.recoveryBufferCount === 1 ? '' : 's'}</em></div>
                </div>
                <div className="burnout-projection"><span><Activity size={14} /> PROJECTED IN {plan.projectionDays} DAYS</span><strong><CountUp value={risk.score} /> <ArrowRight size={13} /> <CountUp value={plan.projectedRisk} /></strong><small>if this lighter rhythm holds</small></div>
                <button className="burnout-primary-button" type="button" onClick={() => setPlanApplied((value) => !value)}>{planApplied ? <><Check size={14} /> Demo plan adjusted</> : <>Preview adjusted plan <ArrowRight size={14} /></>}</button>
                {planApplied && <span className="burnout-local-confirmation" role="status">Preview only — no schedule was saved.</span>}
              </article>

              <article className="burnout-panel burnout-actions-panel">
                <div className="burnout-section-head"><div><span className="burnout-overline">SMALL STEPS, GENTLY</span><h2>Recommended Actions</h2></div><span className="burnout-action-count">{completedActions.length}/{recommendedActions.length}</span></div>
                <div className="burnout-action-list">
                  {recommendedActions.map((action) => {
                    const isDone = completedActions.includes(action.id);
                    return <div className={`burnout-action ${isDone ? 'is-complete' : ''}`} key={action.id}>
                      <button type="button" aria-label={`${isDone ? 'Unmark' : 'Mark'} ${action.title}`} aria-pressed={isDone} onClick={() => toggleAction(action.id)}>{isDone && <Check size={12} />}</button>
                      <div><strong>{action.title}</strong><p>{action.detail}</p><span>{action.when}</span></div>
                    </div>;
                  })}
                </div>
              </article>
            </section>

            <aside className="burnout-explanation" aria-labelledby="burnout-explanation-title" data-burnout-reveal>
              <span className="burnout-explanation-icon"><CircleHelp size={18} /></span>
              <div><span className="burnout-overline">A LITTLE CONTEXT</span><h2 id="burnout-explanation-title">Why is your risk {risk.status.toLowerCase()}?</h2><p>{explanationSummary.replace('{missedSessions}', String(signals.missedSessions.value))}</p><span className="burnout-disclaimer">This is a demo planning signal, not a medical assessment.</span></div>
              <span className="burnout-explanation-mark"><Sparkles size={22} /></span>
            </aside>
            <footer className="burnout-footer"><span>ADAPTIVE STUDY ECOSYSTEM</span><span>Progress should leave room to recover.</span></footer>
          </div>
        </main>
      </div>
    </div>
  );
}
