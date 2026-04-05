// Session data management for drowsiness tracking
export interface SessionData {
  id: string;
  startTime: number; // timestamp
  duration: number; // seconds
  alerts: number;
  avgEAR?: number;
  avgMAR?: number;
  maxClosedFrames?: number;
  safetyScore?: number;
  notes?: string;
}

const STORAGE_KEY = 'blinkguard_sessions';

export function getSessions(): SessionData[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

// Stable-reference snapshot for useSyncExternalStore. Returns the same array
// instance until the underlying localStorage string actually changes, which
// prevents the "getSnapshot should be cached" infinite-loop error.
let _snapCachedRaw: string | null = null;
let _snapCachedValue: SessionData[] = [];
export function getSessionsSnapshot(): SessionData[] {
  if (typeof window === 'undefined') return _snapCachedValue;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== _snapCachedRaw) {
    _snapCachedRaw = raw;
    _snapCachedValue = raw ? JSON.parse(raw) : [];
  }
  return _snapCachedValue;
}
export function subscribeSessions(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export function addSession(session: Omit<SessionData, 'id' | 'startTime'>) {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const newSession: SessionData = {
    ...session,
    id: `session_${Date.now()}`,
    startTime: Date.now(),
  };
  sessions.push(newSession);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return newSession;
}

export function updateSession(
  id: string,
  updates: Partial<SessionData>
) {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }
}

export function clearSessions() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function formatSessionDate(startTime: number): string {
  const date = new Date(startTime);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
