import { describe, expect, it } from 'vitest';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { deriveResponsePlan } from '../worker/dialogue/deriveResponsePlan';
import {
  createDefaultConversationMemory,
  type ConversationMemory,
} from '../worker/dialogue/conversationMemory';
import { updateConversationMemory } from '../worker/dialogue/updateConversationMemory';
import { validateResponseSemantics } from '../worker/dialogue/validateResponseSemantics';
import { generatePlanAwareFallback } from '../worker/llm/planAwareFallback';
import { getMockRiskResult } from '../worker/mockRisk';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { orchestrateDialogueTurn } from '../worker/orchestration/orchestrateDialogueTurn';
import type { Env } from '../worker/types';

const risk = getMockRiskResult('elevated');

const env: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
};

const TIME_BARRIER_PARAPHRASES = [
  'I understand the result, but I would find it difficult to call during work.',
  'I understand it, but I cannot call while I am at work.',
  'The number makes sense. Calling during business hours is the problem.',
  'I get the result, but my work schedule makes phone calls difficult.',
  'I understand the percentage. I cannot make calls during the day.',
  'Calling is hard because I am working.',
];

describe('time barrier after risk understanding — paraphrases', () => {
  it.each(TIME_BARRIER_PARAPHRASES)('classifies practical time barrier: %s', (message) => {
    const turn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    expect(turn.topic).toBe('communication_support');
    expect(turn.primaryOperation).toBe('address_barrier');
    expect(turn.barrier).toBe('time');
    expect(turn.emotion).toBe('not_expressed');
    expect(turn.requiresMedicalEvidence).toBe(false);
    if (/\bunderstand|makes sense|i get\b/i.test(message)) {
      expect(turn.understanding).toBe('correct');
    }
    expect(turn.currentTurnEvidence.barrier.toLowerCase()).toMatch(
      /call|work|schedule|business|day|difficult|hard/,
    );

    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: {
        ...createDefaultConversationMemory(),
        riskExplanationStatus: 'understood',
        understoodConcepts: [
          'approximate natural-frequency meaning',
          'five-year time horizon',
          'probability rather than certainty',
        ],
        resolvedIssues: ['risk meaning', 'natural-frequency explanation'],
      },
      riskResult: risk,
    });
    expect(plan.primaryGoal).toMatch(/address_time_barrier|address_practical_barrier/);
    expect(plan.mustNotDo.join(' ')).toMatch(/risk explanation|3 out of 100|understand the result/i);
    expect(plan.shouldAskQuestion).toBe(true);
  });
});

describe('time barrier after risk understanding — multi-turn', () => {
  it('moves from natural-frequency explanation to time-barrier help without repeating risk content', async () => {
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let previousMemory: ConversationMemory | undefined;
    let previousState = createDefaultAdaptiveState();
    let previousDecision = createDefaultDecisionSupportState();

    const turn1 = await orchestrateDialogueTurn(env, {
      latestMessage: 'Explain 3.2% as people out of 100.',
      recentConversation: history,
      riskResult: risk,
      previousAdaptiveState: previousState,
      previousDecisionState: previousDecision,
      previousConversationMemory: previousMemory,
    });
    expect(turn1.response).toMatch(/out of\s*100/i);
    history.push(
      { role: 'user', content: 'Explain 3.2% as people out of 100.' },
      { role: 'assistant', content: turn1.response },
    );
    previousMemory = turn1.conversationMemory;
    previousState = turn1.adaptiveState;
    previousDecision = turn1.decisionState;

    const turn2 = await orchestrateDialogueTurn(env, {
      latestMessage: 'So about 3 out of 100 over five years?',
      recentConversation: history,
      riskResult: risk,
      previousAdaptiveState: previousState,
      previousDecisionState: previousDecision,
      previousConversationMemory: previousMemory,
      previousAssistantDialogueAct: turn1.dialogueTurnPlan.dialogueAct,
      pendingConversationItem: turn1.dialogueTurnPlan.nextPendingItem,
    });
    expect(turn2.adaptiveState.understanding === 'correct' || turn2.semanticTurn?.understanding === 'correct').toBe(
      true,
    );
    history.push(
      { role: 'user', content: 'So about 3 out of 100 over five years?' },
      { role: 'assistant', content: turn2.response },
    );
    previousMemory = turn2.conversationMemory;
    previousState = turn2.adaptiveState;
    previousDecision = turn2.decisionState;

    const barrierMessage =
      'I understand the result, but I would find it difficult to call during work.';
    const turn3 = await orchestrateDialogueTurn(env, {
      latestMessage: barrierMessage,
      recentConversation: history,
      riskResult: risk,
      previousAdaptiveState: previousState,
      previousDecisionState: previousDecision,
      previousConversationMemory: previousMemory,
      previousAssistantDialogueAct: turn2.dialogueTurnPlan.dialogueAct,
      pendingConversationItem: turn2.dialogueTurnPlan.nextPendingItem,
    });

    expect(turn3.semanticTurn?.topic).toBe('communication_support');
    expect(turn3.semanticTurn?.primaryOperation).toBe('address_barrier');
    expect(turn3.semanticTurn?.barrier).toBe('time');
    expect(turn3.semanticTurn?.understanding).toBe('correct');
    expect(turn3.semanticTurn?.emotion).toBe('not_expressed');
    expect(turn3.finalPrimaryIntent).toBe('describe_barrier');
    expect(turn3.dialogueStrategy).toBe('explore_barrier');
    expect(turn3.responsePlan?.primaryGoal).toMatch(
      /address_time_barrier|address_practical_barrier|address calling-during-work barrier/i,
    );

    expect(turn3.conversationMemory.riskExplanationStatus).toBe('understood');
    expect(turn3.conversationMemory.currentBarrier).toBe('time');
    expect(turn3.conversationMemory.currentBarrierContext).toMatch(/calling during work/i);
    expect(turn3.conversationMemory.unresolvedNeed).toMatch(/communication method|work schedule/i);

    expect(turn3.response).not.toMatch(/\b3\s+out of\s+100\b/i);
    expect(turn3.response).not.toMatch(/does not mean that you currently have/i);
    expect(turn3.response).not.toMatch(/in your own words/i);
    expect(turn3.response).toMatch(/call|work|schedule|written|write|portal|time/i);

    const validation = validateResponseSemantics({
      reply: turn3.response,
      semanticTurn: turn3.semanticTurn!,
      plan: turn3.responsePlan!,
      conversationMemory: turn3.conversationMemory,
    });
    expect(validation.currentBarrierAddressed).toBe(true);
    expect(validation.resolvedRiskExplanationRepeated).toBe(false);
    expect(validation.currentTurnPriorityPreserved).toBe(true);
    expect(validation.unsupportedEmotionDetected).toBe(false);
    expect(validation.dialogueAdvanced).toBe(true);
  });

  it('memory marks risk understood and activates calling-during-work barrier need', () => {
    const message =
      'I understand the result, but I would find it difficult to call during work.';
    const turn = interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
    const memory = updateConversationMemory({
      latestMessage: message,
      interpretation: {
        primaryIntent: 'describe_barrier',
        secondaryIntents: [],
        understanding: 'correct',
        emotion: 'uncertain',
        barrier: 'time',
        selfEfficacy: 'moderate',
        readiness: 'preparing',
        safetyFlag: 'none',
        currentTurnEvidence: {
          intent: 'describe_barrier',
          understanding: 'I understand the result',
          emotion: 'not expressed',
          barrier: 'difficult to call during work',
          selfEfficacy: 'not expressed',
          readiness: 'not expressed',
          safetyFlag: 'none',
        },
        refersToPreviousAssistantTurn: false,
        shortReplyType: 'not_short_reply',
        confidence: 0.9,
      },
      primaryIntent: 'describe_barrier',
      resolvedShortReply: {
        isShortReply: false,
        shortReplyType: 'not_short_reply',
        requiresClarification: false,
      },
      adaptiveTransition: {
        previousUnderstanding: 'correct',
        currentUnderstanding: 'correct',
        understandingChanged: false,
        previousEmotion: 'uncertain',
        currentEmotion: 'uncertain',
        previousBarrier: 'none',
        currentBarrier: 'time',
        barrierCleared: false,
        previousSelfEfficacy: 'moderate',
        currentSelfEfficacy: 'moderate',
        previousReadiness: 'preparing',
        currentReadiness: 'preparing',
        stateChanged: true,
        changedFields: ['barrier'],
        barrierUnmentionedTurns: 0,
      },
      decisionState: createDefaultDecisionSupportState(),
      decisionTransition: {
        previousNeed: 'none',
        currentNeed: 'none',
        previousStage: 'not_started',
        currentStage: 'not_started',
        previousSelectedOption: null,
        currentSelectedOption: null,
        selectedOptionPreserved: true,
        informationNeedResolvedThisTurn: false,
        decisionDeferredThisTurn: false,
        actionConfirmedThisTurn: false,
        draftAcceptedThisTurn: false,
        draftStatus: 'none',
        decisionNeedResolved: false,
        unnecessaryReconsiderationDetected: false,
        changedFields: [],
        stateChanged: false,
      },
      previousMemory: {
        ...createDefaultConversationMemory(),
        riskExplanationStatus: 'understood',
        understoodConcepts: ['approximate natural-frequency meaning'],
        resolvedIssues: ['risk meaning'],
      },
    });

    expect(memory.riskExplanationStatus).toBe('understood');
    expect(memory.currentBarrier).toBe('time');
    expect(memory.currentBarrierContext).toBe('calling during work');
    expect(memory.unresolvedNeed).toMatch(/work schedule|communication method/i);
    expect(turn.explicitRequest).toMatch(/calling during work/i);
  });

  it('plan-aware fallback addresses calling barrier without natural frequency', () => {
    const turn = interpretSemanticTurnLocal({
      latestMessage:
        'I understand the result, but I would find it difficult to call during work.',
      riskResult: risk,
    });
    const plan = deriveResponsePlan({
      semanticTurn: turn,
      conversationMemory: createDefaultConversationMemory(),
      riskResult: risk,
    });
    const reply = generatePlanAwareFallback({
      semanticTurn: turn,
      plan,
      riskResult: risk,
    });
    expect(reply).toMatch(/call|work|written|write/i);
    expect(reply).not.toMatch(/\b3\s+out of\s+100\b/i);
    const validation = validateResponseSemantics({
      reply,
      semanticTurn: turn,
      plan,
    });
    expect(validation.currentBarrierAddressed).toBe(true);
    expect(validation.resolvedRiskExplanationRepeated).toBe(false);
    expect(validation.dialogueAdvanced).toBe(true);
  });
});
