import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Bell, Check, Eye, LockKeyhole, Save, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WorkspaceShell, { type DashboardSection } from '../components/WorkspaceShell';
import { hasApiBaseUrl, services } from '../services';
import type { StudentProfile } from '../services/contracts';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof days[number];
type Preferences = { deadlines: boolean; planChanges: boolean; weeklySummary: boolean; streaks: boolean; studyTips: boolean };
type Settings = {
  fullName: string;
  email: string;
  displayName: string;
  timezone: string;
  school: string;
  program: string;
  currentYear: string;
  term: string;
  studyBlock: string;
  preferredSession: '1h' | '2h' | '2-3h';
  breakLength: string;
  dailyGoal: string;
  focusTime: string;
  selectedDays: Day[];
  startTime: string;
  endTime: string;
  preferences: Preferences;
  reducedMotion: boolean;
  highContrast: boolean;
  compactDensity: boolean;
  deepTheme: boolean;
};
type Feedback = { kind: 'success' | 'error'; message: string } | null;

const SETTINGS_STORAGE_KEY = 'adaptivestudy.settings.v1';

function createDefaultSettings(): Settings {
  return {
    fullName: 'Alex Morgan',
    email: 'alex.morgan@example.edu',
    displayName: 'Alex',
    timezone: 'America/New_York',
    school: 'Northbridge University',
    program: 'Computer Science',
    currentYear: 'second',
    term: 'fall',
    studyBlock: '45',
    preferredSession: '1h',
    breakLength: '10',
    dailyGoal: '2',
    focusTime: 'morning',
    selectedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    startTime: '09',
    endTime: '18',
    preferences: { deadlines: true, planChanges: true, weeklySummary: false, streaks: false, studyTips: true },
    reducedMotion: false,
    highContrast: false,
    compactDensity: false,
    deepTheme: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string, allowed?: readonly string[]) {
  return typeof value === 'string' && (!allowed || allowed.includes(value)) ? value : fallback;
}

function loadSettings(): Settings {
  const defaults = createDefaultSettings();
  try {
    if (typeof window === 'undefined') return defaults;
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<Settings>;
    if (!isRecord(parsed)) return defaults;
    const storedPreferences: Record<string, unknown> = isRecord(parsed.preferences) ? parsed.preferences as Record<string, unknown> : {};
    const selectedDays = Array.isArray(parsed.selectedDays)
      ? parsed.selectedDays.filter((day): day is Day => typeof day === 'string' && (days as readonly string[]).includes(day))
      : defaults.selectedDays;
    const preferredSession = stringOrDefault(parsed.preferredSession, defaults.preferredSession, ['1h', '2h', '2-3h']);
    return {
      ...defaults,
      fullName: stringOrDefault(parsed.fullName, defaults.fullName),
      email: stringOrDefault(parsed.email, defaults.email),
      displayName: stringOrDefault(parsed.displayName, defaults.displayName),
      timezone: stringOrDefault(parsed.timezone, defaults.timezone, ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London']),
      school: stringOrDefault(parsed.school, defaults.school),
      program: stringOrDefault(parsed.program, defaults.program),
      currentYear: stringOrDefault(parsed.currentYear, defaults.currentYear, ['first', 'second', 'third', 'fourth', 'other']),
      term: stringOrDefault(parsed.term, defaults.term, ['fall', 'spring', 'summer']),
      studyBlock: stringOrDefault(parsed.studyBlock, defaults.studyBlock, ['25', '45', '60', '90']),
      preferredSession: preferredSession === '2h' || preferredSession === '2-3h' ? preferredSession : '1h',
      breakLength: stringOrDefault(parsed.breakLength, defaults.breakLength, ['5', '10', '15', '20']),
      dailyGoal: stringOrDefault(parsed.dailyGoal, defaults.dailyGoal, ['1', '2', '3', '4']),
      focusTime: stringOrDefault(parsed.focusTime, defaults.focusTime, ['morning', 'afternoon', 'evening', 'flexible']),
      selectedDays,
      startTime: stringOrDefault(parsed.startTime, defaults.startTime, ['07', '08', '09', '10', '12']),
      endTime: stringOrDefault(parsed.endTime, defaults.endTime, ['15', '16', '17', '18', '20']),
      preferences: {
        deadlines: booleanOrDefault(storedPreferences.deadlines, defaults.preferences.deadlines),
        planChanges: booleanOrDefault(storedPreferences.planChanges, defaults.preferences.planChanges),
        weeklySummary: booleanOrDefault(storedPreferences.weeklySummary, defaults.preferences.weeklySummary),
        streaks: booleanOrDefault(storedPreferences.streaks, defaults.preferences.streaks),
        studyTips: booleanOrDefault(storedPreferences.studyTips, defaults.preferences.studyTips),
      },
      reducedMotion: booleanOrDefault(parsed.reducedMotion, defaults.reducedMotion),
      highContrast: booleanOrDefault(parsed.highContrast, defaults.highContrast),
      compactDensity: booleanOrDefault(parsed.compactDensity, defaults.compactDensity),
      deepTheme: booleanOrDefault(parsed.deepTheme, defaults.deepTheme),
    };
  } catch {
    return defaults;
  }
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: () => void }) {
  return <div className="setting-toggle-row"><span><b>{label}</b><small>{detail}</small></span><button type="button" role="switch" aria-label={label} aria-checked={checked} className={`toggle-switch ${checked ? 'is-on' : ''}`} onClick={onChange}><i /></button></div>;
}
function SettingSection({ id, number, title, description, icon: Icon, children }: { id: string; number: string; title: string; description: string; icon: typeof UserRound; children: ReactNode }) {
  return <section className="workspace-panel settings-section" id={id}><div className="settings-section-heading"><span className="settings-section-icon"><Icon size={16} /></span><div><span className="panel-eyebrow">SECTION {number}</span><h2>{title}</h2><p>{description}</p></div></div><div className="settings-section-body">{children}</div></section>;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [profileLoading, setProfileLoading] = useState(hasApiBaseUrl);
  const [profileError, setProfileError] = useState('');
  const [connectedProfile, setConnectedProfile] = useState(false);
  const [availabilityDirty, setAvailabilityDirty] = useState(false);
  const onSectionChange = (section: DashboardSection) => navigate(`/dashboard?section=${section.toLowerCase()}`);

  useEffect(() => {
    if (!hasApiBaseUrl) return;
    let mounted = true;
    void services.student.getProfile()
      .then((profile) => {
        if (!mounted) return;
        setSettings((current) => ({
          ...current,
          fullName: profile.fullName,
          email: profile.email || current.email,
          displayName: profile.displayName,
          selectedDays: profile.preferences.availableDays.length
            ? profile.preferences.availableDays.filter((day): day is Day => (days as readonly string[]).includes(day))
            : current.selectedDays,
          startTime: ['07', '08', '09', '10', '12'].includes(String(profile.preferences.availabilityStartHour).padStart(2, '0'))
            ? String(profile.preferences.availabilityStartHour).padStart(2, '0')
            : current.startTime,
          endTime: ['15', '16', '17', '18', '20'].includes(String(profile.preferences.availabilityEndHour).padStart(2, '0'))
            ? String(profile.preferences.availabilityEndHour).padStart(2, '0')
            : current.endTime,
          studyBlock: String(profile.preferences.studyBlockMinutes <= 60 ? 60 : 90),
          preferredSession: profile.preferences.preferredSession ?? '1h',
          breakLength: ['5', '10', '15', '20'].includes(String(profile.preferences.breakLengthMinutes))
            ? String(profile.preferences.breakLengthMinutes)
            : current.breakLength,
        }));
        setConnectedProfile(true);
        setProfileError('');
      })
      .catch((error: unknown) => {
        if (mounted) setProfileError(error instanceof Error ? error.message : 'Your profile could not be loaded.');
      })
      .finally(() => { if (mounted) setProfileLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = settings.reducedMotion ? 'true' : 'false';
    document.documentElement.dataset.highContrast = settings.highContrast ? 'true' : 'false';
    document.documentElement.dataset.compactDensity = settings.compactDensity ? 'true' : 'false';
    document.documentElement.dataset.deepTheme = settings.deepTheme ? 'true' : 'false';
    return () => { delete document.documentElement.dataset.reduceMotion; delete document.documentElement.dataset.highContrast; delete document.documentElement.dataset.compactDensity; delete document.documentElement.dataset.deepTheme; };
  }, [settings.reducedMotion, settings.highContrast, settings.compactDensity, settings.deepTheme]);

  function updateSettings(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setFeedback(null);
  }

  function updateAvailability(patch: Partial<Settings>) {
    updateSettings(patch);
    setAvailabilityDirty(true);
  }

  function togglePreference(key: keyof Preferences) {
    setSettings((current) => ({ ...current, preferences: { ...current.preferences, [key]: !current.preferences[key] } }));
    setFeedback(null);
  }

  function validationError() {
    if (settings.selectedDays.length === 0) return 'Choose at least one availability day.';
    if (Number(settings.startTime) >= Number(settings.endTime)) return 'Choose an availability start time before the end time.';
    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowValidation(true);
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      setFeedback({ kind: 'error', message: 'Please correct the highlighted profile fields before saving.' });
      return;
    }
    const error = validationError();
    if (error) {
      setFeedback({ kind: 'error', message: error });
      return;
    }
    let syncError = '';
    if (hasApiBaseUrl) {
      try {
        await services.student.updateProfile({ fullName: settings.fullName, displayName: settings.displayName });
        if (availabilityDirty) await services.student.saveAvailability({ preferences: {
          studyBlockMinutes: Number(settings.studyBlock),
          preferredSession: settings.preferredSession,
          breakLengthMinutes: Number(settings.breakLength),
          dailyGoalHours: Number(settings.dailyGoal),
          focusTime: settings.focusTime as StudentProfile['preferences']['focusTime'],
          availableDays: settings.selectedDays,
          availabilityStartHour: Number(settings.startTime),
          availabilityEndHour: Number(settings.endTime),
        } });
        setConnectedProfile(true);
        setProfileError('');
        setAvailabilityDirty(false);
      } catch (error) {
        syncError = error instanceof Error ? error.message : 'The profile could not be synchronized.';
      }
    }
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Settings could not be saved in this browser.' });
      return;
    }
    if (syncError) {
      setFeedback({ kind: 'error', message: `Settings saved locally, but account sync failed: ${syncError}` });
      return;
    }
    setFeedback({ kind: 'success', message: hasApiBaseUrl ? 'Name and supported availability saved. Other settings remain local to this browser.' : 'Settings saved locally in this browser.' });
  }

  function resetSettings() {
    setSettings(createDefaultSettings());
    setShowValidation(false);
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
      setFeedback({ kind: 'success', message: hasApiBaseUrl ? 'Browser settings were reset. Your account profile and availability were not changed.' : 'All settings were reset to their defaults.' });
    } catch {
      setFeedback({ kind: 'error', message: 'Settings were reset for this view, but stored preferences could not be removed.' });
    }
  }

  const availabilityError = showValidation && settings.selectedDays.length === 0 ? 'Choose at least one availability day.' : null;
  const timeError = showValidation && Number(settings.startTime) >= Number(settings.endTime) ? 'Start time must be before end time.' : null;

  return <WorkspaceShell active="Settings" onSectionChange={onSectionChange} eyebrow="YOUR STUDY SPACE / SETTINGS" title="Settings." profileName={settings.fullName} profileDetail={connectedProfile ? 'Connected study profile' : 'Computer Science · Year 2'}>
    <div className="settings-intro"><p>Make this space feel like yours. {hasApiBaseUrl ? 'Profile and availability sync with your study account.' : 'Your choices stay in this demo.'}</p><span className="settings-demo-label"><i /> {profileLoading ? 'LOADING PROFILE' : connectedProfile ? 'CONNECTED PROFILE' : hasApiBaseUrl ? 'DEMO DATA · PROFILE UNAVAILABLE' : 'LOCAL DEMO CONTROLS'}</span></div>
    {profileError && <p className="demo-footnote" role="alert">Showing local settings because the profile could not be loaded: {profileError}</p>}
    <form className="settings-form" onSubmit={save}>
      <SettingSection id="profile" number="01" title="Profile details" description="The basics for your study space." icon={UserRound}>
        <div className="settings-field-grid"><label className="setting-field">FULL NAME<input type="text" value={settings.fullName} onChange={(event) => updateSettings({ fullName: event.target.value })} required /></label><label className="setting-field">EMAIL ADDRESS<input type="email" value={settings.email} onChange={(event) => updateSettings({ email: event.target.value })} required /></label><label className="setting-field">DISPLAY NAME<input type="text" value={settings.displayName} onChange={(event) => updateSettings({ displayName: event.target.value })} /></label><label className="setting-field">TIME ZONE<select value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })}><option value="America/New_York">Eastern Time (ET)</option><option value="America/Chicago">Central Time (CT)</option><option value="America/Denver">Mountain Time (MT)</option><option value="America/Los_Angeles">Pacific Time (PT)</option><option value="Europe/London">London (GMT)</option></select></label></div>
      </SettingSection>
      <SettingSection id="education" number="02" title="Academic details" description="Give your study plan enough context to stay useful." icon={Eye}>
        <div className="settings-field-grid"><label className="setting-field">SCHOOL<input type="text" value={settings.school} onChange={(event) => updateSettings({ school: event.target.value })} /></label><label className="setting-field">PROGRAM OR MAJOR<input type="text" value={settings.program} onChange={(event) => updateSettings({ program: event.target.value })} /></label><label className="setting-field">CURRENT YEAR<select value={settings.currentYear} onChange={(event) => updateSettings({ currentYear: event.target.value })}><option value="first">First year</option><option value="second">Second year</option><option value="third">Third year</option><option value="fourth">Fourth year</option><option value="other">Other</option></select></label><label className="setting-field">TERM<select value={settings.term} onChange={(event) => updateSettings({ term: event.target.value })}><option value="fall">Fall semester</option><option value="spring">Spring semester</option><option value="summer">Summer term</option></select></label></div>
      </SettingSection>
      <SettingSection id="study-preferences" number="03" title="Study preferences" description="Shape study sessions around how you like to work." icon={LockKeyhole}>
        <div className="settings-field-grid"><label className="setting-field">PREFERRED STUDY BLOCK<select value={settings.studyBlock} onChange={(event) => updateAvailability({ studyBlock: event.target.value, preferredSession: Number(event.target.value) <= 60 ? '1h' : '2h' })}><option value="25">25 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label><label className="setting-field">BREAK LENGTH<select value={settings.breakLength} onChange={(event) => updateAvailability({ breakLength: event.target.value })}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option></select></label><label className="setting-field">DAILY STUDY GOAL<select value={settings.dailyGoal} onChange={(event) => updateSettings({ dailyGoal: event.target.value })}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option></select></label><label className="setting-field">BEST FOCUS TIME<select value={settings.focusTime} onChange={(event) => updateSettings({ focusTime: event.target.value })}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="flexible">It changes day to day</option></select></label></div>
        <div className="availability-heading"><span>WEEKLY AVAILABILITY</span><small>Choose the days you usually have time to study.</small></div><div className="availability-days" role="group" aria-label="Weekly availability days" aria-describedby={availabilityError ? 'availability-error' : undefined}>{days.map((day) => <button type="button" key={day} className={`availability-day ${settings.selectedDays.includes(day) ? 'is-selected' : ''}`} aria-pressed={settings.selectedDays.includes(day)} onClick={() => { const selected = settings.selectedDays.includes(day); updateSettings({ selectedDays: selected ? settings.selectedDays.filter((item) => item !== day) : [...settings.selectedDays, day] }); setAvailabilityDirty(true); }}>{settings.selectedDays.includes(day) && <Check size={11} />}{day}</button>)}</div>{availabilityError && <small id="availability-error" role="alert">{availabilityError}</small>}
        <div className="settings-field-grid availability-times"><label className="setting-field">USUAL START TIME<select value={settings.startTime} onChange={(event) => updateAvailability({ startTime: event.target.value })}><option value="07">7:00 AM</option><option value="08">8:00 AM</option><option value="09">9:00 AM</option><option value="10">10:00 AM</option><option value="12">12:00 PM</option></select></label><label className="setting-field">USUAL END TIME<select value={settings.endTime} onChange={(event) => updateAvailability({ endTime: event.target.value })}><option value="15">3:00 PM</option><option value="16">4:00 PM</option><option value="17">5:00 PM</option><option value="18">6:00 PM</option><option value="20">8:00 PM</option></select></label></div>{timeError && <small role="alert">{timeError}</small>}
      </SettingSection>
      <SettingSection id="notifications" number="04" title="Notifications" description="Choose which nudges help—and which ones can wait." icon={Bell}>
        <Toggle label="Deadline reminders" detail="A heads-up before an assignment is due." checked={settings.preferences.deadlines} onChange={() => togglePreference('deadlines')} /><Toggle label="Adaptive plan changes" detail="Let me know when the day's schedule shifts." checked={settings.preferences.planChanges} onChange={() => togglePreference('planChanges')} /><Toggle label="Weekly study summary" detail="A brief look back at your time and progress." checked={settings.preferences.weeklySummary} onChange={() => togglePreference('weeklySummary')} /><Toggle label="Study streak reminders" detail="A gentle prompt when your study rhythm pauses." checked={settings.preferences.streaks} onChange={() => togglePreference('streaks')} /><Toggle label="Learning tips" detail="Occasional ideas for building a better routine." checked={settings.preferences.studyTips} onChange={() => togglePreference('studyTips')} />
      </SettingSection>
      <SettingSection id="appearance" number="05" title="Appearance & accessibility" description="Keep the interface comfortable and easy to use." icon={Eye}>
        <div className="settings-field-grid"><label className="setting-field">COLOR THEME<select value={settings.deepTheme ? 'deep' : 'midnight'} onChange={(event) => updateSettings({ deepTheme: event.target.value === 'deep' })}><option value="midnight">Midnight blue</option><option value="deep">Deep midnight</option></select></label><label className="setting-field">DASHBOARD DENSITY<select value={settings.compactDensity ? 'compact' : 'comfortable'} onChange={(event) => updateSettings({ compactDensity: event.target.value === 'compact' })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></div><Toggle label="Reduce motion" detail="Turn off continuous motion effects in this demo." checked={settings.reducedMotion} onChange={() => updateSettings({ reducedMotion: !settings.reducedMotion })} /><Toggle label="High-contrast borders" detail="Make interface boundaries easier to distinguish." checked={settings.highContrast} onChange={() => updateSettings({ highContrast: !settings.highContrast })} />
      </SettingSection>
      <SettingSection id="privacy" number="06" title="Privacy & data" description="This prototype does not connect to a service; settings remain in this browser." icon={LockKeyhole}>
        <div className="privacy-notice"><LockKeyhole size={15} /><div><b>Your data stays in this browser.</b><p>Profile details, preferences, study blocks, and progress are stored only in this browser when you save. Nothing is sent to a server.</p></div></div><button type="button" className="privacy-action" onClick={resetSettings}>Reset demo preferences</button>
      </SettingSection>
      <div className="settings-save-bar"><span id="settings-feedback" role={feedback?.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback ? <>{feedback.kind === 'success' && <Check size={14} />} {feedback.message}</> : hasApiBaseUrl ? 'Profile data loads from your study account.' : 'Your settings are stored locally in this browser.'}</span><button type="submit" className="save-settings"><Save size={14} /> Save changes</button></div>
    </form>
  </WorkspaceShell>;
}
