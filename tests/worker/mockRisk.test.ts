import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/index';

const fakeEnv: Env = {
  ASSETS: {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher,
};

async function postMockRisk(body: unknown): Promise<Response> {
  const request = new Request('https://example.com/api/mock-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return worker.fetch(request, fakeEnv, {} as ExecutionContext);
}

describe('POST /api/mock-risk', () => {
  it('returns the average-risk demonstration result', async () => {
    const response = await postMockRisk({ scenario: 'average' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      model: 'Mock Demonstration Calculator',
      fiveYearRisk: 1.1,
      riskHorizon: '5 years',
      riskBranch: 'average',
      disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
    });
  });

  it('returns the elevated-risk demonstration result', async () => {
    const response = await postMockRisk({ scenario: 'elevated' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      model: 'Mock Demonstration Calculator',
      fiveYearRisk: 3.2,
      riskHorizon: '5 years',
      riskBranch: 'elevated',
      disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
    });
  });

  it('rejects an unknown scenario with a 400', async () => {
    const response = await postMockRisk({ scenario: 'unknown' });
    expect(response.status).toBe(400);
  });

  it('rejects a missing scenario with a 400', async () => {
    const response = await postMockRisk({});
    expect(response.status).toBe(400);
  });
});
