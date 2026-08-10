import { describe, expect, it } from 'vitest';
import { selectDialogueStrategy } from '../worker/behavioral/policy';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { transitionState } from '../worker/behavioral/transitionState';
import { planDialogueTurn } from '../worker/dialogue/planDialogueTurn';
import { resolveShortReply } from '../worker/dialogue/resolveShortReply';
import type { CurrentTurnInterpretation } from '../worker/dialogue/types';
import { validateDialogueProgression } from '../worker/dialogue/validateDialogueProgression';
import { generateLocalResponse } from '../worker/llm/localGenerator';
import { getMockRiskResult } from '../worker/mockRisk';
import { retrieveEvidence } from '../worker/rag/retrieve';

function baseInterpretation(overrides: Partial<CurrentTurnInterpretation> = {}): CurrentTurnInterpretation {
  return {
    primaryIntent: 'unclear',
    secondaryIntents: [],
    understanding: 'uncertain',
    emotion: 'uncertain',
    barrier: 'none',
    selfEfficacy: 'unknown',
    readiness: 'unclear',
    safetyFlag: 'none',
    currentTurnEvidence: {
      intent: 'not expressed',
      understanding: 'not expressed',
      emotion: 'not expressed',
      barrier: 'not expressed',
      selfEfficacy: 'not expressed',
      readiness: 'not expressed',
      safetyFlag: 'not expressed',
    },
    refersToPreviousAssistantTurn: true,
    shortReplyType: 'affirmation',
    confidence: 0.7,
    ...overrides,
  };
}

describe('comprehension confirmation after risk explanation', () => {
  const comprehensionPending = {
    type: 'comprehension_check' as const,
    text: 'whether the explanation of the risk estimate is clearer',
    expectedReplyType: 'affirmation' as const,
  };

  it('resolves "Yes" after a comprehension check as confirm_understanding', () => {
    const resolved = resolveShortReply('Yes.', comprehensionPending);

    expect(resolved.isShortReply).toBe(true);
    expect(resolved.overridePrimaryIntent).toBe('confirm_understanding');
    expect(resolved.overrideUnderstanding).toBe('correct');
    expect(resolved.requiresClarification).toBe(false);
    expect(resolved.resolvedMeaning).toMatch(/previous explanation was understood/i);
  });

  it('resolves varied comprehension affirmations the same way', () => {
    const paraphrases = [
      'yes it does',
      'that makes sense',
      'I understand',
      'got it',
      'okay, I see',
      'that is clearer',
      'now I understand',
    ];

    for (const message of paraphrases) {
      const resolved = resolveShortReply(message, comprehensionPending);
      expect(resolved.overridePrimaryIntent, message).toBe('confirm_understanding');
      expect(resolved.overrideUnderstanding, message).toBe('correct');
    }
  });

  it('updates understanding without selecting clarify_risk or repeating the explanation', () => {
    const resolved = resolveShortReply('Yes.', comprehensionPending);
    const previousState = createDefaultAdaptiveState();
    previousState.understanding = 'uncertain';

    const transition = transitionState({
      previousState,
      interpretation: baseInterpretation({ primaryIntent: 'unclear', shortReplyType: 'affirmation' }),
      resolvedShortReply: resolved,
      barrierUnmentionedTurns: 0,
    });

    expect(transition.state.understanding).toBe('correct');
    expect(transition.metadata.understandingChanged).toBe(true);
    expect(transition.metadata.previousUnderstanding).toBe('uncertain');
    expect(transition.state.readiness).toBe('unclear');

    const strategy = selectDialogueStrategy(transition.state, {
      intent: resolved.overridePrimaryIntent,
    });
    expect(strategy).toBe('confirm_progress');
    expect(strategy).not.toBe('clarify_risk');

    const plan = planDialogueTurn({
      latestMessage: 'Yes.',
      primaryIntent: resolved.overridePrimaryIntent ?? 'unclear',
      secondaryIntents: [],
      resolvedShortReply: resolved,
      state: transition.state,
      transitionMetadata: transition.metadata,
      strategy,
      previousAssistantDialogueAct: 'explain_information',
      pendingItem: comprehensionPending,
    });

    expect(plan.primaryGoal).toBe('confirm_understanding');
    expect(plan.dialogueAct).toBe('confirm_progress');
    expect(plan.questionPurpose).toBe('next_concern');
    expect(plan.mustAddress.some((item) => /confirmed understanding/i.test(item))).toBe(true);
    expect(plan.mustNotAssume.some((item) => /another explanation/i.test(item))).toBe(true);

    const evidence = retrieveEvidence('risk probability diagnosis explanation', {
      limit: 3,
      sourceUse: 'medical-rag',
    });
    const reply = generateLocalResponse({
      strategy,
      state: transition.state,
      riskResult: getMockRiskResult('elevated'),
      evidence,
    });

    expect(reply).not.toMatch(/risk estimate describes probability/i);
    expect(reply).not.toMatch(/in your own words/i);
    expect(reply).not.toMatch(/does not mean that you currently have breast cancer/i);
    expect((reply.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);

    const progression = validateDialogueProgression({
      reply,
      latestMessage: 'Yes.',
      plan,
      transitionMetadata: transition.metadata,
      previousAssistantReply:
        'A 3.2% estimate describes probability over five years, not a diagnosis. Does that help clarify the result?',
    });

    expect(progression.repeatedExplanationDetected).toBe(false);
    expect(progression.dialogueAdvanced).toBe(true);
    expect(progression.valid).toBe(true);
  });

  it('rejects a reply that re-explains probability after comprehension confirmation', () => {
    const resolved = resolveShortReply('Yes.', comprehensionPending);
    const previousState = createDefaultAdaptiveState();
    previousState.understanding = 'partial';

    const transition = transitionState({
      previousState,
      interpretation: baseInterpretation(),
      resolvedShortReply: resolved,
      barrierUnmentionedTurns: 0,
    });

    const plan = planDialogueTurn({
      latestMessage: 'Yes.',
      primaryIntent: 'confirm_understanding',
      secondaryIntents: [],
      resolvedShortReply: resolved,
      state: transition.state,
      transitionMetadata: transition.metadata,
      strategy: 'confirm_progress',
      previousAssistantDialogueAct: 'explain_information',
      pendingItem: comprehensionPending,
    });

    const badReply =
      'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer. In your own words, what do you think the percentage means?';

    const progression = validateDialogueProgression({
      reply: badReply,
      latestMessage: 'Yes.',
      plan,
      transitionMetadata: transition.metadata,
    });

    expect(progression.repeatedExplanationDetected).toBe(true);
    expect(progression.valid).toBe(false);
  });

  it('treats "No, I am still confused" after a comprehension check as needing clarify_risk', () => {
    const resolved = resolveShortReply('No, I am still confused.', comprehensionPending);

    expect(resolved.overridePrimaryIntent).toBe('explain_risk');
    expect(resolved.overrideUnderstanding).toBe('uncertain');
    expect(resolved.resolvedMeaning).toMatch(/still confused/i);

    const previousState = createDefaultAdaptiveState();
    previousState.understanding = 'partial';

    const transition = transitionState({
      previousState,
      interpretation: baseInterpretation({ primaryIntent: 'unclear' }),
      resolvedShortReply: resolved,
      barrierUnmentionedTurns: 0,
    });

    expect(transition.state.understanding).toBe('uncertain');

    const strategy = selectDialogueStrategy(transition.state, {
      intent: resolved.overridePrimaryIntent,
    });
    expect(strategy).toBe('clarify_risk');
  });

  it('treats "Yes" after a teach-back offer as accept_teach_back, not confirm_understanding', () => {
    const resolved = resolveShortReply('Yes.', {
      type: 'teach_back',
      text: 'restate the risk explanation in their own words',
      expectedReplyType: 'explanation',
    });

    expect(resolved.overridePrimaryIntent).toBe('accept_teach_back');
    expect(resolved.overridePrimaryIntent).not.toBe('confirm_understanding');

    const strategy = selectDialogueStrategy(createDefaultAdaptiveState(), {
      intent: resolved.overridePrimaryIntent,
    });
    expect(strategy).toBe('clarify_risk');

    const plan = planDialogueTurn({
      latestMessage: 'Yes.',
      primaryIntent: 'accept_teach_back',
      secondaryIntents: [],
      resolvedShortReply: resolved,
      state: createDefaultAdaptiveState(),
      transitionMetadata: {
        previousUnderstanding: 'uncertain',
        currentUnderstanding: 'uncertain',
        understandingChanged: false,
        previousEmotion: 'uncertain',
        currentEmotion: 'uncertain',
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
      strategy,
      previousAssistantDialogueAct: 'ask_understanding',
      pendingItem: {
        type: 'teach_back',
        text: 'restate the risk explanation in their own words',
        expectedReplyType: 'explanation',
      },
    });

    expect(plan.questionPurpose).toBe('teach_back');
    expect(plan.dialogueAct).toBe('ask_understanding');
  });

  it('plans a comprehension check (not automatic teach-back) after a fresh clarify_risk answer', () => {
    const plan = planDialogueTurn({
      latestMessage: 'What does five-year risk mean?',
      primaryIntent: 'explain_risk_horizon',
      secondaryIntents: [],
      resolvedShortReply: { isShortReply: false, shortReplyType: 'not_short_reply', requiresClarification: false },
      state: { ...createDefaultAdaptiveState(), understanding: 'uncertain' },
      transitionMetadata: {
        previousUnderstanding: 'uncertain',
        currentUnderstanding: 'uncertain',
        understandingChanged: false,
        previousEmotion: 'uncertain',
        currentEmotion: 'uncertain',
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
    });

    expect(plan.questionPurpose).toBe('comprehension');
    expect(plan.nextPendingItem?.type).toBe('comprehension_check');
    expect(plan.nextPendingItem?.expectedReplyType).toBe('affirmation');
  });
});
