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
    const body = (await response.json()) as { riskBranch: string; fiveYearRisk: number };
    expect(body.riskBranch).toBe('average');
    expect(body.fiveYearRisk).toBe(1.1);
  });

  it('returns the elevated-risk demonstration result', async () => {
    const response = await postMockRisk({ scenario: 'elevated' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { riskBranch: string; fiveYearRisk: number };
    expect(body.riskBranch).toBe('elevated');
    expect(body.fiveYearRisk).toBe(3.2);
  });

  it('computes a result from calculator inputs', async () => {
    const response = await postMockRisk({
      inputs: {
        age: 55,
        ageAtMenarche: '<12',
        ageAtFirstLiveBirth: 'never',
        firstDegreeRelatives: 2,
        priorBiopsies: 1,
        atypicalHyperplasia: 'yes',
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      riskBranch: string;
      calculatorInputs: { age: number };
      disclaimer: string;
    };
    expect(body.riskBranch).toBe('elevated');
    expect(body.calculatorInputs.age).toBe(55);
    expect(body.disclaimer).toMatch(/not a validated medical calculation/i);
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
