import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Lightweight lifecycle state expectations for Phase 6A.
 * Real LiveAvatar / LiveKit network is never contacted.
 */

type Status =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'ending'
  | 'ended'
  | 'error';

function transition(current: Status, event: string): Status {
  const table: Record<string, Status> = {
    'idle:start': 'starting',
    'starting:token_ok': 'connecting',
    'connecting:sdk_ready': 'connected',
    'connected:speak': 'speaking',
    'speaking:speak_ended': 'connected',
    'connected:end': 'ending',
    'speaking:end': 'ending',
    'ending:released': 'ended',
    'connected:fail': 'error',
  };
  return table[`${current}:${event}`] ?? current;
}

describe('LiveAvatar session lifecycle (state machine)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('unexpected network call in lifecycle unit test');
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows idle → starting → connecting → connected → ending → ended', () => {
    let status: Status = 'idle';
    status = transition(status, 'start');
    expect(status).toBe('starting');
    status = transition(status, 'token_ok');
    expect(status).toBe('connecting');
    status = transition(status, 'sdk_ready');
    expect(status).toBe('connected');
    status = transition(status, 'end');
    expect(status).toBe('ending');
    status = transition(status, 'released');
    expect(status).toBe('ended');
  });

  it('allows speaking then interrupt back to connected', () => {
    let status: Status = 'connected';
    status = transition(status, 'speak');
    expect(status).toBe('speaking');
    status = transition(status, 'speak_ended');
    expect(status).toBe('connected');
  });
});
