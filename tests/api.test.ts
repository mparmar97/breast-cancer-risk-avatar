import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';

const fakeEnv: Env = {
  ASSETS: {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher,
};

interface ChatResponseBody {
  reply: string;
  adaptiveState: {
    understanding: string;
    emotion: string;
    barrier: string;
    selfEfficacy: string;
    readiness: string;
    safetyFlag: string;
    confidence: number;
  };
  strategy: string;
  theoryConstruct: {
    theory: string;
    construct: string;
    communicationTechnique: string;
    objective: string;
  };
  retrievalQuery: string;
  sources: Array<{ id: string; topic: string; score: number; status: string }>;
  responseMode: string;
  timestamp: string;
  error?: string;
}

async function postChat(payload: unknown): Promise<{ status: number; body: ChatResponseBody }> {
  const request = new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const response = await worker.fetch(request, fakeEnv, {} as ExecutionContext);
  return { status: response.status, body: (await response.json()) as ChatResponseBody };
}

describe('POST /api/chat', () => {
  it('returns 400 when the message is missing', async () => {
    const { status, body } = await postChat({});
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when the message is an empty string', async () => {
    const { status } = await postChat({ message: '' });
    expect(status).toBe(400);
  });

  it('returns the fixed safety response for a diagnosis request', async () => {
    const { status, body } = await postChat({ message: 'Does this mean I have cancer?' });
    expect(status).toBe(200);
    expect(body.strategy).toBe('safety_boundary');
    expect(body.reply.toLowerCase()).toContain('not a diagnosis');
    expect(body.adaptiveState.safetyFlag).toBe('diagnosis_request');
  });

  it('selects acknowledge_emotion for a fear message', async () => {
    const { body } = await postChat({ message: 'I am scared.' });
    expect(body.strategy).toBe('acknowledge_emotion');
  });

  it('selects explore_barrier for a time-barrier message', async () => {
    const { body } = await postChat({ message: 'I cannot call while I am working.' });
    expect(body.strategy).toBe('explore_barrier');
    expect(body.adaptiveState.barrier).toBe('time');
  });

  it('selects action_planning for a ready-to-act statement', async () => {
    const { body } = await postChat({ message: 'I will contact my doctor today.' });
    expect(body.strategy).toBe('action_planning');
    expect(body.adaptiveState.readiness).toBe('ready');
  });

  it('includes adaptiveState in the response', async () => {
    const { body } = await postChat({ message: 'Can you tell me more?' });
    expect(body.adaptiveState).toBeDefined();
    expect(body.adaptiveState.confidence).toBeGreaterThanOrEqual(0);
    expect(body.adaptiveState.confidence).toBeLessThanOrEqual(1);
  });

  it('includes strategy in the response', async () => {
    const { body } = await postChat({ message: 'How does this work?' });
    expect(typeof body.strategy).toBe('string');
    expect(body.strategy.length).toBeGreaterThan(0);
  });

  it('includes theoryConstruct in the response', async () => {
    const { body } = await postChat({ message: 'I do not know who to contact.' });
    expect(body.theoryConstruct).toBeDefined();
    expect(body.theoryConstruct.theory).toBeTruthy();
    expect(body.theoryConstruct.construct).toBeTruthy();
    expect(body.theoryConstruct.communicationTechnique).toBeTruthy();
    expect(body.theoryConstruct.objective).toBeTruthy();
  });

  it('sets responseMode to local-rag-fallback', async () => {
    const { body } = await postChat({ message: 'I cannot afford another appointment.' });
    expect(body.responseMode).toBe('local-rag-fallback');
  });

  it('includes retrievalQuery and sources (Phase 4 RAG fields) in the response', async () => {
    const { body } = await postChat({ message: 'I cannot afford another appointment.' });
    expect(typeof body.retrievalQuery).toBe('string');
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it('returns a urgent_referral strategy and no phone number for an urgent symptom', async () => {
    const { body } = await postChat({ message: 'I found a new lump' });
    expect(body.strategy).toBe('urgent_referral');
    expect(body.reply).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
  });

  it('returns a urgent_referral strategy for an emotional crisis message', async () => {
    const { body } = await postChat({ message: "I don't want to live anymore." });
    expect(body.strategy).toBe('urgent_referral');
    expect(body.adaptiveState.safetyFlag).toBe('emotional_crisis');
  });

  it('accepts an optional riskResult and previousState without error', async () => {
    const { status, body } = await postChat({
      message: 'I will message my doctor today.',
      riskResult: {
        model: 'Mock Demonstration Calculator',
        fiveYearRisk: 3.2,
        riskHorizon: '5 years',
        riskBranch: 'elevated',
        disclaimer: 'Demonstration result only.',
      },
      previousState: {
        understanding: 'correct',
        emotion: 'worried',
        barrier: 'fear',
        selfEfficacy: 'unknown',
        readiness: 'considering',
        safetyFlag: 'none',
        confidence: 0.75,
      },
    });
    expect(status).toBe(200);
    expect(body.reply).toBeTruthy();
  });

  it('does not save any message data server-side between requests', async () => {
    await postChat({ message: 'I found a new lump' });
    const { body } = await postChat({ message: 'Can you tell me more?' });
    // A fresh request with no previousState must not carry over the
    // previous request's urgent_symptom safety flag.
    expect(body.adaptiveState.safetyFlag).toBe('none');
  });
});
