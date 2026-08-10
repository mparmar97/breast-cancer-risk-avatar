import { describe, expect, it } from 'vitest';
import { selectDialogueStrategy } from '../worker/behavioral/policy';
import { classifyLocalStateDetailed } from '../worker/behavioral/localClassifier';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { transitionState } from '../worker/behavioral/transitionState';
import { planDialogueTurn } from '../worker/dialogue/planDialogueTurn';
import { resolvePendingDraft } from '../worker/dialogue/resolvePendingDraft';
import { resolveShortReply } from '../worker/dialogue/resolveShortReply';
import type { CurrentTurnInterpretation } from '../worker/dialogue/types';
import { validateDialogueProgression } from '../worker/dialogue/validateDialogueProgression';
import { generateLocalResponse } from '../worker/llm/localGenerator';
import { getMockRiskResult } from '../worker/mockRisk';

function interpretation(overrides: Partial<CurrentTurnInterpretation> = {}): CurrentTurnInterpretation {
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
    refersToPreviousAssistantTurn: false,
    shortReplyType: 'not_short_reply',
    confidence: 0.7,
    ...overrides,
  };
}

const emptyShort = { isShortReply: false, shortReplyType: 'not_short_reply' as const, requiresClarification: false };
const risk = getMockRiskResult('elevated');

describe('generalDynamicDialogue — greetings, drafts, next steps, closings', () => {
  it('treats "hi" as greeting without automatic risk explanation', () => {
    const local = classifyLocalStateDetailed('hi');
    expect(local.intent).toBe('greeting');

    const strategy = selectDialogueStrategy(local.state, { intent: 'greeting', emotionExpressedThisTurn: false });
    expect(strategy).toBe('greet_user');

    const plan = planDialogueTurn({
      latestMessage: 'hi',
      primaryIntent: 'greeting',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: local.state,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'greeting' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy,
    });

    expect(plan.primaryGoal).toBe('open_conversation');
    expect(plan.dialogueAct).toBe('greet_user');
    expect(plan.questionPurpose).toBe('invite_topic');

    const reply = generateLocalResponse({ strategy, state: local.state, riskResult: risk, evidence: [], primaryIntent: 'greeting' });
    expect(reply).not.toMatch(/probability|diagnosis|percentage|breast cancer over/i);
    expect(reply.toLowerCase()).toMatch(/hello|hi|welcome|guide/);
  });

  it('greeting does not inherit prior worry as an active emotion label', () => {
    const previous = createDefaultAdaptiveState();
    previous.emotion = 'worried';
    previous.barrier = 'access';

    const transition = transitionState({
      previousState: previous,
      interpretation: interpretation({
        primaryIntent: 'greeting',
        emotion: 'worried',
        barrier: 'access',
        currentTurnEvidence: {
          intent: 'greeting',
          understanding: 'not expressed',
          emotion: 'not expressed',
          barrier: 'not expressed',
          selfEfficacy: 'not expressed',
          readiness: 'not expressed',
          safetyFlag: 'not expressed',
        },
      }),
      resolvedShortReply: emptyShort,
      barrierUnmentionedTurns: 0,
    });

    expect(transition.state.emotion).toBe('uncertain');
    expect(transition.state.barrier).toBe('none');
  });

  it('routes draft-help requests to practical help with a proposed draft', () => {
    const paraphrases = [
      'I can send a portal message, but I don’t know what to write.',
      'can u help write message',
      'help me write a portal message',
    ];

    for (const message of paraphrases) {
      const local = classifyLocalStateDetailed(message);
      expect(local.intent, message).toBe('request_draft_help');

      const strategy = selectDialogueStrategy(local.state, { intent: 'request_draft_help' });
      expect(strategy, message).toBe('action_planning');

      const plan = planDialogueTurn({
        latestMessage: message,
        primaryIntent: 'request_draft_help',
        secondaryIntents: [],
        resolvedShortReply: emptyShort,
        state: local.state,
        transitionMetadata: transitionState({
          interpretation: interpretation({ primaryIntent: 'request_draft_help' }),
          resolvedShortReply: emptyShort,
          barrierUnmentionedTurns: 0,
        }).metadata,
        strategy,
      });

      expect(plan.primaryGoal, message).toBe('provide_practical_help');
      expect(plan.nextPendingItem?.type, message).toBe('proposed_draft');
      expect(plan.nextPendingItem?.draftText, message).toBeTruthy();

      const reply = generateLocalResponse({
        strategy,
        state: local.state,
        riskResult: risk,
        evidence: [],
        primaryIntent: 'request_draft_help',
      });
      expect(reply, message).toMatch(/draft|Hello,/i);
      expect(reply, message).not.toMatch(/in your own words/i);
    }
  });

  it('reviews a draft without restarting risk explanation', () => {
    const local = classifyLocalStateDetailed('Does this wording sound ok?');
    expect(local.intent).toBe('request_draft_review');

    const strategy = selectDialogueStrategy(local.state, { intent: 'request_draft_review' });
    expect(strategy).toBe('confirm_progress');

    const plan = planDialogueTurn({
      latestMessage: 'Does this wording sound ok?',
      primaryIntent: 'request_draft_review',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: local.state,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_review' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy,
      pendingItem: {
        type: 'proposed_draft',
        draftText: 'Hello, I recently received a demonstration estimate...',
        expectedReplyType: 'review_or_acceptance',
      },
    });

    expect(plan.primaryGoal).toBe('review_user_draft');
    expect(plan.dialogueAct).toBe('review_draft');

    const reply = generateLocalResponse({
      strategy,
      state: local.state,
      riskResult: risk,
      evidence: [],
      primaryIntent: 'request_draft_review',
    });
    expect(reply).toMatch(/clear/i);
    expect(reply).not.toMatch(/risk estimate describes probability/i);
  });

  it('prioritizes next-step over carried emotion', () => {
    const worried = createDefaultAdaptiveState();
    worried.emotion = 'worried';

    const strategy = selectDialogueStrategy(worried, {
      intent: 'request_next_step',
      emotionExpressedThisTurn: true,
    });
    expect(strategy).toBe('action_planning');
    expect(strategy).not.toBe('acknowledge_emotion');

    const plan = planDialogueTurn({
      latestMessage: 'I am worried. What should I do next?',
      primaryIntent: 'request_next_step',
      secondaryIntents: ['express_emotion'],
      resolvedShortReply: emptyShort,
      state: worried,
      transitionMetadata: transitionState({
        previousState: worried,
        interpretation: interpretation({
          primaryIntent: 'request_next_step',
          secondaryIntents: ['express_emotion'],
          emotion: 'worried',
          currentTurnEvidence: {
            intent: 'what should I do next',
            understanding: 'not expressed',
            emotion: 'I am worried',
            barrier: 'not expressed',
            selfEfficacy: 'not expressed',
            readiness: 'not expressed',
            safetyFlag: 'not expressed',
          },
        }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy,
    });

    expect(plan.primaryGoal).toBe('provide_practical_help');
    expect(plan.secondaryGoal).toMatch(/emotion/i);
  });

  it('closes supportively without new barrier exploration', () => {
    const local = classifyLocalStateDetailed('Thanks, that answers my question.');
    expect(local.intent).toBe('conversation_closing');

    const strategy = selectDialogueStrategy(local.state, { intent: 'conversation_closing' });
    expect(strategy).toBe('close_supportively');

    const plan = planDialogueTurn({
      latestMessage: 'Thanks, that answers my question.',
      primaryIntent: 'conversation_closing',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: local.state,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'conversation_closing' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy,
    });

    expect(plan.primaryGoal).toBe('close_supportively');
    expect(plan.shouldAskQuestion).toBe(false);
  });

  it('handles correction with a targeted clarification', () => {
    const local = classifyLocalStateDetailed("no thats not what i meant");
    expect(local.intent).toBe('correction');

    const strategy = selectDialogueStrategy(local.state, { intent: 'correction' });
    expect(strategy).toBe('ask_clarification');

    const plan = planDialogueTurn({
      latestMessage: "No, that is not what I meant.",
      primaryIntent: 'correction',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: local.state,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'correction' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy,
    });

    expect(plan.dialogueAct).toBe('ask_clarification');
    expect(plan.shouldAskQuestion).toBe(true);
  });

  it('resolves yes after a proposed draft as confirm_proposed_action', () => {
    const resolved = resolveShortReply('Yes.', {
      type: 'proposed_draft',
      draftText: 'Hello, I recently received...',
      expectedReplyType: 'review_or_acceptance',
    });
    expect(resolved.overridePrimaryIntent).toBe('confirm_proposed_action');
  });

  it('rejects a greeting reply that re-explains risk', () => {
    const plan = planDialogueTurn({
      latestMessage: 'hi',
      primaryIntent: 'greeting',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: createDefaultAdaptiveState(),
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'greeting' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy: 'greet_user',
    });

    const progression = validateDialogueProgression({
      reply:
        'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer. Does that help?',
      latestMessage: 'hi',
      plan,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'greeting' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
    });

    expect(progression.repeatedExplanationDetected).toBe(true);
    expect(progression.valid).toBe(false);
  });

  it('rejects generic action-planning wording when a draft was requested', () => {
    const plan = planDialogueTurn({
      latestMessage: 'I can send a portal message, but I don’t know what to write.',
      primaryIntent: 'request_draft_help',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: createDefaultAdaptiveState(),
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_help' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy: 'action_planning',
    });

    const bad = validateDialogueProgression({
      reply:
        'You have identified a possible next step. A healthcare professional can interpret the result using broader medical information. What action feels realistic for you?',
      latestMessage: 'I can send a portal message, but I don’t know what to write.',
      plan,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_help' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
    });
    expect(bad.practicalRequestFulfilled).toBe(false);
    expect(bad.valid).toBe(false);

    const goodReply = generateLocalResponse({
      strategy: 'action_planning',
      state: createDefaultAdaptiveState(),
      riskResult: risk,
      evidence: [],
      primaryIntent: 'request_draft_help',
      dialogueTurnPlan: plan,
    });
    const good = validateDialogueProgression({
      reply: goodReply,
      latestMessage: 'I can send a portal message, but I don’t know what to write.',
      plan,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_help' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
    });
    expect(good.practicalRequestFulfilled).toBe(true);
    expect(good.valid).toBe(true);
  });

  it('recognizes a pasted proposed draft as draft review', () => {
    const draftText =
      'Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it with my personal and family history. Please advise whether a discussion would be appropriate.';
    const resolved = resolvePendingDraft(draftText, {
      type: 'proposed_draft',
      draftText,
      expectedReplyType: 'review_or_acceptance',
    });
    expect(resolved.isDraftContext).toBe(true);
    expect(resolved.overridePrimaryIntent).toBe('request_draft_review');

    const strategy = selectDialogueStrategy(createDefaultAdaptiveState(), {
      intent: 'request_draft_review',
    });
    expect(strategy).toBe('confirm_progress');

    const reply = generateLocalResponse({
      strategy,
      state: createDefaultAdaptiveState(),
      riskResult: risk,
      evidence: [],
      primaryIntent: 'request_draft_review',
    });
    expect(reply).toMatch(/wording is clear|clear and appropriate/i);
    expect(reply).not.toMatch(/how do you currently feel about discussing/i);
  });

  it('rejects confirm-progress wording when reviewing a draft', () => {
    const plan = planDialogueTurn({
      latestMessage: 'Does this wording sound ok?',
      primaryIntent: 'request_draft_review',
      secondaryIntents: [],
      resolvedShortReply: emptyShort,
      state: createDefaultAdaptiveState(),
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_review' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
      strategy: 'confirm_progress',
      pendingItem: {
        type: 'proposed_draft',
        draftText: 'Hello, I recently received a demonstration estimate...',
        expectedReplyType: 'review_or_acceptance',
      },
    });

    const bad = validateDialogueProgression({
      reply: 'Glad that is clearer. What part of the result would you like to discuss next?',
      latestMessage: 'Does this wording sound ok?',
      plan,
      transitionMetadata: transitionState({
        interpretation: interpretation({ primaryIntent: 'request_draft_review' }),
        resolvedShortReply: emptyShort,
        barrierUnmentionedTurns: 0,
      }).metadata,
    });
    expect(bad.practicalRequestFulfilled).toBe(false);
    expect(bad.valid).toBe(false);
  });
});
