import { describe, expect, it } from 'vitest';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { deriveResponsePlan } from '../worker/dialogue/deriveResponsePlan';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { selectTheoryApplication } from '../worker/dialogue/theoryApplication';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import { routeDialogueTurn } from '../worker/routing/routeDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

const message =
  'can you be my motivational guide to maintain the physical activity in my life style';

describe('motivational lifestyle guide request', () => {
  const risk = getMockRiskResult('elevated');

  it('does not treat plain risk explanation as lifestyle', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'explain demonstration risk',
      recentConversation: [],
      riskResult: risk,
    });
    expect(result.dialogueRoute?.topic).toBe('risk_meaning');
    expect(result.dialogueStrategy).toBe('clarify_risk');
  });

  it('routes to lifestyle information, not short-reply clarification', () => {
    const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(semantic.topic).toBe('lifestyle_risk_information');
    expect(semantic.requiresClarification).toBe(false);
    expect(semantic.requiresSafetyBoundary).toBe(false);

    const theory = selectTheoryApplication(semantic);
    expect(theory.healthBehaviorTheory).toBe('Health Belief Model');
    expect(theory.communicationTheory).toBe('Motivational Interviewing');
    expect(theory.construct).toMatch(/perceived benefits|cue to action/i);

    const plan = deriveResponsePlan({
      semanticTurn: semantic,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });
    expect(plan.primaryGoal).toBe('answer_general_lifestyle_question_with_boundary');
    expect(plan.primaryGoal).not.toBe('clarify_short_reply');

    const route = routeDialogueTurn({
      latestMessage: message,
      riskResult: risk,
      semanticTurn: semantic,
      conversationMemory: createDefaultConversationMemory(),
    });
    expect(route.topic).toBe('lifestyle_risk_information');
  });

  it('orchestrates a motivational lifestyle reply with evidence', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: message,
      recentConversation: [],
      riskResult: risk,
    });
    expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
    expect(result.responsePlan?.primaryGoal).toBe(
      'answer_general_lifestyle_question_with_boundary',
    );
    expect(result.dialogueTurnPlan?.primaryGoal).toBe(
      'answer_general_lifestyle_question_with_boundary',
    );
    expect(result.dialogueTurnPlan?.primaryGoal).not.toBe('clarify_short_reply');
    expect(result.dialogueTurnPlan?.dialogueAct).not.toBe('ask_clarification');
    expect(result.dialogueStrategy).toBe('explain_benefit');
    expect(result.theoryConstruct.theory).toMatch(/Health Belief Model/i);
    expect(result.theoryConstruct.construct).toMatch(/perceived benefits|cue to action/i);
    expect(result.response.toLowerCase()).toMatch(
      /motivational guide|maintain|physical activity|activity you/,
    );
    expect(result.response.toLowerCase()).not.toMatch(/clarifying question/);
    expect(result.usedEvidenceIds?.length ?? 0).toBeGreaterThan(0);
  });
});
