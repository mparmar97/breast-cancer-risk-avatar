import { describe, expect, it, vi } from 'vitest';
import { getTheoryConstruct } from '../worker/behavioral/theoryMap';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { applyRepetitionGuard, detectRepetition } from '../worker/llm/repetitionGuard';
import type { DynamicResponseInput, DynamicResponseResult } from '../worker/llm/generateDynamicResponse';
import { getMockRiskResult } from '../worker/mockRisk';
import type { Env } from '../worker/types';

const riskResult = getMockRiskResult('average');

describe('detectRepetition', () => {
  it('detects an identical reply', () => {
    const reply = 'It sounds like this has been on your mind. What feels hardest right now?';
    expect(detectRepetition(reply, [reply])).toBe(true);
  });

  it('detects a reply with high token-cosine similarity', () => {
    const recent = 'It sounds like this has been worrying you. What feels most concerning right now?';
    const candidate = 'It sounds like this has been worrying you. What feels most concerning today?';
    expect(detectRepetition(candidate, [recent])).toBe(true);
  });

  it('detects identical first-8-token leading text even with a different ending', () => {
    const recent = 'A risk estimate describes probability over a specified period, not a diagnosis of any kind.';
    const candidate = 'A risk estimate describes probability over a specified period, and it can feel confusing at first.';
    expect(detectRepetition(candidate, [recent])).toBe(true);
  });

  it('accepts a meaningfully different reply', () => {
    const recent = 'It sounds like this has been worrying you. What feels most concerning right now?';
    const candidate = 'You mentioned you know who to contact — what has made it hard to actually reach out?';
    expect(detectRepetition(candidate, [recent])).toBe(false);
  });

  it('normalizes contractions, punctuation, and case before comparing', () => {
    const recent = "It's understandable to feel that way. What's on your mind?";
    const candidate = 'it is understandable to feel that way what is on your mind';
    expect(detectRepetition(candidate, [recent])).toBe(true);
  });

  it('only compares against the three most recent replies', () => {
    const oldReply = 'This exact unique historical reply should not be compared against.';
    const candidate = 'Something completely different and unrelated to any of the others in this list.';
    const recents = [oldReply, 'filler one', 'filler two', 'filler three'];
    expect(detectRepetition(candidate, recents)).toBe(false);
  });
});

function baseInput(overrides: Partial<DynamicResponseInput> = {}): DynamicResponseInput {
  const strategy = overrides.strategy ?? 'explore_readiness';
  return {
    latestMessage: 'How do you feel about it?',
    recentConversation: [],
    adaptiveState: createDefaultAdaptiveState(),
    strategy,
    theoryConstruct: getTheoryConstruct(strategy),
    riskResult,
    retrievedEvidence: [],
    recentAssistantMessages: [],
    ...overrides,
  };
}

const envWithKey: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  GROQ_API_KEY: 'sk-test-key',
};

function groqFetchReturning(contentObj: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentObj) } }], model: 'openai/gpt-oss-20b' }),
      { status: 200 },
    ),
  );
}

describe('applyRepetitionGuard', () => {
  it('passes through a non-repetitive candidate unchanged', async () => {
    const candidate: DynamicResponseResult = {
      reply: 'A brand new, unique reply about your situation.',
      usedEvidenceIds: [],
      responseMode: 'groq-dynamic-rag',
    };
    const input = baseInput({ recentAssistantMessages: ['A completely unrelated older reply.'] });
    const fetchMock = vi.fn();
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.repetitionDetected).toBe(false);
    expect(result.regenerationUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('regenerates once and accepts a meaningfully different regeneration', async () => {
    const recent = 'It sounds like this has been worrying you. What feels most concerning right now?';
    const candidate: DynamicResponseResult = {
      reply: recent,
      usedEvidenceIds: [],
      responseMode: 'groq-dynamic-rag',
    };
    const input = baseInput({ recentAssistantMessages: [recent] });
    const fetchMock = groqFetchReturning({
      reply: 'You mentioned feeling unsure — what would help make the next step clearer for you?',
      usedEvidenceIds: [],
    });
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.repetitionDetected).toBe(true);
    expect(result.regenerationUsed).toBe(true);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps Groq reply when regeneration is still repetitive (no local swap)', async () => {
    const recent = 'It sounds like this has been worrying you. What feels most concerning right now?';
    const candidate: DynamicResponseResult = {
      reply: recent,
      usedEvidenceIds: [],
      responseMode: 'groq-dynamic-rag',
    };
    const input = baseInput({ recentAssistantMessages: [recent] });
    const fetchMock = groqFetchReturning({ reply: recent, usedEvidenceIds: [] });
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.fallbackReason).toBeUndefined();
    expect(result.regenerationUsed).toBe(true);
    expect(result.repetitionDetected).toBe(true);
    // Exactly one regeneration attempt — never an unbounded retry loop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps original Groq reply when regeneration itself fails (provider error)', async () => {
    const recent = 'It sounds like this has been worrying you. What feels most concerning right now?';
    const candidate: DynamicResponseResult = {
      reply: recent,
      usedEvidenceIds: [],
      responseMode: 'groq-dynamic-rag',
    };
    const input = baseInput({ recentAssistantMessages: [recent] });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.responseMode).toBe('groq-dynamic-rag');
    expect(result.reply).toBe(recent);
    expect(result.repetitionDetected).toBe(true);
  });

  it('progresses a repeated local-fallback candidate without calling Groq', async () => {
    const repeated = 'It sounds like seeing this result has been worrying. What part of the result feels most concerning?';
    const candidate: DynamicResponseResult = {
      reply: repeated,
      usedEvidenceIds: [],
      responseMode: 'local-rag-fallback',
    };
    const input = baseInput({
      recentAssistantMessages: [repeated],
      latestMessage: 'I am afraid if i have a breastcancer',
      strategy: 'acknowledge_emotion',
    });
    const fetchMock = vi.fn();
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.repetitionDetected).toBe(true);
    expect(result.regenerationUsed).toBe(true);
    expect(result.reply).not.toBe(repeated);
    expect(result.reply.toLowerCase()).toMatch(/afraid|diagnosis|probability|thank you for sharing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves a non-repeating local-fallback candidate unchanged', async () => {
    const candidate: DynamicResponseResult = {
      reply: 'A unique local template reply about preparation.',
      usedEvidenceIds: [],
      responseMode: 'local-rag-fallback',
    };
    const input = baseInput({ recentAssistantMessages: ['Some other earlier assistant reply.'] });
    const fetchMock = vi.fn();
    const result = await applyRepetitionGuard(envWithKey, input, candidate, fetchMock);
    expect(result.repetitionDetected).toBe(false);
    expect(result.regenerationUsed).toBe(false);
    expect(result.reply).toBe(candidate.reply);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
