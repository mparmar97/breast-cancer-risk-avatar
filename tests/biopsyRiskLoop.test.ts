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

describe('biopsy risk-factor clarifying loop', () => {
  const risk = getMockRiskResult('elevated');

  it('treats a biopsy risk question as calculator-input education, not unclear', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage:
        'what is the chance of getting the breast cancer for people who just went through a biopsy recently',
      riskResult: risk,
    });
    expect(turn.topic).toBe('calculator_inputs');
    expect(turn.requiresClarification).toBe(false);
    expect(turn.directAnswerRequired).toBe(true);
  });

  it('detects clarifying-topic echoes for biopsy risk', () => {
    const prior =
      'Could you tell me a bit more about what you\'re hoping to understand—are you wondering how a recent biopsy might affect your overall breast-cancer risk, or something else?';
    const echo = detectClarifyingTopicEcho(
      'I am wondering about how a recent biopsy might affect your overall breast cancer risk',
      prior,
    );
    expect(echo.matched).toBe(true);

    const contextual = resolveContextualReply(
      'I am wondering about how a recent biopsy might affect your overall breast cancer risk',
      undefined,
      prior,
    );
    expect(contextual.kind).toBe('information_requested');
    expect(contextual.requiresClarification).toBe(false);
  });

  it('answers the biopsy risk question without re-asking for clarification', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage:
        'what is the chance of getting the breast cancer for people who just went through a biopsy recently',
      recentConversation: [],
      riskResult: risk,
    });

    expect(result.semanticTurn?.topic).toBe('calculator_inputs');
    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.response).toMatch(/biops/i);
    expect(result.response).not.toMatch(/hoping to understand|could you tell me a bit more|which part/i);
  });

  it('answers after the user confirms the clarifying option', async () => {
    const prior =
      'Could you tell me a bit more about what you\'re hoping to understand—are you wondering how a recent biopsy might affect your overall breast-cancer risk, or something else?';
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage:
        'I am wondering about how a recent biopsy might affect your overall breast cancer risk',
      recentConversation: [
        {
          role: 'user',
          content:
            'what is the chance of getting the breast cancer for people who just went through a biopsy recently',
        },
        { role: 'assistant', content: prior },
      ],
      riskResult: risk,
    });

    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.response).toMatch(/biops/i);
    expect(result.response).not.toMatch(
      /what specifically you're hoping|could you let me know what specifically|hoping to understand/i,
    );
  });

  it('answers a non-biopsy educational question without clarifying loop', async () => {
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'How does family history affect breast cancer risk estimates?',
      recentConversation: [],
      riskResult: risk,
    });
    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.semanticTurn?.directAnswerRequired).toBe(true);
    expect(result.response).not.toMatch(/hoping to understand|could you tell me a bit more|which part/i);
  });

  it('answers after confirming a non-biopsy clarifying option', async () => {
    const prior =
      'Could you tell me a bit more about what you\'re hoping to understand—are you wondering how family history affects breast cancer risk estimates, or something else?';
    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'I am wondering how family history affects breast cancer risk estimates',
      recentConversation: [
        { role: 'user', content: 'How does family history affect risk?' },
        { role: 'assistant', content: prior },
      ],
      riskResult: risk,
    });
    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.response).not.toMatch(
      /what specifically you're hoping|could you let me know what specifically|hoping to understand/i,
    );
  });
});
