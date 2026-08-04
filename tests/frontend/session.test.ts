import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, createEmptySession, loadSession, saveSession } from '../../src/services/session';
import type { SessionData } from '../../src/types';

describe('session storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty session when nothing is stored', () => {
    const session = loadSession();
    expect(session.consentGiven).toBe(false);
    expect(session.screen).toBe('consent');
    expect(session.riskResult).toBeNull();
    expect(session.messages).toEqual([]);
  });

  it('persists and reloads a session, simulating a browser refresh', () => {
    const session: SessionData = {
      ...createEmptySession(),
      consentGiven: true,
      screen: 'chat',
      riskResult: {
        model: 'Mock Demonstration Calculator',
        fiveYearRisk: 3.2,
        riskHorizon: '5 years',
        riskBranch: 'elevated',
        disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
      },
      messages: [
        { id: '1', role: 'user', content: 'Hi', timestamp: new Date().toISOString() },
      ],
    };

    saveSession(session);
    const reloaded = loadSession();

    expect(reloaded.consentGiven).toBe(true);
    expect(reloaded.screen).toBe('chat');
    expect(reloaded.riskResult?.riskBranch).toBe('elevated');
    expect(reloaded.messages).toHaveLength(1);
  });

  it('clears stored session data back to defaults', () => {
    saveSession({ ...createEmptySession(), consentGiven: true, screen: 'calculator' });
    clearSession();

    const session = loadSession();
    expect(session.consentGiven).toBe(false);
    expect(session.screen).toBe('consent');
    expect(window.localStorage.getItem('vare.session.v1')).toBeNull();
  });
});
