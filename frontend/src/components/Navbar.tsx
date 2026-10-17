import { useState } from 'react'
import { Bell, BookOpen, CalendarDays, CheckSquare2, Home, LayoutDashboard, Search, Settings2, Sparkles, TrendingUp } from 'lucide-react'

const railItems = [
  { label: 'Home', icon: Home, target: 'home' },
  { label: 'AI planner', icon: Sparkles, target: 'focus' },
  { label: 'Calendar', icon: CalendarDays, target: 'dashboard' },
  { label: 'Progress', icon: TrendingUp, target: 'dashboard' },
  { label: 'Tasks', icon: CheckSquare2, target: 'focus' },
]

export default function Navbar() {
  const [active, setActive] = useState('Home')
  return <aside className="app-rail" aria-label="StudyEco navigation">
    <a href="#home" className="rail-logo" aria-label="StudyEco home"><span className="rail-logo-mark"><BookOpen size={19} /></span></a>
    <nav className="rail-nav">{railItems.map(({ label, icon: Icon, target }) => <a key={label} href={`#${target}`} title={label} aria-label={label} aria-current={active === label ? 'page' : undefined} className={`rail-button ${active === label ? 'rail-button--active' : ''}`} onClick={() => setActive(label)}><Icon size={19} strokeWidth={1.8} /></a>)}</nav>
    <div className="rail-bottom"><button type="button" title="Dashboard" aria-label="Dashboard" className="rail-button"><LayoutDashboard size={18} /></button><button type="button" title="Settings" aria-label="Settings" className="rail-button"><Settings2 size={18} /></button><button type="button" title="Maya Chen profile" className="rail-avatar">MC</button></div>
    <span className="rail-tooltip" aria-hidden="true">StudyEco</span>
  </aside>
}

export function WorkspaceHeader() {
  return <header className="workspace-header" id="home"><div><p className="header-greeting">Hi, there! <span aria-hidden="true">👋</span></p><h1>Let's build your perfect study day.</h1></div><div className="header-actions"><label className="search-pill"><Search size={16} /><input aria-label="Search" placeholder="Search your study space" /></label><button className="header-icon-button" type="button" aria-label="Notifications"><Bell size={18} /><span /></button><div className="header-profile"><div className="rail-avatar">MC</div><div><strong>Maya Chen</strong><small>Student</small></div></div><a className="header-start" href="#dashboard">Get Started <span>↗</span></a></div></header>
}