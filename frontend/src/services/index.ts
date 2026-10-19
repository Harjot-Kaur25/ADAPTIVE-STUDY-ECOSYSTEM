export type {
  AuthSession,
  AuthenticationService,
  AuthUser,
  BurnoutService,
  Deadline,
  DeadlineService,
  FrontendServices,
  PriorityService,
  ProgressRange,
  ProgressService,
  ProgressSummary,
  ScheduleService,
  SignInInput,
  SignUpInput,
  StudentProfile,
  StudentProfileCreate,
  StudentProfileService,
  StudentProfileUpdate,
  StudyPriority,
  StudySession,
  StudySessionService,
} from './contracts';
import { mockServices } from './mockServices';
import { backendServices, hasApiBaseUrl } from './backendServices';
import { hasSupabaseAuthConfig } from './supabase';

export { mockServices };
export { isProfileMissingError } from './backendServices';

/** Keep the local demo implementation available when the API URL is not configured. */
export const services = hasApiBaseUrl
  ? { ...backendServices, auth: hasSupabaseAuthConfig ? backendServices.auth : mockServices.auth }
  : { ...mockServices, auth: hasSupabaseAuthConfig ? backendServices.auth : mockServices.auth };

export const isBackendEnabled = hasApiBaseUrl && hasSupabaseAuthConfig;
export const isAuthEnabled = hasSupabaseAuthConfig;
export { hasApiBaseUrl };
