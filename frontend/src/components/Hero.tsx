import { ArrowRight, BookOpenCheck, CalendarDays, Check, Clock3, Sparkles, Target } from 'lucide-react'

const week = [32, 55, 44, 76, 60, 94, 69]

export default function Hero() {
  return <section className="hero-card" aria-labelledby="hero-title">
    <div className="hero-copy"><div className="hero-label"><span className="hero-label-dot" /> YOUR PERSONAL STUDY ECOSYSTEM</div><h2 id="hero-title">Your study plan<br />starts here.</h2><p>StudyEco turns your deadlines, priorities and available time into an adaptive study plan built around you.</p><a className="hero-button" href="#focus">Start Learning Smarter <ArrowRight size={17} /></a><div className="hero-footnote"><span><Check size={13} /> Built around your real week</span><span><Check size={13} /> Ready to adapt</span></div></div>
    <div className="hero-art" aria-label="StudyEco study plan preview">
      <div className="art-orbit art-orbit--one" /><div className="art-orbit art-orbit--two" />
      <div className="art-calendar"><div className="art-calendar-head"><div><small>OCTOBER 2026</small><strong>Study calendar</strong></div><CalendarDays size={16} /></div><div className="calendar-week">{['M','T','W','T','F','S','S'].map((day, i) => <span key={`${day}-${i}`}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: 14 }, (_, i) => <span key={i} className={`${i === 8 ? 'calendar-day--active' : ''} ${[2, 5, 10].includes(i) ? 'calendar-day--event' : ''}`}>{i + 12}</span>)}</div></div>
      <div className="art-plan"><div className="art-plan-title"><span className="art-plan-icon"><BookOpenCheck size={15} /></span><div><small>TODAY'S STUDY PLAN</small><strong>Tuesday, Oct 20</strong></div><span className="plan-count">3 tasks</span></div><div className="art-task"><span className="art-task-check"><Check size={11} /></span><div><strong>Integration techniques</strong><small>Mathematics · 45 min</small></div><span className="art-task-time">09:00</span></div><div className="art-task"><span className="art-task-check art-task-check--empty" /><div><strong>Network layers review</strong><small>Computer Networks · 45 min</small></div><span className="art-task-time">11:30</span></div><div className="art-task"><span className="art-task-check art-task-check--empty" /><div><strong>Cell biology recap</strong><small>Biology · 30 min</small></div><span className="art-task-time">14:00</span></div></div>
      <div className="art-priority"><div className="art-priority-icon"><Target size={14} /></div><div><small>AI PRIORITY</small><strong>Computer Networks</strong></div><span>94%</span></div>
      <div className="art-progress"><div className="art-progress-title"><span>Weekly progress</span><strong>12.5h</strong></div><div className="art-bars">{week.map((height, i) => <span key={i} className={i === 5 ? 'art-bar--active' : ''} style={{ height: `${height}%` }} />)}</div><div className="art-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div></div>
      <div className="art-float art-float--focus"><span><Sparkles size={14} /></span><div><strong>Focus session ready</strong><small>45 minutes · High priority</small></div></div>
      <div className="art-float art-float--deadline"><span><Clock3 size={14} /></span><div><strong>CAT II in 4 days</strong><small>Computer Networks</small></div></div>
    </div>
    <div className="hero-card-index">01 <span>—</span> PERSONALIZED PLANNING</div>
  </section>
}