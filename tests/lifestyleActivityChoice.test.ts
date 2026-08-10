import { describe, expect, it } from 'vitest';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

const priorCoach =
  'I can support you as an educational motivational guide for keeping physical activity in your routine—not as a personal trainer or treatment planner. Regular activity is linked with lower breast cancer risk at a population level, and many people find it easier to maintain when they choose one small, repeatable step that fits their life. A qualified healthcare professional can tailor advice to you. What is one activity you already do—or would like to try—that you could keep this week?';

describe('lifestyle activity choice follow-up', () => {
  const risk = getMockRiskResult('elevated');

  it('routes bare motivate-me asks to lifestyle motivation, not the generic menu', async () => {
    for (const message of ['I want someone to motivate me', 'can you motivate me everyday']) {
      const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
      expect(semantic.topic).toBe('lifestyle_risk_information');

      const result = await orchestrateDialogueTurn(envNoGroq, {
        latestMessage: message,
        recentConversation: [],
        riskResult: risk,
      });
      expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
      expect(result.response.toLowerCase()).toMatch(/motivat|physical activity|healthy habit|activity/);
      expect(result.response).not.toMatch(/what would be most useful right now/i);
    }
  });

  it('routes "I like doing gym" after a lifestyle ask to lifestyle reinforcement', () => {
    const semantic = interpretSemanticTurnLocal({
      latestMessage: 'I like doing gym',
      riskResult: risk,
      previousAssistantReply: priorCoach,
    });
    expect(semantic.topic).toBe('lifestyle_risk_information');
    expect(semantic.requiresClarification).toBe(false);
    expect(semantic.explicitRequest).toMatch(/gym|chosen activity/i);
  });

  it('reinforces gym instead of generic clinician action-planning', async () => {
    const memory = createDefaultConversationMemory();
    memory.lastRouteTopic = 'lifestyle_risk_information';
    memory.lastRouteOperation = 'answer_general_health_question';

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'I like doing gym',
      recentConversation: [
        {
          role: 'user',
          content: 'can you be my motivational guide to maintain the physical activity in my life style',
        },
        { role: 'assistant', content: priorCoach },
      ],
      riskResult: risk,
      previousConversationMemory: memory,
    });

    expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
    expect(result.response.toLowerCase()).toMatch(/gym/);
    expect(result.response.toLowerCase()).toMatch(/physical activity|population/);
    expect(result.response).not.toMatch(/you have identified a possible next step/i);
    expect(result.response).not.toMatch(/what action feels realistic for you/i);
    expect(result.response.toLowerCase()).toMatch(/consistent|keep|maintain/);
  });
});
