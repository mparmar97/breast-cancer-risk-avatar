import type { ChatDiagnostics, SessionData } from '../types';

const STORAGE_KEY = 'vare.session.v1';

/**
 * Normalizes a stored `latestDiagnostics` value, filling in defaults for
 * fields introduced after the value may have been written (e.g. Phase 3
 * sessions predate `retrievalQuery`/`sources`, added in Phase 4). Returns
 * null for anything that isn't at least a recognizable diagnostics object.
 */
function normalizeDiagnostics(value: unknown): ChatDiagnostics | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ChatDiagnostics>;
  if (!candidate.adaptiveState || !candidate.strategy || !candidate.theoryConstruct) {
    return null;
  }

  return {
    adaptiveState: candidate.adaptiveState,
    strategy: candidate.strategy,
    theoryConstruct: candidate.theoryConstruct,
    retrievalQuery: typeof candidate.retrievalQuery === 'string' ? candidate.retrievalQuery : '',
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    dialogueDesignSources: Array.isArray(candidate.dialogueDesignSources) ? candidate.dialogueDesignSources : [],
    responseMode: candidate.responseMode ?? 'local-rag-fallback',
  };
}

export function createEmptySession(): SessionData {
  const now = new Date().toISOString();
  return {
    consentGiven: false,
    screen: 'consent',
    riskResult: null,
    messages: [],
    latestDiagnostics: null,
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
    const parsed = JSON.parse(raw) as Partial<SessionData> | null;
    if (!parsed || typeof parsed !== 'object') {
      return createEmptySession();
    }

    // Defensive merge: older or corrupted sessions may be missing newer
    // fields (e.g. latestDiagnostics, added in Phase 3) or have malformed
    // values for existing ones. Any field absent or invalid falls back to
    // the empty-session default rather than crashing the app.
    const base = createEmptySession();
    return {
      ...base,
      ...parsed,
      messages: Array.isArray(parsed.messages) ? parsed.messages : base.messages,
      latestDiagnostics: normalizeDiagnostics(parsed.latestDiagnostics),
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
