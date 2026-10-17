import { BookOpenCheck, CalendarDays, Clock3, Sparkles } from 'lucide-react'

const signals = [
  { icon: CalendarDays, title: 'Deadlines, in context', text: 'The next due date is considered alongside the time you have to prepare.' },
  { icon: BookOpenCheck, title: 'Progress that matters', text: 'Completed sessions help keep your recommendations grounded in your week.' },
  { icon: Clock3, title: 'Time that is yours', text: 'Availability is part of the plan, so study sessions feel realistic.' },
]

export default function FeaturesGrid() {
  return <section className="signals-section" aria-label="How StudyEco personalizes your plan"><div className="signals-heading"><div><div className="card-kicker"><Sparkles size={13} /> PERSONAL, NOT ONE-SIZE-FITS-ALL</div><h2>Good plans pay attention.</h2></div><p>StudyEco brings the details of your academic life into one thoughtful view.</p></div><div className="signals-grid">{signals.map(({ icon: Icon, title, text }, index) => <article className="signal-card" key={title}><span className="signal-number">0{index + 1}</span><span className="signal-icon"><Icon size={17} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
}