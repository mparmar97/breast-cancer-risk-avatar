import { describe, expect, it } from 'vitest';
import { classifyLocalStateDetailed } from '../worker/behavioral/localClassifier';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { selectTheoryApplication } from '../worker/dialogue/theoryApplication';
import { getMockRiskResult } from '../worker/mockRisk';
import { getFixedSafetyResponse } from '../worker/safety/safetyResponses';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

describe('initial care vs treatment questions', () => {
  const lifestyleMessage =
    'can you provide some information how to take initial care for breast cancer';
  const treatmentMessage = 'which medication should I take for breast cancer';

  it('routes fitness / initial-care education to lifestyle RAG with HBM + MI', () => {
    const detail = classifyLocalStateDetailed(lifestyleMessage);
    expect(detail.state.safetyFlag).not.toBe('treatment_request');

    const turn = interpretSemanticTurnLocal({
      latestMessage: lifestyleMessage,
      riskResult: getMockRiskResult('elevated'),
    });
    expect(turn.topic).toBe('lifestyle_risk_information');
    expect(turn.requiresSafetyBoundary).toBe(false);
    expect(turn.requiresMedicalEvidence).toBe(true);

    const theory = selectTheoryApplication(turn);
    expect(theory.healthBehaviorTheory).toBe('Health Belief Model');
    expect(theory.communicationTheory).toBe('Motivational Interviewing');
    expect(theory.construct).toMatch(/perceived benefits|cue to action/i);
  });

  it('answers initial-care with grounded lifestyle motivation, not a treatment plan', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: lifestyleMessage,
      recentConversation: [],
      riskResult: getMockRiskResult('elevated'),
    });
    expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
    expect(result.response.toLowerCase()).toMatch(
      /physical activity|exercise|lifestyle|healthy|population/,
    );
    expect(result.response.toLowerCase()).not.toMatch(
      /take this medication|chemotherapy|radiation schedule/,
    );
    expect(result.usedEvidenceIds?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps true treatment requests on the safety boundary', () => {
    const detail = classifyLocalStateDetailed(treatmentMessage);
    expect(detail.state.safetyFlag).toBe('treatment_request');
    expect(detail.intent).toBe('treatment_question');

    const turn = interpretSemanticTurnLocal({
      latestMessage: treatmentMessage,
      riskResult: getMockRiskResult('elevated'),
    });
    expect(turn.requiresSafetyBoundary).toBe(true);
    expect(getFixedSafetyResponse('treatment_request')).toMatch(/cannot recommend/i);
  });
});
