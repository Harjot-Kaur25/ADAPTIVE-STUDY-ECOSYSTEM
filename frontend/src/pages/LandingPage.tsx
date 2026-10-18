import { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BrainCircuit, CalendarDays, Check, Clock3, Layers3, MoveRight, Sparkles, Target, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardPreview from '../components/DashboardPreview';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import SiteNav from '../components/SiteNav';

const steps = [
  { number: '01', name: 'Input', icon: Layers3, copy: 'Your courses, deadlines, and the time you actually have.' },
  { number: '02', name: 'Analyze', icon: BrainCircuit, copy: 'Patterns in focus, effort, and energy start to emerge.' },
  { number: '03', name: 'Adapt', icon: Waves, copy: 'The next study block shifts to fit your day as it unfolds.' },
  { number: '04', name: 'Improve', icon: ArrowUpRight, copy: 'Each session makes the next recommendation more yours.' },
];
const featureItems = [
  { name: 'Prioritize', number: '01', icon: Target, copy: 'Know what matters most, before everything feels urgent.', detail: 'Clear next steps, ordered by impact.' },
  { name: 'Adapt', number: '02', icon: Waves, copy: 'Make room for the day you have—not the one you planned for.', detail: 'Plans that respond without judgment.' },
  { name: 'Plan', number: '03', icon: CalendarDays, copy: 'Build a rhythm around your real time and energy.', detail: 'Structure with space to breathe.' },
  { name: 'Track', number: '04', icon: Clock3, copy: 'See progress as proof of momentum, not pressure.', detail: 'A record of how far you have come.' },
];

function Eyebrow({ children, index }: { children: string; index?: string }) {
  return <span className="eyebrow"><i />{index && <b>{index} / </b>}{children}</span>;
}

function LandingPage() {
  const [dayShifted, setDayShifted] = useState(false);
  return (
    <div className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <SiteNav />
      <main>
        <section className="hero section-wrap" id="hero">
          <div className="hero-grid" aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <div className="hero-copy">
            <Reveal><Eyebrow>AN ADAPTIVE STUDY ECOSYSTEM</Eyebrow></Reveal>
            <h1 className="hero-title"><span className="hero-line" style={{ '--line-index': 0 } as React.CSSProperties}>Your Study Plan.</span><span className="hero-line hero-line--accent" style={{ '--line-index': 1 } as React.CSSProperties}>Adapts To <em>You.</em></span></h1>
            <Reveal delay={180}><p className="hero-intro">Because the best plan isn’t the one you made on Sunday.<br /><span>It’s the one that still works on Wednesday.</span></p></Reveal>
            <Reveal delay={280}><div className="hero-actions"><Link className="button-primary" to="/login">Sign in to your space <ArrowRight size={15} /></Link><a className="text-link" href="#how-it-works">See how it moves <ArrowDown size={14} /></a></div></Reveal>
            <div className="hero-caption"><span>01 — LEARNING, IN MOTION</span><span>SCROLL TO EXPLORE <i>↓</i></span></div>
          </div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring--outer" /><div className="orbit-ring orbit-ring--inner" /><div className="orbit-core"><span>A</span><i /></div><span className="orbit-label orbit-label--top">YOUR PACE</span><span className="orbit-label orbit-label--bottom">YOUR DIRECTION</span><span className="orbit-spark orbit-spark--one" /><span className="orbit-spark orbit-spark--two" /></div>
        </section>

        <section className="problem-section section-wrap" id="problem">
          <div className="section-meta"><Eyebrow index="01">THE FRICTION</Eyebrow><span>IT’S NOT A LACK OF EFFORT.</span></div>
          <div className="problem-layout"><Reveal className="problem-heading"><h2>Your Workload<br />Is Never <em>Static.</em></h2></Reveal><div className="problem-story"><Reveal delay={120}><p className="problem-lede">So why should your study plan be?</p><p>A deadline moves. A class runs long. You wake up with less focus than you expected. Suddenly, the plan you made for your life doesn’t fit the life you’re having.</p><p>That’s not a failure of discipline. It’s a plan that never knew how to change.</p><a className="quiet-link" href="#how-it-works">There’s another way <MoveRight size={15} /></a></Reveal></div></div>
          <div className="problem-bottom"><span>STATIC PLANS ASSUME A STATIC LIFE</span><span className="problem-rule" /><span>REAL LIFE DOESN’T RUN ON A TEMPLATE</span></div>
        </section>

        <section className="steps-section section-wrap" id="how-it-works">
          <div className="steps-heading"><Reveal><Eyebrow index="02">HOW IT WORKS</Eyebrow><h2>A plan that<br /><em>pays attention.</em></h2></Reveal><Reveal delay={120}><p>Your study rhythm becomes a feedback loop—each day a little more in tune with how you learn.</p></Reveal></div>
          <div className="steps-flow">{steps.map((step, index) => { const Icon = step.icon; return <Reveal key={step.number} delay={index * 105} className="step-card"><span className="step-number">{step.number}</span><span className="step-icon"><Icon size={18} strokeWidth={1.4} /></span><h3>{step.name}</h3><p>{step.copy}</p>{index < steps.length - 1 && <span className="step-connect" aria-hidden="true">→</span>}</Reveal>; })}</div>
          <div className="steps-equation"><span>THE SIGNAL</span><i /><span>THE PATTERN</span><i /><span>THE NEXT BEST MOVE</span><i /><span>A BETTER RHYTHM</span></div>
        </section>

        <section className="adaptive-section section-wrap" id="adaptive-system">
          <div className="adaptive-heading"><Reveal><Eyebrow index="03">THE ADAPTIVE SYSTEM</Eyebrow><h2>Not a calendar.<br /><em>A conversation.</em></h2></Reveal><Reveal delay={120}><p>A quiet intelligence between where you are and what comes next. It notices the gap—and helps close it.</p></Reveal></div>
          <div className="system-visual">
            <div className="system-side system-side--left"><span className="system-caption">WHAT’S HAPPENING</span><div className="signal signal--one"><i /><span>Focus is highest before noon</span></div><div className="signal signal--two"><i /><span>Biology review is due tomorrow</span></div><div className="signal signal--three"><i /><span>Yesterday’s session ran long</span></div></div>
            <div className="system-engine"><div className="engine-orbit engine-orbit--a" /><div className="engine-orbit engine-orbit--b" /><div className="engine-ring"><BrainCircuit size={26} strokeWidth={1.15} /></div><span className="engine-label">ADAPTIVE<br />INTELLIGENCE</span><span className="engine-line engine-line--a" /><span className="engine-line engine-line--b" /></div>
            <div className="system-side system-side--right"><span className="system-caption">WHAT COMES NEXT</span><div className="next-block"><span>10:30 AM <i>NOW</i></span><b>Biology review</b><small>25 min · when focus is high</small></div><div className="next-block next-block--muted"><span>02:00 PM</span><b>Calculus problem set</b><small>45 min · after a real break</small></div><div className="next-shift"><Sparkles size={12} /> SEQUENCE REFINED</div></div>
            <div className="visual-footnote"><span>INPUTS BECOME INSIGHT</span><span>INSIGHT BECOMES YOUR NEXT STEP</span></div>
          </div>
        </section>

        <section className="product-section section-wrap" id="dashboard">
          <div className="type-ribbon" aria-hidden="true"><div className="type-ribbon-track"><span>PLAN WITH ROOM TO MOVE <i>✳</i> KEEP YOUR OWN RHYTHM <i>✳</i> MAKE SPACE FOR THE DAY <i>✳</i> LEARNING IN MOTION <i>✳</i></span><span>PLAN WITH ROOM TO MOVE <i>✳</i> KEEP YOUR OWN RHYTHM <i>✳</i> MAKE SPACE FOR THE DAY <i>✳</i> LEARNING IN MOTION <i>✳</i></span></div></div>
          <div className="product-header"><Reveal><Eyebrow index="04">A CLEARER VIEW OF YOUR DAY</Eyebrow><h2>See what’s next.<br /><em>Feel the difference.</em></h2></Reveal><Reveal delay={100}><p>One calm place for your plan, your progress, and the next small win.</p></Reveal></div>
          <Reveal className="dashboard-reveal"><DashboardPreview /></Reveal>
          <div className="product-foot"><span>01 / A PLAN THAT CAN MOVE</span><span>02 / PROGRESS WITHOUT PRESSURE</span><span>03 / MORE SPACE TO FOCUS</span></div>
        </section>

        <section className="intelligence-section section-wrap" id="intelligence">
          <div className="intelligence-copy"><Reveal><Eyebrow index="05">ADAPTIVE INTELLIGENCE</Eyebrow><h2>The day changed.<br /><em>Your plan can too.</em></h2><p>When the unexpected happens, you don’t start over. Your plan makes room—keeping the important things in view while giving the day a shape that still feels possible.</p></Reveal><div className="change-controls"><span>TRY A CHANGE</span><button type="button" className={!dayShifted ? 'change-chip is-selected' : 'change-chip'} onClick={() => setDayShifted(false)}>Day as planned</button><button type="button" className={dayShifted ? 'change-chip is-selected' : 'change-chip'} onClick={() => setDayShifted(true)}>Lost an hour</button></div></div>
          <Reveal className="schedule-demo"><div className="schedule-demo-head"><span><i className="live-dot" />{dayShifted ? 'PLAN, REBALANCED' : 'YOUR ORIGINAL RHYTHM'}</span><span>THURSDAY <span>↗</span></span></div><div className="schedule-context"><span className="context-mark"><Sparkles size={15} /></span><p>{dayShifted ? <>An hour disappeared. <b>The essentials stay.</b><br />A lighter afternoon makes room.</> : <>A steady day ahead. <b>Three focused blocks</b><br />with space between each one.</>}</p></div><div className="schedule-demo-list"><div className={`demo-row ${dayShifted ? 'demo-row--changed' : ''}`}><span>{dayShifted ? '10:00' : '09:00'}</span><i className="demo-dot demo-dot--blue" /><div><b>Biology · Cell systems</b><small>25 min / Focus block</small></div><span className="demo-status">{dayShifted ? 'MOVED UP' : 'ON TRACK'}</span></div><div className={`demo-row ${dayShifted ? 'demo-row--soft' : ''}`}><span>{dayShifted ? '13:30' : '11:30'}</span><i className="demo-dot" /><div><b>Calculus · Practice set</b><small>{dayShifted ? '30 min / Shortened' : '45 min / Practice'}</small></div><span className="demo-status">{dayShifted ? 'RESHAPED' : 'ON TRACK'}</span></div><div className="demo-row demo-row--muted"><span>{dayShifted ? '15:00' : '14:00'}</span><i className="demo-dot" /><div><b>Psychology · Recall</b><small>{dayShifted ? 'Moved to tomorrow' : '20 min / Review'}</small></div><span className="demo-status">{dayShifted ? 'RELEASED' : 'ON TRACK'}</span></div></div><div className="schedule-demo-foot"><span><Check size={12} /> KEEP THE MOMENTUM</span><span>{dayShifted ? '2 OF 3 BLOCKS PRESERVED' : 'A PLAN WITH ROOM TO BREATHE'}</span></div></Reveal>
        </section>

        <section className="features-section section-wrap" id="features">
          <div className="features-head"><Reveal><Eyebrow index="06">THE EVERYDAY ADVANTAGE</Eyebrow><h2>Four ways to<br /><em>move forward.</em></h2></Reveal><Reveal delay={100}><p>Less time negotiating with your schedule. More time doing the work that matters.</p></Reveal></div>
          <div className="feature-list">{featureItems.map((item, index) => { const Icon = item.icon; return <Reveal key={item.number} delay={index * 70} className="feature-row"><span className="feature-number">{item.number}</span><span className="feature-icon"><Icon size={18} strokeWidth={1.3} /></span><div className="feature-name-wrap"><h3>{item.name}</h3><span>{item.detail}</span></div><p>{item.copy}</p><ArrowUpRight className="feature-arrow" size={17} /></Reveal>; })}</div>
        </section>

        <section className="why-section section-wrap" id="why-adaptive">
          <div className="why-side"><Reveal><Eyebrow index="07">WHY ADAPTIVE?</Eyebrow><span className="why-big">A BETTER<br />PLAN ISN’T<br />A <em>STRICTER</em><br />ONE.</span></Reveal></div>
          <div className="why-content"><Reveal><p className="why-lede">It’s a plan that knows when to hold steady—and when to make space.</p><p>Adaptive Study is built around a simple belief: progress should work with your life, not ask you to pause it. Your plan stays clear. Your choices stay yours.</p><div className="why-proof"><span><i>01</i> Room to change</span><span><i>02</i> Clarity without pressure</span><span><i>03</i> Progress that feels like yours</span></div></Reveal></div>
          <span className="why-orbit" aria-hidden="true">A<i>·</i>S</span>
        </section>

        <section className="final-cta section-wrap" id="final-cta">
          <div className="cta-backdrop" aria-hidden="true"><span /><span /><span /></div>
          <Reveal><Eyebrow>YOUR NEXT STEP, REIMAGINED</Eyebrow><h2>A plan that meets<br />you <em>where you are.</em></h2><p>Start with the day you have. Let the plan grow from there.</p><Link className="button-primary button-primary--bright" to="/dashboard">Open the dashboard <ArrowRight size={15} /></Link><span className="cta-note">NO PERFECT ROUTINE REQUIRED</span></Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
