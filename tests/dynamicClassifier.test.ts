import { describe, expect, it, vi } from 'vitest';
import { classifyAdaptiveState } from '../worker/llm/classifyAdaptiveState';
import { getMockRiskResult } from '../worker/mockRisk';
import type { Env } from '../worker/types';

const envWithKey: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  GROQ_API_KEY: 'sk-test-key',
};

const envWithoutKey: Env = {
  ASSETS: envWithKey.ASSETS,
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

function classificationOf(
  primaryIntent: string,
  overrides: Record<string, unknown> = {},
  evidenceOverrides: Record<string, string> = {},
): Record<string, unknown> {
  return {
    primaryIntent,
    secondaryIntents: [],
    understanding: 'uncertain',
    emotion: 'uncertain',
    barrier: 'none',
    selfEfficacy: 'unknown',
    readiness: 'unclear',
    safetyFlag: 'none',
    confidence: 0.82,
    currentTurnEvidence: {
      intent: 'not expressed',
      understanding: 'not expressed',
      emotion: 'not expressed',
      barrier: 'not expressed',
      selfEfficacy: 'not expressed',
      readiness: 'not expressed',
      safetyFlag: 'not expressed',
      ...evidenceOverrides,
    },
    refersToPreviousAssistantTurn: false,
    shortReplyType: 'not_short_reply',
    ...overrides,
  };
}

const VALID_CLASSIFICATION = classificationOf(
  'express_confidence',
  {
    emotion: 'calm',
    selfEfficacy: 'moderate',
    readiness: 'preparing',
    confidence: 0.82,
  },
  {
    intent: 'sending a message will be manageable',
    selfEfficacy: 'will be manageable',
    readiness: 'sending a message',
  },
);

describe('classifyAdaptiveState', () => {
  it('accepts a valid strict-schema output as groq-structured', async () => {
    const fetchMock = groqFetchReturning(VALID_CLASSIFICATION);
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'Sending a message feels manageable.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('groq-structured');
    expect(result.interpretation.selfEfficacy).toBe('moderate');
    expect(result.interpretation.primaryIntent).toBe('express_confidence');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local classifier when an enum value is unknown', async () => {
    const fetchMock = groqFetchReturning({ ...VALID_CLASSIFICATION, barrier: 'not_a_real_barrier' });
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
    expect(result.fallbackReason).toBe('classification_validation_failure');
  });

  it('falls back to the local classifier when confidence is outside 0-1', async () => {
    const fetchMock = groqFetchReturning({ ...VALID_CLASSIFICATION, confidence: 1.5 });
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
  });

  it('falls back to the local classifier when a required field is missing', async () => {
    const { confidence, ...withoutConfidence } = VALID_CLASSIFICATION;
    void confidence;
    const fetchMock = groqFetchReturning(withoutConfidence);
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
  });

  it('falls back to the local classifier when an extra top-level field is present', async () => {
    const fetchMock = groqFetchReturning({ ...VALID_CLASSIFICATION, extraField: 'nope' });
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
  });

  it('falls back to the local classifier when an evidence string exceeds the length limit', async () => {
    const fetchMock = groqFetchReturning({
      ...VALID_CLASSIFICATION,
      currentTurnEvidence: { ...(VALID_CLASSIFICATION.currentTurnEvidence as object), intent: 'x'.repeat(200) },
    });
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
  });

  it('falls back to the local classifier when GROQ_API_KEY is missing, without calling fetch', async () => {
    const fetchMock = vi.fn();
    const result = await classifyAdaptiveState(
      envWithoutKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
    expect(result.fallbackReason).toBe('missing_configuration');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the local classifier on a provider failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I am scared.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.classificationMode).toBe('local-fallback');
    expect(result.fallbackReason).toBe('classification_provider_failure');
  });

  it('a direct question overrides a prior carried emotion in the resulting strategy-relevant state', async () => {
    const fetchMock = groqFetchReturning(
      classificationOf('explain_risk_horizon', { confidence: 0.7 }, { intent: 'what does five year risk mean' }),
    );
    const result = await classifyAdaptiveState(
      envWithKey,
      {
        latestMessage: 'What does five-year risk mean?',
        recentConversation: [],
        previousState: {
          understanding: 'uncertain',
          emotion: 'worried',
          barrier: 'none',
          selfEfficacy: 'unknown',
          readiness: 'unclear',
          safetyFlag: 'none',
          confidence: 0.6,
        },
        riskResult,
      },
      fetchMock,
    );
    expect(result.interpretation.primaryIntent).toBe('explain_risk_horizon');
  });

  it('a resolved access barrier is cleared when evidence says barrier was not expressed and the model reports none', async () => {
    const fetchMock = groqFetchReturning(
      classificationOf(
        'express_confidence',
        {
          emotion: 'calm',
          barrier: 'none',
          selfEfficacy: 'moderate',
          readiness: 'preparing',
          confidence: 0.8,
        },
        {
          intent: 'feels manageable',
          barrier: 'no longer mentioned, resolved',
          selfEfficacy: 'feels manageable',
          readiness: 'preparing to act',
        },
      ),
    );
    const result = await classifyAdaptiveState(
      envWithKey,
      {
        latestMessage: 'I think sending a message will be manageable.',
        recentConversation: [],
        previousState: {
          understanding: 'uncertain',
          emotion: 'uncertain',
          barrier: 'access',
          selfEfficacy: 'low',
          readiness: 'considering',
          safetyFlag: 'none',
          confidence: 0.6,
        },
        riskResult,
      },
      fetchMock,
    );
    expect(result.interpretation.barrier).toBe('none');
    expect(['moderate', 'high']).toContain(result.interpretation.selfEfficacy);
  });

  it('confirmed action raises readiness to ready', async () => {
    const fetchMock = groqFetchReturning(
      classificationOf(
        'confirm_action',
        {
          emotion: 'calm',
          selfEfficacy: 'high',
          readiness: 'ready',
          confidence: 0.88,
        },
        {
          intent: 'i will send it this evening',
          readiness: 'i will send it this evening',
        },
      ),
    );
    const result = await classifyAdaptiveState(
      envWithKey,
      { latestMessage: 'I will send it this evening.', recentConversation: [], riskResult },
      fetchMock,
    );
    expect(result.interpretation.readiness).toBe('ready');
    expect(result.interpretation.primaryIntent).toBe('confirm_action');
  });
});
