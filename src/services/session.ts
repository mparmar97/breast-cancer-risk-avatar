import type { SessionData } from '../types';

const STORAGE_KEY = 'vare.session.v1';

export function createEmptySession(): SessionData {
  const now = new Date().toISOString();
  return {
    consentGiven: false,
    screen: 'consent',
    riskResult: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadSession(): SessionData {
  if (!hasLocalStorage()) {
    return createEmptySession();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptySession();
    }
    const parsed = JSON.parse(raw) as Partial<SessionData>;
    return {
      ...createEmptySession(),
      ...parsed,
    };
  } catch {
    return createEmptySession();
  }
}

export function saveSession(session: SessionData): void {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, etc.);
    // the app should keep working in-memory even if persistence fails.
  }
}

export function clearSession(): void {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
