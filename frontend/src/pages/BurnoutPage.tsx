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
  Gauge,
  LayoutDashboard,
  Moon,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { burnoutService } from '../services/burnoutService';
import type { BurnoutPageData, BurnoutTrendPoint } from '../services/burnoutService';
import './BurnoutPage.css';

const navigation = [
  { label: 'Overview', to: '/dashboard?section=overview', icon: LayoutDashboard },
  { label: 'Study Planner', to: '/dashboard?section=schedule', icon: CalendarDays },
  { label: 'Progress', to: '/dashboard?section=progress', icon: BarChart3 },
  { label: 'Resources', to: '/dashboard?section=subjects', icon: BookOpen },
  { label: 'Burnout', to: '/burnout', icon: Activity },
  { label: 'Analytics', to: '/dashboard?section=progress', icon: Gauge },
  { label: 'Goals', to: '/dashboard?section=goals', icon: Target },
  { label: 'Settings', to: '/settings', icon: Settings2 },
] as const;

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
  const [dataLoadError, setDataLoadError] = useState(false);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [planApplied, setPlanApplied] = useState(false);

  useEffect(() => {
    let mounted = true;
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
    if (!dashboardData) return;
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
  }, [dashboardData]);

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
