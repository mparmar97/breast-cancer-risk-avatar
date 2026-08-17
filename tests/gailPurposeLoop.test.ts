import { describe, expect, it } from 'vitest';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import {
  detectClarifyingTopicEcho,
  resolveContextualReply,
} from '../worker/dialogue/resolveContextualReply';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

describe('Gail model purpose clarifying loop', () => {
  const risk = getMockRiskResult('elevated');

  it('routes purpose questions to calculator applicability, not unclear', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'what is the purpose of Gail model ?',
      riskResult: risk,
    });
    expect(turn.topic).toBe('calculator_applicability');
    expect(turn.requiresClarification).toBe(false);
    expect(turn.directAnswerRequired).toBe(true);
  });

  it('detects purpose selection from a learn-about menu', () => {
    const prior =
      'Could you let me know what you’d like to learn about the Gail model—its purpose, how it works, or something else?';
    expect(detectClarifyingTopicEcho('i want to learn the purpose of gail models', prior).matched).toBe(
      true,
    );
    const contextual = resolveContextualReply(
      'i want to learn the purpose of gail models',
      undefined,
      prior,
    );
    expect(contextual.kind).toBe('information_requested');
    expect(contextual.requiresClarification).toBe(false);
  });

  it('answers purpose without re-asking which aspect', async () => {
    const prior =
      'Could you let me know what you’d like to learn about the Gail model—its purpose, how it works, or something else?';
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'i want to learn the purpose of gail models',
      recentConversation: [
        { role: 'user', content: 'tell me about the Gail model' },
        { role: 'assistant', content: prior },
      ],
      riskResult: risk,
    });

    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.response).toMatch(/gail|probability|invasive breast cancer/i);
    expect(result.response).not.toMatch(
      /what you’d like to learn|what aspect of the Gail model|purpose, how it works, or something else/i,
    );
  });
});
