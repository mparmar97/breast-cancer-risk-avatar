import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/index';

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

const fakeEnv: Env = {
  ASSETS: {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher,
};

describe('GET /api/health', () => {
  it('returns status ok with a timestamp and version', async () => {
    const request = new Request('https://example.com/api/health');
    const response = await worker.fetch(request, fakeEnv, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const body = (await response.json()) as HealthResponse;
    expect(body).toMatchObject({ status: 'ok', version: '0.1.0' });
    expect(typeof body.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const request = new Request('https://example.com/api/unknown');
    const response = await worker.fetch(request, fakeEnv, {} as ExecutionContext);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: 'Not found' });
  });
});
