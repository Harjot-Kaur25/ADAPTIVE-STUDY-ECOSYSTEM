import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { hasApiBaseUrl, isAuthEnabled, services } from '../services';

export default function AuthPage() {
  const { pathname } = useLocation();
  const isSignup = pathname.replace(/\/$/, '') === '/signup';
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    const nextErrors: Record<string, string> = {};

    if (isSignup && !name) nextErrors.name = 'Enter your name.';
    if (!email) nextErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter a password.';
    else if (password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    if (isSignup) {
      if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
      else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(nextErrors);
    setRecoveryMessage('');
    setActionError(false);
    if (Object.keys(nextErrors).length > 0) {
      setActionMessage('Please review the highlighted fields.');
      setActionError(true);
      return;
    }

    if (hasApiBaseUrl && !isAuthEnabled) {
      setActionMessage('Configure Supabase Auth before using the connected student backend.');
      setActionError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const session = await services.auth.signUp({ displayName: name, email, password });
        if (!session) {
          setActionMessage('Check your email to confirm your account, then sign in to continue.');
          return;
        }
        if (isAuthEnabled) {
          setActionMessage('Your account is ready. Your study profile will load when it has been set up.');
          navigate('/dashboard');
          return;
        }
        form.reset();
        setKeepSignedIn(false);
        setActionMessage('Demo sign-up complete locally. Nothing was sent or saved. You can continue to the dashboard.');
        return;
      }

      await services.auth.signIn({ email, password, rememberMe: keepSignedIn });
      setActionMessage(isAuthEnabled ? 'Signed in. Opening your study space.' : 'Opening your demo study space.');
      navigate('/dashboard');
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : 'Authentication could not be completed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFieldChange(name: string) {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setActionMessage('');
    setActionError(false);
  }

  const errorId = (name: string) => `${name}-error`;

  return (
    <main className="signin-page">
      <header className="signin-topbar"><span className="signin-topbar-label">STUDY SPACE <i>/</i> {isSignup ? 'SIGN UP' : 'SIGN IN'}</span><Link to="/" className="signin-back"><ArrowLeft size={14} /> Back to landing</Link></header>
      <div className="signin-layout">
        <section className="signin-visual" aria-label="Adaptive Study introduction">
          <div className="signin-gradient" aria-hidden="true"><span /><i /></div>
          <div className="signin-visual-brand"><Brand /></div>
          <div className="signin-visual-copy">
            <span className="signin-overline"><i /> ADAPTIVE STUDY ECOSYSTEM</span>
            <h1>Your next<br />chapter starts<br /><em>with a plan.</em></h1>
            <p>A study space that keeps pace with real life, one session at a time.</p>
          </div>
          <div className="signin-steps">
            <div className="signin-step is-current"><span><Check size={12} /></span><div><b>{isSignup ? 'Set up your study space' : 'Sign in to your space'}</b><small>{isSignup ? isAuthEnabled ? 'Create a secure account' : 'Start with a local demo profile' : 'Pick up where you left off'}</small></div><i>01</i></div>
            <div className="signin-step"><span>02</span><div><b>Open your study rhythm</b><small>See what’s next today</small></div><i>02</i></div>
            <div className="signin-step"><span>03</span><div><b>Adapt as you go</b><small>Make room for the day ahead</small></div><i>03</i></div>
          </div>
          <span className="signin-visual-foot">A PLAN THAT MOVES WITH YOU <i>✳</i></span>
        </section>
        <section className="signin-form-side">
          <div className="signin-form-wrap">
            <div className="signin-form-heading"><span className="signin-form-kicker">{isSignup ? 'MAKE ROOM FOR YOUR NEXT SESSION' : 'YOUR STUDY SPACE IS READY'}</span><h2>{isSignup ? 'Create your space' : 'Sign in'}</h2><p>{hasApiBaseUrl && !isAuthEnabled ? 'Supabase Auth must be configured to access the connected study backend.' : isAuthEnabled ? 'Use your account to continue to your adaptive plan.' : isSignup ? 'Set up a local demo profile to explore your adaptive plan.' : 'Enter your details to continue to your adaptive plan.'}</p></div>
            <form className="signin-form" onSubmit={handleSubmit} noValidate>
              {isSignup && <label className="signin-field">YOUR NAME<div className="signin-input"><UserRound size={15} /><input name="name" type="text" placeholder="Your name" autoComplete="name" required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? errorId('name') : undefined} onChange={() => handleFieldChange('name')} /></div>{fieldErrors.name && <p className="signin-recovery-message" id={errorId('name')} role="alert">{fieldErrors.name}</p>}</label>}
              <label className="signin-field">EMAIL ADDRESS<div className="signin-input"><Mail size={15} /><input name="email" type="email" placeholder="you@somewhere.com" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? errorId('email') : undefined} onChange={() => handleFieldChange('email')} /></div>{fieldErrors.email && <p className="signin-recovery-message" id={errorId('email')} role="alert">{fieldErrors.email}</p>}</label>
              <label className="signin-field">PASSWORD<div className="signin-input"><LockKeyhole size={15} /><input name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={8} required aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? errorId('password') : undefined} onChange={() => handleFieldChange('password')} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>{fieldErrors.password && <p className="signin-recovery-message" id={errorId('password')} role="alert">{fieldErrors.password}</p>}</label>
              {isSignup && <label className="signin-field">CONFIRM PASSWORD<div className="signin-input"><LockKeyhole size={15} /><input name="confirmPassword" type={showPassword ? 'text' : 'password'} placeholder="Re-enter your password" autoComplete="new-password" required aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? errorId('confirmPassword') : undefined} onChange={() => handleFieldChange('confirmPassword')} /></div>{fieldErrors.confirmPassword && <p className="signin-recovery-message" id={errorId('confirmPassword')} role="alert">{fieldErrors.confirmPassword}</p>}</label>}
              {!isSignup && <div className="signin-form-meta"><label><input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} /> Keep me signed in</label><button type="button" onClick={() => { const email = document.querySelector<HTMLInputElement>('.signin-form input[name="email"]')?.value.trim() ?? ''; if (!email) { setRecoveryMessage('Enter your email address first.'); return; } void services.auth.requestPasswordReset(email).then(() => setRecoveryMessage(isAuthEnabled ? 'Password reset instructions were sent if that account exists.' : 'Password recovery is not connected in this frontend demo.')).catch((error: unknown) => setRecoveryMessage(error instanceof Error ? error.message : 'Password reset could not be requested.')); }}>Forgot password?</button></div>}
              {recoveryMessage && <p className="signin-recovery-message" role="status">{recoveryMessage}</p>}
              {actionMessage && <p className="signin-recovery-message" role={actionError || Object.keys(fieldErrors).length > 0 ? 'alert' : 'status'} aria-live="polite">{actionMessage}</p>}
              <button className="signin-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : isSignup ? isAuthEnabled ? 'Create your account' : 'Create local demo space' : 'Continue to your study space'} <ArrowRight size={15} /></button>
            </form>
            <div className="signin-demo-note"><i /> {isAuthEnabled ? 'SUPABASE AUTH' : 'DEMO MODE'} <span>·</span> {isAuthEnabled ? 'USER-SCOPED STUDY DATA' : 'NO CREDENTIALS ARE SENT OR SAVED'}</div>
            <div className="signin-bottom-links"><span>{isSignup ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">{isAuthEnabled ? 'Create an account' : 'Create a local demo space'}</Link></>}</span><span>Just looking around? <Link to="/dashboard">Explore the demo</Link></span></div>
            {isSignup && actionMessage && Object.keys(fieldErrors).length === 0 && <Link className="signin-submit" to="/dashboard">Continue to the dashboard <ArrowRight size={15} /></Link>}
          </div>
          <Link className="signin-mobile-home" to="/"><ArrowLeft size={13} /> Return to landing page</Link>
        </section>
      </div>
      <footer className="signin-footer"><Brand compact /><span>© 2025 Adaptive Study Ecosystem</span><Link to="/dashboard">Explore demo <ArrowRight size={12} /></Link></footer>
    </main>
  );
}
