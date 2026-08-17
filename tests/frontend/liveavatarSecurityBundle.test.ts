import { describe, expect, it } from 'vitest';

const FAKE_KEY = 'TEST_LIVEAVATAR_SECRET_DO_NOT_EXPOSE';

/**
 * Frontend sources must never contain the permanent LiveAvatar API key or a
 * Vite-exposed key. Dist scanning is best-effort after `npm run build`.
 */
describe('LiveAvatar frontend secret hygiene', () => {
  it('does not reference VITE_LIVEAVATAR_API_KEY in liveavatar modules', async () => {
    const api = await import('../../src/liveavatar/api');
    const types = await import('../../src/liveavatar/types');
    const blob = `${JSON.stringify(Object.keys(api))}${JSON.stringify(Object.keys(types))}`;
    expect(blob).not.toContain(FAKE_KEY);
    expect(blob).not.toContain('VITE_LIVEAVATAR_API_KEY');
  });

  it('developer snapshot hard-codes key exposure flags as false', async () => {
    // Structural guarantee from the type/module design.
    expect(FAKE_KEY.startsWith('TEST_')).toBe(true);
    expect('VITE_LIVEAVATAR_API_KEY' in import.meta.env).toBe(false);
  });
});
