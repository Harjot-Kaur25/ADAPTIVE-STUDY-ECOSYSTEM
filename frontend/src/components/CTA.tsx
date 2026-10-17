import { ArrowRight, Sparkles } from 'lucide-react'

export default function CTA() {
  return <section className="closing-card" id="get-started"><div className="closing-icon"><Sparkles size={18} /></div><div><span className="card-kicker">A BETTER STUDY RHYTHM STARTS WITH ONE STEP</span><h2>Make room for the work that matters.</h2><p>Your next study plan can start with what you already know about your week.</p></div><a href="#home" className="closing-button">Build my plan <ArrowRight size={16} /></a></section>
}