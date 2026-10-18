import { Link } from 'react-router-dom';
import Brand from './Brand';

export default function SiteNav() {
  return (
    <header className="site-nav">
      <Brand />
      <nav className="nav-links" aria-label="Main navigation">
        <a href="/#how-it-works">How it works</a>
        <a href="/#features">Features</a>
        <Link to="/login">Sign in</Link>
        <Link className="nav-cta" to="/dashboard">Open dashboard <span>↗</span></Link>
      </nav>
    </header>
  );
}
