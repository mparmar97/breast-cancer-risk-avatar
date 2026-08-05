import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';
import { retrieveEvidence } from '../worker/rag/retrieve';

function topIds(query: string, limit = 5): string[] {
  return retrieveEvidence(query, { limit }).map((result) => result.id);
}

describe('retrieveEvidence — vetted NCI/USPSTF sources', () => {
  it('"What does five-year risk mean?" surfaces nci-bcrat-horizons-001 in the first two results', () => {
    expect(topIds('What does five-year risk mean?').slice(0, 2)).toContain('nci-bcrat-horizons-001');
  });

  it('"Does elevated risk mean I have cancer?" surfaces elevated/certainty evidence in the first two results', () => {
    const top2 = topIds('Does elevated risk mean I have cancer?').slice(0, 2);
    expect(top2.includes('nci-elevated-not-certain-001') || top2.includes('nci-risk-not-certainty-001')).toBe(true);
  });

  it('"Is the result certain?" surfaces nci-risk-not-certainty-001 in the first two results', () => {
    expect(topIds('Is the result certain?').slice(0, 2)).toContain('nci-risk-not-certainty-001');
  });

  it('"Does average risk mean zero risk?" surfaces nci-average-not-zero-001 in the first two results', () => {
    expect(topIds('Does average risk mean zero risk?').slice(0, 2)).toContain('nci-average-not-zero-001');
  });

  it('"Who should interpret my result?" surfaces nci-professional-interpretation-001 in the first two results', () => {
    expect(topIds('Who should interpret my result?').slice(0, 2)).toContain('nci-professional-interpretation-001');
  });

  it('"I found a new lump." retrieves nci-breast-change-followup-001 for developer logging', () => {
    expect(topIds('I found a new lump.')).toContain('nci-breast-change-followup-001');
  });
});

describe('urgent-symptom safety override still takes precedence over generation', () => {
  const fakeEnv: Env = {
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  };

  async function postChat(message: string) {
    const request = new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const response = await worker.fetch(request, fakeEnv, {} as ExecutionContext);
    return (await response.json()) as {
      strategy: string;
      reply: string;
      sources: Array<{ id: string }>;
    };
  }

  it('"I found a new lump." still returns the fixed urgent-symptom safety reply, with evidence retrieved for logging only', async () => {
    const body = await postChat('I found a new lump.');
    expect(body.strategy).toBe('urgent_referral');
    expect(body.reply).toMatch(/cannot evaluate urgent symptoms/i);
    // Retrieval still runs (for developer diagnostics) even though the
    // fixed safety reply — not the generator — is what's actually returned.
    expect(body.sources.some((source) => source.id === 'nci-breast-change-followup-001')).toBe(true);
  });
});
