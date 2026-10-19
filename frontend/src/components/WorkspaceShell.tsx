import { useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, BookOpen, CalendarDays, LayoutDashboard, Library, PanelLeftClose, PanelLeftOpen, Settings2, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from './Brand';

export type DashboardSection = 'Overview' | 'Schedule' | 'Subjects' | 'Resources' | 'Progress' | 'Goals';
const sections: { label: DashboardSection; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Subjects', icon: BookOpen },
  { label: 'Resources', icon: Library },
  { label: 'Progress', icon: BarChart3 },
  { label: 'Goals', icon: Target },
];
type Props = { active: DashboardSection | 'Settings' | 'Burnout'; onSectionChange: (section: DashboardSection) => void; eyebrow: string; title: string; profileName?: string; profileDetail?: string; children: React.ReactNode };

export default function WorkspaceShell({ active, onSectionChange, eyebrow, title, profileName = 'Alex Morgan', profileDetail = 'Computer Science · Year 2', children }: Props) {
  const [collapsed, setCollapsed] = useState(() => document.documentElement.dataset.workspaceCollapsed === 'true');
  const initials = profileName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      document.documentElement.dataset.workspaceCollapsed = String(next);
      return next;
    });
  }
  return (
    <div className={`workspace-root ${active === 'Settings' ? 'workspace-root--settings' : ''} ${collapsed ? 'workspace-root--sidebar-collapsed' : ''}`}>
      <aside className="workspace-sidebar">
        <div className="workspace-brand"><Brand /><button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-menu" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
        <span className="sidebar-label">YOUR STUDY SPACE</span>
        <nav id="workspace-menu" className="workspace-menu" aria-label="Study dashboard">
          {sections.map(({ label, icon: Icon }) => <button key={label} type="button" title={collapsed ? label : undefined} aria-label={label} aria-current={active === label ? 'page' : undefined} className={`workspace-menu-item ${active === label ? 'is-active' : ''}`} onClick={() => onSectionChange(label)}><Icon size={16} strokeWidth={1.6} /><span>{label}</span>{active === label && <i />}</button>)}
          <Link className={`workspace-menu-item ${active === 'Burnout' ? 'is-active' : ''}`} title={collapsed ? 'Burnout' : undefined} aria-label="Burnout" aria-current={active === 'Burnout' ? 'page' : undefined} to="/burnout"><Activity size={16} strokeWidth={1.6} /><span>Burnout</span>{active === 'Burnout' && <i />}</Link>
          <Link className={`workspace-menu-item ${active === 'Settings' ? 'is-active' : ''}`} title={collapsed ? 'Settings' : undefined} aria-label="Settings" aria-current={active === 'Settings' ? 'page' : undefined} to="/settings"><Settings2 size={16} strokeWidth={1.6} /><span>Settings</span>{active === 'Settings' && <i />}</Link>
        </nav>
        {active === 'Settings' && <nav className="settings-side-nav" aria-label="Settings sections"><span>SETTINGS</span><a href="#profile">Profile details</a><a href="#education">Academic details</a><a href="#study-preferences">Study preferences</a><a href="#notifications">Notifications</a><a href="#appearance">Appearance</a><a href="#privacy">Privacy & data</a></nav>}
        <div className="sidebar-spacer" />
        <div className="sidebar-insight"><span className="sidebar-insight-icon">✳</span><span>YOUR STUDY RHYTHM<b>Steady progress</b></span><span className="sidebar-insight-dot" /></div>
        <div className="sidebar-profile"><span className="profile-avatar">{initials}</span><span className="profile-name">{profileName}<small>{profileDetail}</small></span><ArrowUpRight size={14} /></div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar"><div className="workspace-breadcrumb"><Link to="/">Adaptive Study</Link><span>/</span><span>{active}</span></div><div className="workspace-top-actions"><span className="topbar-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</span><Link className="topbar-settings-link" to="/settings" aria-label="Open settings"><Settings2 size={16} /></Link><span className="topbar-avatar">{initials}</span></div></header>
        <section className="workspace-content"><div className={`workspace-page-heading ${active === 'Overview' ? 'workspace-page-heading--overview' : ''}`}><span className="workspace-eyebrow"><i />{eyebrow}</span><h1>{title}</h1></div>{children}</section>
        <footer className="workspace-footer"><span>ADAPTIVE STUDY ECOSYSTEM</span><span>A plan with room to move.</span></footer>
      </main>
    </div>
  );
}
