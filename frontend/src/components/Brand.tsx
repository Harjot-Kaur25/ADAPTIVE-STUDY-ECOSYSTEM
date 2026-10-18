import { Link } from 'react-router-dom';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? 'brand--compact' : ''}`} to="/" aria-label="Adaptive Study Ecosystem home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <defs><linearGradient id="adaptive-mark" x1="5" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse"><stop stopColor="#A9E2DD" /><stop offset="1" stopColor="#59B7AD" /></linearGradient></defs>
          <path d="M15.8 10.3c-3.5-2.2-7.1-1.9-9.1-.4v12.2c2.3-1.4 5.8-1.4 9.1.5V10.3Z" />
          <path d="M16.2 10.3c3.5-2.2 7.1-1.9 9.1-.4v12.2c-2.3-1.4-5.8-1.4-9.1.5V10.3Z" />
          <path d="M16 11v11.5" />
          <path className="brand-mark-spark" d="M23.7 5.1v4.2M21.6 7.2h4.2" />
        </svg>
      </span>
      {!compact && <span className="brand-name"><span className="brand-name-title">Adaptive Study</span><small>Ecosystem</small></span>}
    </Link>
  );
}
