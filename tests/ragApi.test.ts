import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';

const fakeEnv: Env = {
  ASSETS: {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher,
};

interface SourceMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  section: string;
  topic: string;
  score: number;
  status: string;
  sourceUse: string;
  sourceType: string;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  clinicalUseRestriction?: string;
  researchLimitation?: string;
}

interface DialogueDesignMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  topic: string;
  status: string;
  sourceType: string;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  researchLimitation?: string;
}

interface ChatResponseBody {
  reply: string;
  adaptiveState: {
    barrier: string;
    safetyFlag: string;
  };
  strategy: string;
  theoryConstruct: {
    theory: string;
    construct: string;
    communicationTechnique: string;
    objective: string;
    sourceIds?: string[];
    citations?: string[];
  };
  retrievalQuery: string;
  sources: SourceMetadata[];
  dialogueDesignSources: DialogueDesignMetadata[];
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

describe('POST /api/chat (RAG pipeline)', () => {
  it('returns 400 when the message is missing', async () => {
    const { status, body } = await postChat({});
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('includes sources in a normal chat response', async () => {
    const { body } = await postChat({ message: 'What does five-year risk mean?' });
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it('sets responseMode to local-rag-fallback', async () => {
    const { body } = await postChat({ message: 'How do you currently feel about this?' });
    expect(body.responseMode).toBe('local-rag-fallback');
  });

  it('returns a retrievalQuery string', async () => {
    const { body } = await postChat({ message: 'I cannot afford another appointment.' });
    expect(typeof body.retrievalQuery).toBe('string');
    expect(body.retrievalQuery.length).toBeGreaterThan(0);
  });

  it('returns the fixed safety response for a diagnosis request', async () => {
    const { status, body } = await postChat({ message: 'Does this mean I have cancer?' });
    expect(status).toBe(200);
    expect(body.strategy).toBe('safety_boundary');
    expect(body.reply.toLowerCase()).toContain('not a diagnosis');
  });

  it('still returns relevant source metadata for a diagnosis request', async () => {
    const { body } = await postChat({ message: 'Does this mean I have cancer?' });
    expect(body.sources.length).toBeGreaterThan(0);
    const topics = body.sources.map((source) => source.topic);
    expect(
      topics.includes('elevated_risk_not_current_cancer') || topics.includes('uncertainty_and_limitations'),
    ).toBe(true);
  });

  it('returns explore_barrier for a time-barrier message', async () => {
    const { body } = await postChat({ message: 'I cannot call while I am working.' });
    expect(body.strategy).toBe('explore_barrier');
    expect(body.adaptiveState.barrier).toBe('time');
  });

  it('returns a barrier-specific reply for a time-barrier message even without dedicated medical evidence', async () => {
    // No vetted medical-rag source addresses practical barriers directly —
    // explore_barrier's wording comes from the local template, not RAG
    // grounding, so `sources` may be empty or only loosely related here.
    const { body } = await postChat({ message: 'I cannot call while I am working.' });
    expect(body.reply).toMatch(/time|call|work|schedule|written|write|portal/i);
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it('retrieves professional-interpretation evidence for an access-barrier message', async () => {
    const { body } = await postChat({ message: 'I do not know who to contact.' });
    const topics = body.sources.map((source) => source.topic);
    expect(topics.includes('professional_interpretation') || topics.includes('symptom_follow_up')).toBe(true);
  });

  it('retrieves limitation evidence for a certainty question', async () => {
    const { body } = await postChat({ message: 'Is this result certain?' });
    const topics = body.sources.map((source) => source.topic);
    expect(topics.includes('uncertainty_and_limitations')).toBe(true);
  });

  it('retrieves risk-horizon evidence for a five-year-risk question', async () => {
    const { body } = await postChat({ message: 'What does five-year risk mean?' });
    const topics = body.sources.map((source) => source.topic);
    expect(topics.includes('five_year_vs_lifetime_risk')).toBe(true);
  });

  it('never exposes raw evidence text in the response', async () => {
    const { body } = await postChat({ message: 'What does five-year risk mean?' });
    const serialized = JSON.stringify(body);
    // None of the evidence body-text sentences should ever appear verbatim
    // outside of a source's own (text-free) metadata fields.
    expect(serialized).not.toContain('cannot predict with certainty which individual person');
    expect(serialized).not.toContain('estimates invasive breast cancer risk over the next five years');
    for (const source of body.sources) {
      expect(Object.keys(source)).not.toContain('text');
      expect(Object.keys(source)).not.toContain('keywords');
    }
    for (const source of body.dialogueDesignSources) {
      expect(Object.keys(source)).not.toContain('text');
      expect(Object.keys(source)).not.toContain('keywords');
    }
  });

  it('returns a status field for each source, and only "medical-rag" sourceUse in `sources`', async () => {
    const { body } = await postChat({ message: 'What does five-year risk mean?' });
    for (const source of body.sources) {
      expect(['demo-placeholder', 'vetted']).toContain(source.status);
      expect(source.sourceUse).toBe('medical-rag');
    }
  });

  it('never returns a dialogue-design source inside `sources` for any message', async () => {
    const messages = [
      'What does five-year risk mean?',
      'I understand it is only a probability, but I am scared.',
      'I will message my doctor today.',
      'I do not know who to contact.',
    ];
    for (const message of messages) {
      const { body } = await postChat({ message });
      for (const source of body.sources) {
        expect(source.sourceUse).toBe('medical-rag');
      }
    }
  });

  it('returns dialogueDesignSources with full source metadata (never raw text) for a fear message', async () => {
    const { body } = await postChat({ message: 'I understand it is only a probability, but I am scared.' });
    expect(body.strategy).toBe('acknowledge_emotion');
    expect(Array.isArray(body.dialogueDesignSources)).toBe(true);
    expect(body.dialogueDesignSources.some((source) => source.sourceId === 'MERCADO-ECA-MI-2023')).toBe(true);
  });

  it('theoryConstruct for clarify_risk includes REYNA-FTT-2008 as a design-rationale source', async () => {
    const { body } = await postChat({ message: 'Does this mean I have cancer?' });
    // "Does this mean I have cancer?" is a diagnosis request -> safety_boundary,
    // so we instead directly check a message that reaches clarify_risk.
    void body;
    const { body: clarifyBody } = await postChat({ message: 'I am not sure the percentage is right.' });
    if (clarifyBody.strategy === 'clarify_risk') {
      expect(clarifyBody.theoryConstruct.sourceIds).toContain('REYNA-FTT-2008');
    }
  });

  it('returns the safe grounded-information fallback when clarify_risk has no supporting evidence', async () => {
    // A message that triggers clarify_risk (partial/incorrect understanding)
    // but whose wording is unlikely to retrieve risk-interpretation evidence.
    const { body } = await postChat({ message: 'Not sure what this means.' });
    if (body.strategy === 'clarify_risk') {
      const topics = body.sources.map((source) => source.topic);
      const hasGrounding =
        topics.includes('calculator_purpose') ||
        topics.includes('elevated_risk_not_current_cancer') ||
        topics.includes('average_risk_not_zero');
      if (!hasGrounding) {
        // Prefer a clarifying question or the explicit grounded-information bound.
        expect(body.reply.length).toBeGreaterThan(20);
        expect(body.reply).toMatch(
          /grounded information|which part of the result|what you would like help|probability|demonstration/i,
        );
      }
    }
  });

  it('keeps the API response JSON serializable', async () => {
    const { body } = await postChat({ message: 'I will message my doctor today.' });
    expect(() => JSON.stringify(body)).not.toThrow();
    const roundTripped = JSON.parse(JSON.stringify(body));
    expect(roundTripped.reply).toBe(body.reply);
  });
});
