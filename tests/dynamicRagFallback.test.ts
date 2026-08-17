import { describe, expect, it } from 'vitest';
import { deriveResponsePlan } from '../worker/dialogue/deriveResponsePlan';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { generatePlanAwareFallback } from '../worker/llm/planAwareFallback';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import { retrieveEvidence } from '../worker/rag/retrieve';
import type { Env } from '../worker/types';

const risk = getMockRiskResult('average');
const env = {
  ASSETS: { fetch: async () => new Response('x', { status: 404 }) },
} as unknown as Env;

const POST_DIAGNOSIS_CHANGES =
  'what specific changes i can try if i am diagnosed with cancer after meeting the clinician or a doctor';

describe('dynamic RAG fallback when Groq is unavailable', () => {
  it('routes post-diagnosis change asks to a safety boundary, not the risk % lecture', () => {
    const turn = interpretSemanticTurnLocal({ latestMessage: POST_DIAGNOSIS_CHANGES, riskResult: risk });
    expect(turn.requiresSafetyBoundary).toBe(true);

    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });
    const evidence = retrieveEvidence(
      'professional interpretation follow up after diagnosis healthcare professional',
      { limit: 3, sourceUse: 'medical-rag' },
    );
    const reply = generatePlanAwareFallback({
      semanticTurn: turn,
      plan,
      riskResult: risk,
      retrievedEvidence: evidence,
      latestMessage: POST_DIAGNOSIS_CHANGES,
    });

    expect(reply).toMatch(/cannot prescribe|clinical team|individualized/i);
    expect(reply).not.toMatch(/risk estimate of about \d+(\.\d+)?%/i);
    expect(reply).toMatch(/demonstration risk estimate|sample questions|preparation/i);
  });

  it('answers random educational asks from RAG instead of dumping the percent', () => {
    const message =
      'why should someone discuss breast cancer family history findings with a clinician or doctor?';
    const turn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(turn.topic).not.toBe('risk_meaning');
    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });
    const evidence = retrieveEvidence(
      'healthcare professional interpret calculated estimate personal family clinical information',
      { limit: 3, sourceUse: 'medical-rag' },
    );
    const reply = generatePlanAwareFallback({
      semanticTurn: turn,
      plan,
      riskResult: risk,
      retrievedEvidence: evidence,
      latestMessage: message,
    });

    expect(reply).toMatch(/healthcare professional|clinical information/i);
    expect(reply).not.toMatch(/risk estimate of about \d+(\.\d+)?%/i);
    expect(reply).toMatch(/not personalized medical advice|general educational/i);
  });

  it('orchestration without Groq keeps post-diagnosis asks off the percent fallback', async () => {
    const result = await orchestrateDialogueTurn(env, {
      latestMessage: POST_DIAGNOSIS_CHANGES,
      riskResult: risk,
      recentConversation: [],
    });
    expect(result.responseMode).toBe('local-rag-fallback');
    expect(result.response).not.toMatch(/risk estimate of about \d+(\.\d+)?%/i);
    expect(result.response).toMatch(/cannot prescribe|clinical team|cannot diagnose|treatment/i);
  });

  it('answers daily-routine / risk-reduction asks with lifestyle RAG, not the generic menu', async () => {
    const message =
      'How to fit in the daily routine or how it can reduce the breast cancer risk if its there';
    const turn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(turn.topic).toBe('lifestyle_risk_information');

    const result = await orchestrateDialogueTurn(env, {
      latestMessage: message,
      riskResult: risk,
      recentConversation: [],
    });
    expect(result.responseMode).toBe('local-rag-fallback');
    expect(result.response).toMatch(/physical activity|exercise|lower risk|population/i);
    expect(result.response).not.toMatch(/What would be most useful right now/i);
    expect(result.response).not.toMatch(/risk estimate of about \d+(\.\d+)?%/i);
  });
});
