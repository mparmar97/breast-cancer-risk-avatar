import { describe, expect, it } from 'vitest';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { interpretCurrentTurnRequest } from '../worker/dialogue/currentTurnInterpretation';
import { planDialogueTurn } from '../worker/dialogue/planDialogueTurn';
import { getMockRiskResult } from '../worker/mockRisk';

const risk = getMockRiskResult('elevated');

function planFor(message: string) {
  const requestInterpretation = interpretCurrentTurnRequest({ latestMessage: message, riskResult: risk });
  return planDialogueTurn({
    latestMessage: message,
    primaryIntent: requestInterpretation.primaryIntent as never,
    secondaryIntents: [],
    resolvedShortReply: {
      isShortReply: false,
      shortReplyType: 'not_short_reply',
      requiresClarification: false,
    },
    state: createDefaultAdaptiveState(),
    transitionMetadata: {
      previousUnderstanding: 'uncertain',
      currentUnderstanding: 'uncertain',
      understandingChanged: false,
      previousEmotion: 'worried',
      currentEmotion: 'worried',
      previousBarrier: 'none',
      currentBarrier: 'none',
      barrierCleared: false,
      previousSelfEfficacy: 'unknown',
      currentSelfEfficacy: 'unknown',
      previousReadiness: 'unclear',
      currentReadiness: 'unclear',
      stateChanged: false,
      changedFields: [],
      barrierUnmentionedTurns: 0,
    },
    strategy: 'clarify_risk',
    conversationMemory: createDefaultConversationMemory(),
    requestInterpretation,
  });
}

describe('operationAwarePlanning', () => {
  it('plans conversion without forcing a comprehension question', () => {
    const plan = planFor('Can you explain 3.2% without using percentages?');
    expect(plan.primaryOperation).toBe('convert');
    expect(String(plan.primaryGoal)).toMatch(/natural.?frequency/i);
    expect(plan.mustAddress.join(' ')).toMatch(/numerator|denominator|time horizon|probabilistic/i);
    expect(plan.mustNotDo?.join(' ')).toMatch(/generic risk definition/i);
    expect(plan.shouldAskQuestion).toBe(false);
  });

  it('plans comparison of both horizons', () => {
    const plan = planFor('What is the difference between five-year and lifetime risk?');
    expect(plan.primaryOperation).toBe('compare');
    expect(plan.mustAddress.join(' ')).toMatch(/each concept|difference/i);
    expect(plan.shouldAskQuestion).toBe(false);
  });

  it('plans draft revision from stated constraints', () => {
    const plan = planFor(
      'Here is my draft. Make it shorter, remove the appointment sentence, and keep the question about family history.',
    );
    expect(plan.primaryOperation).toBe('revise');
    expect(plan.mustNotDo?.join(' ')).toMatch(/unrelated new draft|risk explanation/i);
    expect(plan.shouldAskQuestion).toBe(false);
  });

  it('does not let prior worry override a calculator-inputs question', () => {
    const plan = planFor('What information did the calculator use?');
    expect(plan.topic).toBe('calculator_inputs');
    expect(plan.primaryOperation).toBe('list_information');
    expect(plan.mustAddress.join(' ')).toMatch(/input/i);
    expect(plan.mustAddress.join(' ')).not.toMatch(/worry|emotion/i);
  });
});
