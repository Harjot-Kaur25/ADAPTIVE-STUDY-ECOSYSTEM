import { ArrowUpRight, Check, CircleCheck, Clock3, Sparkles } from 'lucide-react'

const readiness = [
  { name: 'Focus', value: 82, width: '82%' },
  { name: 'Consistency', value: 74, width: '74%' },
  { name: 'Deadline readiness', value: 91, width: '91%' },
]

export default function AIPersonalization() {
  return <section className="readiness-card" aria-labelledby="readiness-title"><div className="card-kicker"><span className="lime-dot" /> YOUR STUDY SNAPSHOT</div><div className="readiness-heading"><div><h2 id="readiness-title">AI Study Readiness</h2><p>A quick read on your week so far.</p></div><button className="round-action" type="button" aria-label="View readiness details"><ArrowUpRight size={16} /></button></div>
    <div className="readiness-score"><div className="score-ring"><span>84</span><small>/100</small></div><div><strong>Looking focused</strong><small>Your week is taking shape</small></div></div>
    <div className="readiness-metrics">{readiness.map(({ name, value, width }) => <div className="readiness-metric" key={name}><div className="metric-heading"><span>{name}</span><strong>{value}%</strong></div><div className="metric-track"><span style={{ width }} /></div></div>)}</div>
    <div className="readiness-note"><span className="readiness-note-icon"><CircleCheck size={16} /></span><div><strong>Your plan is looking good.</strong><small>3 high-priority tasks today</small></div><span className="readiness-note-count"><Check size={13} /></span></div>
    <div className="readiness-footer"><Sparkles size={13} /> Updated with your recent progress <span>·</span> <Clock3 size={12} /> Just now</div>
  </section>
}