import { describe, expect, it } from 'vitest';
import { classifyLocalStateDetailed } from '../worker/behavioral/localClassifier';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { assertsUnderstandingUtterance } from '../worker/dialogue/understandingSignals';
import { understandingNextStepFallback } from '../worker/llm/fallbackCopy';
import { generateLocalResponse } from '../worker/llm/localGenerator';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { getMockRiskResult } from '../worker/mockRisk';

describe('understanding acknowledgment progression', () => {
  it('detects okay understood as an understanding assertion', () => {
    expect(assertsUnderstandingUtterance('okay understood')).toBe(true);
    expect(assertsUnderstandingUtterance('Understood.')).toBe(true);
    expect(assertsUnderstandingUtterance('got it')).toBe(true);
    expect(assertsUnderstandingUtterance('what does the risk mean')).toBe(false);
  });

  it('classifies okay understood as confirm_understanding', () => {
    expect(classifyLocalStateDetailed('okay understood').intent).toBe('confirm_understanding');
  });

  it('routes okay understood to verify_understanding', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage: 'okay understood',
      riskResult: getMockRiskResult('elevated'),
    });
    expect(turn.primaryOperation).toBe('verify_understanding');
  });

  it('advances elevated branch to clinician follow-up instead of the generic menu', () => {
    const reply = understandingNextStepFallback(getMockRiskResult('elevated'));
    expect(reply.toLowerCase()).toMatch(/glad that is clear/);
    expect(reply.toLowerCase()).toMatch(/healthcare professional|clinician|questions/);
    expect(reply).not.toMatch(/What would be most useful right now/i);
  });

  it('local generator uses next-step wording for confirm_progress', () => {
    const reply = generateLocalResponse({
      strategy: 'confirm_progress',
      state: { ...createDefaultAdaptiveState(), understanding: 'correct' },
      riskResult: getMockRiskResult('elevated'),
      evidence: [],
      primaryIntent: 'confirm_understanding',
      latestMessage: 'okay understood',
    });
    expect(reply).toBe(understandingNextStepFallback(getMockRiskResult('elevated')));
  });
});
