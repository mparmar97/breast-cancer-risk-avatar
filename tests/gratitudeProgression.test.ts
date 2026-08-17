import { describe, expect, it } from 'vitest';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

const genericMenu =
  'I can help explain the demonstration risk estimate, general next-step options, or sample questions for a healthcare professional. What would be most useful right now?';

describe('gratitude progression', () => {
  const risk = getMockRiskResult('elevated');

  it('routes bare thank-you to closing, not unclear', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'thank you',
      riskResult: risk,
    });
    expect(turn.topic).toBe('closing');
    expect(turn.primaryOperation).toBe('close');
  });

  it('does not repeat the generic menu after thank you', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'thank you',
      recentConversation: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: genericMenu },
      ],
      riskResult: risk,
    });

    expect(result.response.toLowerCase()).toMatch(/welcome|glad/);
    expect(result.response).not.toMatch(/what would be most useful right now/i);
    expect(result.dialogueStrategy).toBe('close_supportively');
  });

  it('closes when thanks + bringing questions to a visit (no menu reopen)', async () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: "Thanks — I'll bring these questions to my visit.",
      riskResult: risk,
    });
    expect(turn.topic).toBe('closing');
    expect(turn.primaryOperation).toBe('close');

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: "Thanks — I'll bring these questions to my visit.",
      recentConversation: [
        {
          role: 'assistant',
          content:
            'Here are a few general questions you could ask a healthcare professional about a demonstration risk estimate.',
        },
      ],
      riskResult: risk,
    });

    expect(result.dialogueStrategy).toBe('close_supportively');
    expect(result.response.toLowerCase()).toMatch(/welcome|glad|return anytime|anytime/);
    expect(result.response).not.toMatch(/what would be most useful right now/i);
    // Closing should not leave default uncertain emotion / unclear readiness.
    expect(result.adaptiveState.emotion).toBe('calm');
    expect(result.adaptiveState.barrier).toBe('none');
    expect(result.adaptiveState.readiness).not.toBe('unclear');
  });
});
