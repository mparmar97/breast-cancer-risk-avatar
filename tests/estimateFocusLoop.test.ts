import { describe, expect, it } from 'vitest';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import {
  detectEstimateFocusOffer,
  detectEstimateFocusSelection,
  resolveContextualReply,
} from '../worker/dialogue/resolveContextualReply';
import { getMockRiskResult } from '../worker/mockRisk';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const envNoGroq: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

describe('estimate focus clarifying loop', () => {
  const risk = getMockRiskResult('elevated');

  it('treats reviewing my estimate as risk explanation, not another clarify', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'reviewing my estimate',
      riskResult: risk,
    });
    expect(turn.topic).toBe('risk_meaning');
    expect(turn.requiresClarification).toBe(false);
  });

  it('treats next-steps menu echo as next-step options', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'what they mean for your next steps',
      riskResult: risk,
    });
    expect(turn.topic).toBe('professional_interpretation');
    expect(turn.primaryOperation).toBe('provide_options');
    expect(turn.requiresClarification).toBe(false);
  });

  it('detects estimate-focus menu offers and selections', () => {
    const offer =
      'Could you let me know what specific part of reviewing your estimate you’d like to focus on—perhaps the numbers themselves, how they were calculated, or what they mean for your next steps?';
    expect(detectEstimateFocusOffer(offer)).toBe(true);
    expect(detectEstimateFocusSelection('what they mean for your next steps')).toBe('next_steps');
    expect(detectEstimateFocusSelection('how they were calculated')).toBe('how_calculated');
    expect(detectEstimateFocusSelection('the numbers themselves')).toBe('explain_numbers');
  });

  it('does not re-ask clarifying questions after a next-steps menu echo', async () => {
    const prior =
      'Could you let me know what specific part of reviewing your estimate you’d like to focus on—perhaps the numbers themselves, how they were calculated, or what they mean for your next steps?';

    const contextual = resolveContextualReply(
      'what they mean for your next steps',
      undefined,
      prior,
    );
    expect(contextual.kind).toBe('information_requested');
    expect(contextual.overridePrimaryIntent).toBe('request_next_step');
    expect(contextual.requiresClarification).toBe(false);

    const result = await orchestrateDialogueTurn(envNoGroq, {
      latestMessage: 'what they mean for your next steps',
      recentConversation: [
        { role: 'user', content: 'reviewing my estimate' },
        { role: 'assistant', content: prior },
      ],
      riskResult: risk,
    });

    expect(result.semanticTurn?.requiresClarification).toBe(false);
    expect(result.semanticTurn?.topic).toBe('professional_interpretation');
    expect(result.response).not.toMatch(/which part of the next steps|could you tell me which part/i);
    expect(result.response).not.toMatch(/what specific part of reviewing/i);
  });
});
