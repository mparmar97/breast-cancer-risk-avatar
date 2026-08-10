import { describe, expect, it, vi } from 'vitest';
import { getTheoryConstruct } from '../worker/behavioral/theoryMap';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { generateDynamicResponse, type DynamicResponseInput } from '../worker/llm/generateDynamicResponse';
import { validateDialogueProgression } from '../worker/dialogue/validateDialogueProgression';
import { getMockRiskResult } from '../worker/mockRisk';
import type { Env } from '../worker/types';
import { NO_PENDING_ITEM } from '../worker/dialogue/types';

const envWithKey: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  GROQ_API_KEY: 'sk-test-key',
};

function groqFetchReturning(contentObj: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(contentObj) } }],
        model: 'openai/gpt-oss-20b',
      }),
      { status: 200 },
    ),
  );
}

describe('dynamic wording variation with stable purpose', () => {
  it('allows three distinct Groq wordings for the same draft-acceptance state', async () => {
    const memory = {
      ...createDefaultConversationMemory(),
      riskExplanationStatus: 'understood' as const,
      selectedCommunicationOption: 'written clinic message',
      draftStatus: 'accepted' as const,
      acceptedDraftText: 'Hello, I recently received a demonstration breast-cancer risk estimate...',
      plannedAction: 'send the drafted clinic message',
      resolvedIssues: ['risk_explanation', 'draft_wording'],
      unresolvedNeed: 'ask about timing or close supportively',
    };

    const dialogueTurnPlan = {
      primaryGoal: 'confirm_progress' as const,
      secondaryGoal: 'make the selected action specific',
      dialogueAct: 'confirm_progress' as const,
      mustAddress: [
        'the draft has been accepted',
        'the selected option is preserved',
        'the user now has a usable message',
      ],
      mustNotRepeat: ['full risk probability explanation', 'broad readiness exploration'],
      mustNotAssume: ['that the message has already been sent'],
      alreadyResolved: ['risk_explanation', 'draft_wording'],
      selectedOption: 'written clinic message',
      acceptedDraft: memory.acceptedDraftText,
      unresolvedNeed: 'ask about timing or close supportively',
      shouldAskQuestion: true,
      questionPurpose: 'action_planning' as const,
      nextPendingItem: {
        type: 'action_commitment' as const,
        text: 'when the user would like to send the accepted draft',
        expectedReplyType: 'open_response' as const,
      },
    };

    const decisionState = {
      ...createDefaultDecisionSupportState(),
      draftAccepted: true,
      draftStatus: 'accepted' as const,
      selectedOption: 'send the drafted clinic message',
      primaryDecisionalNeed: 'none' as const,
      decisionStage: 'planning_action' as const,
    };

    const baseInput: DynamicResponseInput = {
      latestMessage: 'That draft sounds clear.',
      recentConversation: [
        {
          role: 'assistant',
          content: 'Here is a short editable clinic-message draft. Would you like to revise any part of it?',
        },
      ],
      adaptiveState: {
        ...createDefaultAdaptiveState(),
        understanding: 'correct',
        readiness: 'preparing',
      },
      primaryIntent: 'confirm_proposed_action',
      strategy: 'confirm_progress',
      theoryConstruct: getTheoryConstruct('confirm_progress'),
      dialogueTurnPlan,
      decisionState,
      conversationMemory: memory,
      decisionSupportStrategy: 'confirm_selected_action',
      riskResult: getMockRiskResult('elevated'),
      retrievedEvidence: [],
      recentAssistantMessages: [
        'Here is a short editable clinic-message draft. Would you like to revise any part of it?',
      ],
    };

    const variants = [
      'The draft is ready to use. When would you like to send it?',
      'Good — you now have wording you can send as written. What timing works for you?',
      'Your clinic message is set and ready to use. When do you want to send it?',
    ];

    const replies: string[] = [];
    for (const wording of variants) {
      const result = await generateDynamicResponse(
        envWithKey,
        baseInput,
        groqFetchReturning({ reply: wording, usedEvidenceIds: [] }),
      );
      expect(result.responseMode).toBe('groq-dynamic-rag');
      replies.push(result.reply);

      const progression = validateDialogueProgression({
        reply: result.reply,
        latestMessage: 'That draft sounds clear.',
        plan: dialogueTurnPlan,
        transitionMetadata: {
          previousUnderstanding: 'correct',
          currentUnderstanding: 'correct',
          understandingChanged: false,
          previousEmotion: 'uncertain',
          currentEmotion: 'uncertain',
          previousBarrier: 'none',
          currentBarrier: 'none',
          barrierCleared: false,
          previousSelfEfficacy: 'moderate',
          currentSelfEfficacy: 'moderate',
          previousReadiness: 'preparing',
          currentReadiness: 'preparing',
          stateChanged: false,
          changedFields: [],
          barrierUnmentionedTurns: 0,
        },
        decisionState,
        conversationMemory: memory,
        primaryIntent: 'confirm_proposed_action',
        previousDialogueAct: 'plan_action',
      });

      expect(progression.primaryGoalSatisfied).toBe(true);
      expect(progression.unnecessaryReconsiderationDetected).toBe(false);
      expect(progression.selectedOptionPreserved).toBe(true);
      expect(result.reply).not.toMatch(/how do you currently feel about discussing/i);
      expect(result.reply).not.toMatch(/does not mean that you currently have/i);
      void NO_PENDING_ITEM;
    }

    expect(new Set(replies).size).toBe(3);
    expect(baseInput.strategy).toBe('confirm_progress');
    expect(dialogueTurnPlan.primaryGoal).toBe('confirm_progress');
  });
});
