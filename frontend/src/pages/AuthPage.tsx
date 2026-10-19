import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Plus, Trash2, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { isAuthEnabled, isBackendEnabled, isProfileMissingError, services, type StudentProfileCreate } from '../services';
import './AuthPage.css';

type SubjectDraft = { name: string; previousMarks: string; examCount: string };
type PendingProfileDraft = { email: string; profile: StudentProfileCreate };

const pendingProfileKey = 'adaptive-study-pending-profile';
const emptySubjectDraft = (): SubjectDraft => ({ name: '', previousMarks: '', examCount: '' });

function storePendingProfile(email: string, profile: StudentProfileCreate) {
  try {
    window.localStorage.setItem(pendingProfileKey, JSON.stringify({ email: email.toLowerCase(), profile }));
  } catch {
    throw new Error('Your study profile could not be saved temporarily in this browser. Check browser storage and try again.');
  }
}

function readPendingProfile(): PendingProfileDraft | null {
  const stored = window.localStorage.getItem(pendingProfileKey);
  if (!stored) return null;
  try {
    const draft = JSON.parse(stored) as PendingProfileDraft;
    if (typeof draft.email !== 'string' || typeof draft.profile?.fullName !== 'string' || !Array.isArray(draft.profile.subjects)) {
      throw new Error('The saved subject setup is incomplete.');
    }
    return draft;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'The saved subject setup could not be read.');
  }
}

function clearPendingProfile() {
  try {
    window.localStorage.removeItem(pendingProfileKey);
  } catch {
    throw new Error('The profile was saved, but its temporary browser draft could not be cleared.');
  }
}

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
  const [subjectDrafts, setSubjectDrafts] = useState<SubjectDraft[]>([emptySubjectDraft()]);
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
    let profileInput: StudentProfileCreate | null = null;

    if (isSignup && !name) nextErrors.name = 'Enter your name.';
    if (!email) nextErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter a password.';
    else if (password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    if (isSignup) {
      if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
      else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
      if (subjectDrafts.length === 0) nextErrors.subjects = 'Add at least one subject.';
      if (subjectDrafts.length > 50) nextErrors.subjects = 'Add no more than 50 subjects.';
      const seenNames = new Set<string>();
      const subjects = subjectDrafts.map((subject, index) => {
        const subjectName = subject.name.trim();
        const marks = Number(subject.previousMarks);
        const examCount = Number(subject.examCount);
        const prefix = `subject-${index}`;
        if (!subjectName) nextErrors[`${prefix}-name`] = 'Enter a subject name.';
        else if (subjectName.length > 120) nextErrors[`${prefix}-name`] = 'Use 120 characters or fewer.';
        else if (seenNames.has(subjectName.toLowerCase())) nextErrors[`${prefix}-name`] = 'Subject names must be unique.';
        seenNames.add(subjectName.toLowerCase());
        if (subject.previousMarks.trim() === '' || !Number.isFinite(marks) || marks < 0 || marks > 100) {
          nextErrors[`${prefix}-marks`] = 'Enter marks from 0 to 100.';
        }
        if (subject.examCount.trim() === '' || !Number.isInteger(examCount) || examCount < 1 || examCount > 10) {
          nextErrors[`${prefix}-exams`] = 'Enter 1 to 10 completed exams.';
        }
        return { name: subjectName, previousMarks: marks, examCount };
      });
      if (Object.keys(nextErrors).every((key) => !key.startsWith('subject-') && key !== 'subjects')) {
        profileInput = { fullName: name, subjects };
      }
    }

    setFieldErrors(nextErrors);
    setRecoveryMessage('');
    setActionError(false);
    if (Object.keys(nextErrors).length > 0) {
      setActionMessage('Please review the highlighted fields.');
      setActionError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const session = await services.auth.signUp({ displayName: name, email, password });
        if (!session) {
          if (!profileInput) return;
          storePendingProfile(email, profileInput);
          setActionMessage('Check your email to confirm your account. Then sign in to save your study profile.');
          return;
        }
        if (!profileInput) return;
        storePendingProfile(email, profileInput);
        await services.student.createProfile(profileInput);
        clearPendingProfile();
        if (isAuthEnabled) {
          setActionMessage(isBackendEnabled
            ? 'Your account and study profile are ready.'
            : 'Your account is ready. Study profile details are stored locally because the study API is not connected.');
          navigate('/dashboard');
          return;
        }
        form.reset();
        setKeepSignedIn(false);
        setSubjectDrafts([emptySubjectDraft()]);
        setActionMessage('Demo sign-up complete. Your subjects are saved in this browser. Continue to the dashboard.');
        return;
      }

      await services.auth.signIn({ email, password, rememberMe: keepSignedIn });
      const pendingProfile = readPendingProfile();
      if (pendingProfile?.email === email.toLowerCase()) {
        if (isBackendEnabled) {
          try {
            await services.student.getProfile();
            clearPendingProfile();
            setActionMessage('Your saved study profile is already up to date. Opening your study space.');
            navigate('/dashboard');
            return;
          } catch (error) {
            if (!isProfileMissingError(error)) throw error;
          }
        }
        await services.student.createProfile(pendingProfile.profile);
        clearPendingProfile();
        setActionMessage(isBackendEnabled
          ? 'Your study profile has been saved. Opening your study space.'
          : 'Your study profile is saved in this browser. Opening your demo study space.');
        navigate('/dashboard');
        return;
      }
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
            <div className="signin-form-heading"><span className="signin-form-kicker">{isSignup ? 'MAKE ROOM FOR YOUR NEXT SESSION' : 'YOUR STUDY SPACE IS READY'}</span><h2>{isSignup ? 'Create your space' : 'Sign in'}</h2><p>{isAuthEnabled ? 'Use your account to continue to your adaptive plan.' : isSignup ? 'Set up a local demo profile to explore your adaptive plan.' : 'Enter your details to continue to your adaptive plan.'}</p></div>
            <form className="signin-form" onSubmit={handleSubmit} noValidate>
              {isSignup && <label className="signin-field">YOUR NAME<div className="signin-input"><UserRound size={15} /><input name="name" type="text" placeholder="Your name" autoComplete="name" required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? errorId('name') : undefined} onChange={() => handleFieldChange('name')} /></div>{fieldErrors.name && <p className="signin-recovery-message" id={errorId('name')} role="alert">{fieldErrors.name}</p>}</label>}
              <label className="signin-field">EMAIL ADDRESS<div className="signin-input"><Mail size={15} /><input name="email" type="email" placeholder="you@somewhere.com" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? errorId('email') : undefined} onChange={() => handleFieldChange('email')} /></div>{fieldErrors.email && <p className="signin-recovery-message" id={errorId('email')} role="alert">{fieldErrors.email}</p>}</label>
              <label className="signin-field">PASSWORD<div className="signin-input"><LockKeyhole size={15} /><input name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={8} required aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? errorId('password') : undefined} onChange={() => handleFieldChange('password')} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>{fieldErrors.password && <p className="signin-recovery-message" id={errorId('password')} role="alert">{fieldErrors.password}</p>}</label>
              {isSignup && <label className="signin-field">CONFIRM PASSWORD<div className="signin-input"><LockKeyhole size={15} /><input name="confirmPassword" type={showPassword ? 'text' : 'password'} placeholder="Re-enter your password" autoComplete="new-password" required aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? errorId('confirmPassword') : undefined} onChange={() => handleFieldChange('confirmPassword')} /></div>{fieldErrors.confirmPassword && <p className="signin-recovery-message" id={errorId('confirmPassword')} role="alert">{fieldErrors.confirmPassword}</p>}</label>}
              {isSignup && <section className="signin-subjects" aria-labelledby="signup-subjects-heading">
                <div><h3 id="signup-subjects-heading">Your subjects</h3><p>Add your current courses and their latest marks. This information is saved with your study profile.</p></div>
                {subjectDrafts.map((subject, index) => {
                  const prefix = `subject-${index}`;
                  return <fieldset className="signin-subject-entry" key={index}>
                    <legend>Subject {index + 1}</legend>
                    <label className="signin-field">SUBJECT NAME<div className="signin-input"><input value={subject.name} maxLength={120} placeholder="e.g. Mathematics" aria-label={`Subject ${index + 1} name`} aria-invalid={Boolean(fieldErrors[`${prefix}-name`])} onChange={(event) => setSubjectDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></div>{fieldErrors[`${prefix}-name`] && <p className="signin-recovery-message" role="alert">{fieldErrors[`${prefix}-name`]}</p>}</label>
                    <div className="signin-subject-metrics">
                      <label className="signin-field">PREVIOUS MARKS<div className="signin-input"><input type="number" min="0" max="100" step="0.1" value={subject.previousMarks} placeholder="0–100" aria-label={`Subject ${index + 1} previous marks`} aria-invalid={Boolean(fieldErrors[`${prefix}-marks`])} onChange={(event) => setSubjectDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, previousMarks: event.target.value } : item))} /></div>{fieldErrors[`${prefix}-marks`] && <p className="signin-recovery-message" role="alert">{fieldErrors[`${prefix}-marks`]}</p>}</label>
                      <label className="signin-field">COMPLETED EXAMS<div className="signin-input"><input type="number" min="1" max="10" step="1" value={subject.examCount} placeholder="1–10" aria-label={`Subject ${index + 1} completed exams`} aria-invalid={Boolean(fieldErrors[`${prefix}-exams`])} onChange={(event) => setSubjectDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, examCount: event.target.value } : item))} /></div>{fieldErrors[`${prefix}-exams`] && <p className="signin-recovery-message" role="alert">{fieldErrors[`${prefix}-exams`]}</p>}</label>
                    </div>
                    {subjectDrafts.length > 1 && <button className="signin-subject-remove" type="button" onClick={() => setSubjectDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /> Remove subject</button>}
                  </fieldset>;
                })}
                {fieldErrors.subjects && <p className="signin-recovery-message" role="alert">{fieldErrors.subjects}</p>}
                <button className="signin-subject-add" type="button" disabled={subjectDrafts.length >= 50} onClick={() => setSubjectDrafts((current) => [...current, emptySubjectDraft()])}><Plus size={14} /> Add another subject</button>
              </section>}
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
