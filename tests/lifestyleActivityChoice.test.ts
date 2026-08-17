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

  it('routes yoga/routine motivation tips to lifestyle under local fallback (no Groq)', async () => {
    for (const message of [
      'Yes Please give me tips for setting up routine',
      'I want tips to stay motivated to do yoga',
    ]) {
      const semantic = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
      expect(semantic.topic).toBe('lifestyle_risk_information');

      const result = await orchestrateDialogueTurn(envNoGroq, {
        latestMessage: message,
        recentConversation: [],
        riskResult: risk,
      });
      expect(result.dialogueRoute?.topic).toBe('lifestyle_risk_information');
      expect(result.response.toLowerCase()).toMatch(
        /physical activity|motivat|yoga|routine|healthy habit|activity|exercise/,
      );
      expect(result.response).not.toMatch(/which part of the result/i);
      expect(result.response).not.toMatch(/how do you currently feel about discussing this result/i);
    }
  });

  it('locks in morning / before-work schedule instead of nesting another which-part ask', async () => {
    const priorScheduleAsk =
      'Which part of your workday do you think would be most doable for a short yoga or movement break?';
    const nestedMorningAsk =
      'Which part of your morning routine would you like to try adding a short yoga session to?';

    const morning = interpretSemanticTurnLocal({
      latestMessage: 'I think morning session',
      riskResult: risk,
      previousAssistantReply: priorScheduleAsk,
    });
    expect(morning.topic).toBe('lifestyle_risk_information');
    expect(morning.explicitRequest).toMatch(/lock in|schedule/i);
    expect(morning.requiresClarification).toBe(false);

    const memory = createDefaultConversationMemory();
    memory.lastRouteTopic = 'lifestyle_risk_information';

    const afterMorning = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'I think morning session',
      recentConversation: [
        { role: 'user', content: 'I am looking for way to balance work and exercise' },
        { role: 'assistant', content: priorScheduleAsk },
      ],
      riskResult: risk,
      previousConversationMemory: memory,
    });
    expect(afterMorning.response.toLowerCase()).toMatch(/morning|yoga|movement/);
    expect(afterMorning.response).not.toMatch(/which part of your morning/i);

    const afterBeforeWork = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'before work rutine',
      recentConversation: [
        { role: 'user', content: 'I think morning session' },
        { role: 'assistant', content: nestedMorningAsk },
      ],
      riskResult: risk,
      previousConversationMemory: memory,
    });
    expect(afterBeforeWork.response.toLowerCase()).toMatch(/before work|morning|yoga|movement/);
    expect(afterBeforeWork.response).not.toMatch(/which part of/i);
    expect(afterBeforeWork.response.toLowerCase()).toMatch(/protect|fit|consistent|slot|week/);
  });
});
