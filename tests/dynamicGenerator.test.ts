import { describe, expect, it, vi } from 'vitest';
import { getTheoryConstruct } from '../worker/behavioral/theoryMap';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { generateDynamicResponse, type DynamicResponseInput } from '../worker/llm/generateDynamicResponse';
import { getMockRiskResult } from '../worker/mockRisk';
import { retrieveEvidence } from '../worker/rag/retrieve';
import type { Env } from '../worker/types';

const envWithKey: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  GROQ_API_KEY: 'sk-test-key',
};

const riskResult = getMockRiskResult('average');

function groqFetchReturning(contentObj: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentObj) } }], model: 'openai/gpt-oss-20b' }),
      { status: 200 },
    ),
  );
}

function baseInput(overrides: Partial<DynamicResponseInput> = {}): DynamicResponseInput {
  const strategy = overrides.strategy ?? 'clarify_risk';
  const evidence = retrieveEvidence('risk estimate probability not diagnosis', {
    limit: 3,
    sourceUse: 'medical-rag',
  });
  return {
    latestMessage: 'What is a risk estimate?',
    recentConversation: [],
    adaptiveState: createDefaultAdaptiveState(),
    strategy,
    theoryConstruct: getTheoryConstruct(strategy),
    riskResult,
    retrievedEvidence: evidence,
    recentAssistantMessages: [],
    ...overrides,
  };
}

describe('generateDynamicResponse', () => {
  it('returns groq-dynamic-rag for a valid, evidence-grounded reply', async () => {
    const input = baseInput();
    const evidenceId = input.retrievedEvidence[0]?.id;
    const fetchMock = groqFetchReturning({
      reply: 'A risk estimate is a probability, not a diagnosis. It does not mean cancer is present.',
      usedEvidenceIds: evidenceId ? [evidenceId] : [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.reply).toContain('probability');
  });

  it('excludes dialogue-design evidence from medical grounding (only medical-rag evidence is ever passed in)', () => {
    const input = baseInput();
    for (const item of input.retrievedEvidence) {
      expect(item.sourceUse).toBe('medical-rag');
    }
  });

  it('answers a direct question directly and stays under the 90-word limit', async () => {
    const input = baseInput({ strategy: 'clarify_risk' });
    const fetchMock = groqFetchReturning({
      reply: 'A risk estimate describes the probability of developing a condition over a period of time. It is not the same as a diagnosis. What part of the number would you like explained?',
      usedEvidenceIds: [input.retrievedEvidence[0]?.id].filter(Boolean),
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.reply.split(/\s+/).length).toBeLessThanOrEqual(90);
    expect((result.reply.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('filters unknown evidence IDs and auto-binds retrieved ones for clarify_risk', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'A risk estimate is a probability, not a diagnosis.',
      usedEvidenceIds: ['not-a-real-evidence-id'],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.usedEvidenceIds.length).toBeGreaterThan(0);
    expect(result.usedEvidenceIds).not.toContain('not-a-real-evidence-id');
  });

  it('accepts a valid clarify_risk reply when usedEvidenceIds is omitted', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'A risk estimate is a probability over time, not a diagnosis.',
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.usedEvidenceIds.length).toBeGreaterThan(0);
  });

  it('accepts extra JSON keys by ignoring them', async () => {
    const input = baseInput();
    const evidenceId = input.retrievedEvidence[0]?.id;
    const fetchMock = groqFetchReturning({
      reply: 'A risk estimate is a probability, not a diagnosis.',
      usedEvidenceIds: evidenceId ? [evidenceId] : [],
      reasoning: 'internal scratch',
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
  });

  it('rejects an unsupported/ungrounded numeric medical claim with no cited evidence', async () => {
    const input = baseInput({ strategy: 'explore_barrier' });
    const fetchMock = groqFetchReturning({
      reply: 'About 42% of people in your situation develop cancer within five years.',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
  });

  it('rejects diagnosis language', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'You have breast cancer based on this result.',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
  });

  it('rejects treatment advice', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'You should take this medication twice a day to manage the risk.',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
  });

  it('rejects internal state/strategy label exposure', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'Based on your explore_barrier strategy and selfEfficacy score, here is my answer.',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
  });

  it('rejects system-prompt exposure', async () => {
    const input = baseInput();
    const fetchMock = groqFetchReturning({
      reply: 'You estimate temporary conversational needs during an educational breast-cancer risk discussion.',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
  });

  it('falls back locally when Groq is not configured', async () => {
    const input = baseInput();
    const envWithoutKey: Env = { ASSETS: envWithKey.ASSETS };
    const fetchMock = vi.fn();
    const result = await generateDynamicResponse(envWithoutKey, input, fetchMock);
    expect(result.responseMode).toBe('local-rag-fallback');
    expect(result.fallbackReason).toBe('missing_configuration');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an emotional-reflection reply to use zero evidence', async () => {
    const input = baseInput({
      strategy: 'acknowledge_emotion',
      latestMessage: 'I am scared.',
      theoryConstruct: getTheoryConstruct('acknowledge_emotion'),
    });
    const fetchMock = groqFetchReturning({
      reply: 'It sounds like this result brought up some worry. What feels most concerning right now?',
      usedEvidenceIds: [],
    });
    const result = await generateDynamicResponse(envWithKey, input, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.usedEvidenceIds).toEqual([]);
  });
});
