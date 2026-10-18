import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Clock3, MoreHorizontal, Sparkles } from 'lucide-react';

const tasks = [
  { time: '09:30', title: 'Cellular respiration', meta: 'Biology · Focus block', tag: 'DEEP WORK', done: true },
  { time: '11:00', title: 'Problem set 04', meta: 'Calculus · 45 min', tag: 'PRACTICE', done: false },
  { time: '14:15', title: 'Review: neural pathways', meta: 'Psychology · Recall', tag: 'REVIEW', done: false },
];

export default function DashboardPreview() {
  const [selectedWeek, setSelectedWeek] = useState('this week');
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const weekMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!weekMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!weekMenuRef.current?.contains(event.target as Node)) setWeekMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWeekMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [weekMenuOpen]);
  const weekDetails = {
    'this week': { date: 'MONDAY, OCTOBER 21', score: '82', gain: '+8 this week', hours: '3.5' },
    'next week': { date: 'MONDAY, OCTOBER 28', score: '86', gain: '+4 next week', hours: '4.0' },
    'previous week': { date: 'MONDAY, OCTOBER 14', score: '74', gain: '+6 last week', hours: '3.0' },
  }[selectedWeek] ?? { date: 'MONDAY, OCTOBER 21', score: '82', gain: '+8 this week', hours: '3.5' };
  return (
    <div className="dashboard-shell" aria-label="Illustrative adaptive study planner preview">
      <div className="dashboard-topline"><span><i className="live-dot" /> STUDY SPACE / TODAY</span><span>MON, OCT 21 <MoreHorizontal size={16} /></span></div>
      <div className="dashboard-body">
        <aside className="dash-rail"><span className="rail-icon rail-icon--active">A</span><span className="rail-icon">◌</span><span className="rail-icon">⌁</span><span className="rail-icon">▦</span><span className="rail-avatar">JD</span></aside>
        <div className="dash-main">
          <div className="dash-heading"><div><span className="dash-kicker">{weekDetails.date}</span><h3>Your day, in focus<span>.</span></h3><p>One good session at a time.</p></div><div ref={weekMenuRef} style={{ position: 'relative' }}><button type="button" className="date-chip" aria-label="Select sample week" aria-haspopup="listbox" aria-expanded={weekMenuOpen} onClick={() => setWeekMenuOpen((open) => !open)}>{selectedWeek.replace(/^./, (letter) => letter.toUpperCase())} <span>⌄</span></button>{weekMenuOpen && <div role="listbox" aria-label="Sample week" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 2, background: 'inherit' }}>{(['this week', 'next week', 'previous week'] as const).map((week) => <button type="button" role="option" aria-selected={selectedWeek === week} key={week} className="date-chip" onClick={() => { setSelectedWeek(week); setWeekMenuOpen(false); }}>{week.replace(/^./, (letter) => letter.toUpperCase())}</button>)}</div>}</div></div>
          <div className="dash-overview">
            <div className="focus-card"><div className="focus-header"><span>FOCUS SCORE</span><span className="focus-trend"><ArrowUpRight size={13} /> 12%</span></div><div className="focus-number">{weekDetails.score}<span>/100</span></div><div className="focus-meter"><i /></div><div className="meter-caption"><span>Building momentum</span><span>{weekDetails.gain}</span></div></div>
            <div className="hours-card"><span>TIME WELL SPENT</span><div className="hours-value">{weekDetails.hours} <small>hrs</small></div><div className="bar-chart" aria-hidden="true">{[35,52,44,72,57,88,63,76,49,92,67,82,55,72,97,61,80,69,88,72,48,79,65,89,57,73,93,62].map((height, i) => <i key={i} style={{ height: `${height}%`, opacity: 0.25 + height / 140 }} />)}</div><div className="chart-days"><span>MON</span><span>WED</span><span>FRI</span><span>SUN</span></div></div>
          </div>
          <div className="schedule-header"><div><span className="dash-kicker">YOUR STUDY FLOW</span><h4>Today’s plan</h4></div><span className="task-count">03 BLOCKS</span></div>
          <div className="schedule-list">{tasks.map((task) => <div className={`schedule-row ${task.done ? 'schedule-row--done' : ''}`} key={task.time}><span className="task-time">{task.time}</span><span className="task-state">{task.done ? <Check size={13} /> : <span />}</span><div className="task-name">{task.title}<small>{task.meta}</small></div><span className="task-tag">{task.tag}</span></div>)}</div>
        </div>
        <div className="ai-note"><span className="ai-note-icon"><Sparkles size={14} /></span><div><b>Plan, recalibrated</b><p>Your energy is peaking.<br />A harder block moved here.</p><span>JUST NOW <ArrowDownRight size={12} /></span></div></div>
      </div>
      <div className="dashboard-bottom"><span><Clock3 size={12} /> YOUR PACE, HONORED</span><span>01 — 04 <i>••••</i></span></div>
    </div>
  );
}
