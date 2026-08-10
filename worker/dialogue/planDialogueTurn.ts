import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState, Intent } from '../behavioral/state';
import type { StateTransitionMetadata } from '../behavioral/transitionState';
import type { ConversationMemory } from './conversationMemory';
import { createDefaultConversationMemory } from './conversationMemory';
import type { RequestInterpretation } from './currentTurnInterpretation';
import { deriveResponsePlan } from './deriveResponsePlan';
import type { ResolvedShortReply } from './resolveShortReply';
import { detectSemanticFeatures } from './semanticTurn';
import {
  NO_PENDING_ITEM,
  type AssistantDialogueAct,
  type DialogueTurnPlan,
  type PendingConversationItem,
} from './types';
import type { RiskResult } from '../types';

import { isClosingUtterance } from './closingSignals';

function isClosingMessage(message: string): boolean {
  return isClosingUtterance(message);
}

export interface PlanDialogueTurnInput {
  latestMessage: string;
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  resolvedShortReply: ResolvedShortReply;
  state: AdaptiveState;
  transitionMetadata: StateTransitionMetadata;
  strategy: DialogueStrategy;
  previousAssistantDialogueAct?: AssistantDialogueAct;
  pendingItem?: PendingConversationItem;
  actionTiming?: string | null;
  draftStatus?: string;
  conversationMemory?: ConversationMemory;
  requestInterpretation?: RequestInterpretation;
  riskResult?: RiskResult;
  theoryConstruct?: { theory: string; construct: string; objective: string };
}

const BASE_MUST_NOT_ASSUME: readonly string[] = [
  'that the user has already scheduled an appointment or contacted anyone',
  'that the user has a patient portal or an existing clinician relationship',
  'that the user has selected a specific action they did not mention',
  'that an appointment is required',
  'that the demonstration estimate is a clinically validated personal result',
];

const DEFAULT_PORTAL_DRAFT =
  'Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it in the context of my personal and family history. Please advise whether a discussion would be appropriate. Thank you.';

function secondaryGoalFor(secondaryIntents: Intent[]): string | undefined {
  if (secondaryIntents.includes('express_emotion')) {
    return 'briefly acknowledge the emotion expressed alongside the primary request';
  }
  if (secondaryIntents.includes('express_ambivalence')) {
    return 'acknowledge the mixed feelings expressed alongside the primary request';
  }
  if (secondaryIntents.length > 0) {
    return `also be responsive to: ${secondaryIntents.join(', ')}`;
  }
  return undefined;
}

function memoryDefaults(memory: ConversationMemory): Pick<
  DialogueTurnPlan,
  'mustNotRepeat' | 'alreadyResolved' | 'selectedOption' | 'acceptedDraft' | 'unresolvedNeed'
> {
  const mustNotRepeat = [...memory.resolvedIssues];
  if (memory.riskExplanationStatus === 'understood') {
    mustNotRepeat.push('full risk probability explanation');
  }
  if (memory.selectedCommunicationOption) {
    mustNotRepeat.push('asking which communication option to choose');
  }
  if (memory.draftStatus === 'accepted') {
    mustNotRepeat.push('draft wording review', 'broad readiness exploration');
  }
  if (memory.plannedTiming) {
    mustNotRepeat.push('asking when the user will act');
  }
  if (memory.lastAssistantDialogueAct && memory.lastAssistantDialogueAct !== 'none') {
    mustNotRepeat.push(`same dialogue act as last turn: ${memory.lastAssistantDialogueAct}`);
  }

  return {
    mustNotRepeat,
    alreadyResolved: [...memory.resolvedIssues],
    selectedOption: memory.selectedCommunicationOption,
    acceptedDraft: memory.acceptedDraftText,
    unresolvedNeed: memory.unresolvedNeed,
  };
}

function finish(
  plan: Omit<DialogueTurnPlan, 'mustNotRepeat' | 'alreadyResolved'> &
    Partial<Pick<DialogueTurnPlan, 'mustNotRepeat' | 'alreadyResolved' | 'selectedOption' | 'acceptedDraft' | 'unresolvedNeed'>>,
  memory: ConversationMemory,
): DialogueTurnPlan {
  const defaults = memoryDefaults(memory);
  return {
    ...plan,
    mustNotRepeat: plan.mustNotRepeat ?? defaults.mustNotRepeat,
    alreadyResolved: plan.alreadyResolved ?? defaults.alreadyResolved,
    selectedOption: plan.selectedOption ?? defaults.selectedOption,
    acceptedDraft: plan.acceptedDraft ?? defaults.acceptedDraft,
    unresolvedNeed: plan.unresolvedNeed ?? defaults.unresolvedNeed,
  };
}

function planFromRequestInterpretation(
  interpretation: RequestInterpretation,
  memory: ConversationMemory,
  mustNotAssume: string[],
): DialogueTurnPlan | null {
  const base = {
    topic: interpretation.topic,
    primaryOperation: interpretation.operation,
    secondaryOperations: interpretation.secondaryOperations,
    explicitRequest: interpretation.explicitRequest,
    requestedOutputFormat: interpretation.requestedOutputFormat,
    requiresEvidence: interpretation.requiresMedicalEvidence,
    requiresCalculation: interpretation.requiresCalculation,
    alreadyKnown: [...memory.resolvedIssues],
  };

  switch (interpretation.operation) {
    case 'convert':
      return finish(
        {
          ...base,
          primaryGoal: 'convert risk value into natural frequency',
          dialogueAct: 'explain_information',
          mustAddress: [
            'approximate numerator and denominator',
            'correct time horizon',
            'probabilistic wording',
          ],
          mustNotDo: [
            'provide only a generic risk definition',
            'ask whether the user understands before doing the conversion',
          ],
          mustNotAssume,
          shouldAskQuestion: false,
          questionPurpose: 'none',
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    case 'verify_understanding':
      return finish(
        {
          ...base,
          primaryGoal: 'confirm_understanding',
          dialogueAct: 'confirm_progress',
          mustAddress: ['acknowledge the user correctly restated or understood the estimate'],
          mustNotDo: ['repeat the full prior risk explanation', 'ask another comprehension check'],
          mustNotAssume,
          shouldAskQuestion: false,
          questionPurpose: 'none',
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    case 'compare':
      return finish(
        {
          ...base,
          primaryGoal: 'compare the requested concepts',
          dialogueAct: 'explain_information',
          mustAddress: ['definition of each concept', 'important difference'],
          mustNotDo: ['explain only one concept', 'provide unrelated next-step advice'],
          mustNotAssume,
          shouldAskQuestion: false,
          questionPurpose: 'none',
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    case 'list_information':
      return finish(
        {
          ...base,
          primaryGoal: 'answer_question',
          dialogueAct: 'explain_information',
          mustAddress: interpretation.secondaryOperations.includes('identify_limitation')
            ? ['calculator input information', 'important factors the calculator might not include']
            : ['calculator input information'],
          mustNotDo: ['generic risk definition without listing inputs'],
          mustNotAssume,
          shouldAskQuestion: false,
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    case 'explain':
      if (interpretation.topic === 'calculator_limitations') {
        return finish(
          {
            ...base,
            primaryGoal: 'answer_question',
            dialogueAct: 'explain_information',
            mustAddress: ['why a population probability cannot predict one individual outcome'],
            mustNotDo: ['restart a generic percentage definition without answering the limitation'],
            mustNotAssume,
            shouldAskQuestion: false,
            nextPendingItem: NO_PENDING_ITEM,
          },
          memory,
        );
      }
      return null;
    case 'draft':
    case 'revise':
      return finish(
        {
          ...base,
          primaryGoal: 'provide_practical_help',
          dialogueAct: 'plan_action',
          mustAddress: [
            'requested draft content',
            ...(interpretation.secondaryOperations.includes('shorten') || /short/i.test(interpretation.explicitRequest)
              ? ['requested length']
              : []),
            ...(interpretation.secondaryOperations.includes('change_tone') || /formal/i.test(interpretation.explicitRequest)
              ? ['requested tone']
              : []),
          ],
          mustNotDo: [
            'create an unrelated new draft that ignores constraints',
            'return to risk explanation',
            'ask what the user wants changed when they already specified it',
          ],
          mustNotAssume,
          shouldAskQuestion: false,
          nextPendingItem: {
            type: 'proposed_draft',
            text: 'editable portal message draft',
            draftText: DEFAULT_PORTAL_DRAFT,
            draftPurpose: 'ask a clinic to help interpret a demonstration risk estimate',
            expectedReplyType: 'review_or_acceptance',
          },
        },
        memory,
      );
    case 'provide_options':
      return finish(
        {
          ...base,
          primaryGoal: 'provide_practical_help',
          secondaryGoal: interpretation.secondaryOperations.includes('acknowledge')
            ? 'briefly acknowledge concern'
            : undefined,
          dialogueAct: 'plan_action',
          mustAddress: ['neutral general next-step options'],
          mustNotDo: ['let prior emotion replace the next-step answer'],
          mustNotAssume,
          shouldAskQuestion: true,
          questionPurpose: 'action_planning',
          nextPendingItem: {
            type: 'multiple_options',
            text: 'which optional next step feels most manageable',
            expectedReplyType: 'choice',
          },
        },
        memory,
      );
    case 'plan_action':
      return finish(
        {
          ...base,
          primaryGoal: 'make_action_specific',
          dialogueAct: 'plan_action',
          mustAddress: ['one simple place to start'],
          mustNotDo: ['provide a multi-item list when one step was requested'],
          mustNotAssume,
          shouldAskQuestion: false,
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    default:
      return null;
  }
}

/**
 * Deterministically decides what the *next* response must accomplish
 * from conversation memory and the current turn — without writing wording.
 */
export function planDialogueTurn(input: PlanDialogueTurnInput): DialogueTurnPlan {
  const { primaryIntent, secondaryIntents, resolvedShortReply, state, transitionMetadata, strategy } = input;
  const memory = input.conversationMemory ?? createDefaultConversationMemory();
  const secondaryGoal = secondaryGoalFor(secondaryIntents);
  const mustNotAssume = [...BASE_MUST_NOT_ASSUME];
  const timingKnown = Boolean(input.actionTiming || memory.plannedTiming);
  const optionSelected = Boolean(memory.selectedCommunicationOption);
  const draftAccepted = memory.draftStatus === 'accepted' || input.draftStatus === 'accepted';

  if (strategy === 'safety_boundary' || strategy === 'urgent_referral') {
    return finish(
      {
        primaryGoal: 'maintain_safety',
        dialogueAct: 'fixed_safety',
        mustAddress: [`safety flag: ${state.safetyFlag}`],
        mustNotAssume: ['that a fixed safety response can be replaced by dynamic wording'],
        shouldAskQuestion: false,
        nextPendingItem: NO_PENDING_ITEM,
      },
      memory,
    );
  }

  // Latest explicit request / semantic plan takes priority over carried emotion.
  if (input.requestInterpretation?.semanticTurn) {
    let semanticTurn = input.requestInterpretation.semanticTurn;
    // Fitness / motivational-guide asks must not collapse into short-reply clarification.
    if (
      detectSemanticFeatures(input.latestMessage).asksLifestyleFocus &&
      semanticTurn.topic !== 'lifestyle_risk_information' &&
      (semanticTurn.requiresClarification ||
        semanticTurn.topic === 'unclear' ||
        semanticTurn.primaryOperation === 'request_clarification' ||
        !semanticTurn.directAnswerRequired)
    ) {
      semanticTurn = {
        ...semanticTurn,
        topic: 'lifestyle_risk_information',
        primaryOperation: 'answer_general_health_question',
        secondaryOperations: ['explain_lifestyle_relationship', 'set_personalized_advice_boundary'],
        explicitRequest:
          'Answer the general lifestyle/exercise/health question with population-level information and a personalized-advice boundary.',
        directAnswerRequired: true,
        requiresClarification: false,
        requiresMedicalEvidence: true,
        requiresSafetyBoundary: false,
        confidence: Math.max(semanticTurn.confidence, 0.9),
      };
    }
    const responsePlan = deriveResponsePlan({
      semanticTurn,
      conversationMemory: memory,
      riskResult: input.riskResult ?? {
        model: 'Mock Demonstration Calculator',
        fiveYearRisk: 3.2,
        riskHorizon: '5 years',
        riskBranch: 'elevated',
        disclaimer: 'Demonstration result only.',
      },
      adaptiveState: state,
      theoryConstruct: input.theoryConstruct as never,
      // Safety strategies already returned above; semantic turn may still flag a boundary.
      safetyOverride: false,
    });
    const op = input.requestInterpretation.operation;
    const semanticOp = semanticTurn.primaryOperation;
    // Only create/revise turns leave a proposed_draft pending item.
    // Confirm/reject on message_drafting must not reopen draft proposal.
    const needsProposedDraftPending =
      op === 'draft' || op === 'revise' || semanticOp === 'revise';

    return finish(
      {
        primaryGoal: responsePlan.primaryGoal,
        secondaryGoal: responsePlan.secondaryGoals[0] ?? secondaryGoal,
        dialogueAct: (responsePlan.dialogueAct as AssistantDialogueAct) ?? 'explain_information',
        topic: responsePlan.topic,
        primaryOperation: semanticOp ?? responsePlan.primaryOperation,
        secondaryOperations:
          semanticTurn.secondaryOperations ??
          input.requestInterpretation.secondaryOperations ??
          responsePlan.secondaryOperations,
        explicitRequest: responsePlan.explicitRequest,
        requestedOutputFormat: responsePlan.responseStyle.requestedFormat,
        mustAddress: responsePlan.mustAddress,
        optionalDetails: responsePlan.optionalDetails,
        mustNotDo: responsePlan.mustNotDo,
        mustNotAssume,
        requiresEvidence:
          semanticTurn.requiresMedicalEvidence ||
          input.requestInterpretation.requiresMedicalEvidence,
        requiresCalculation: input.requestInterpretation.requiresCalculation,
        shouldAskQuestion: responsePlan.shouldAskQuestion,
        questionPurpose: (responsePlan.questionPurpose as never) ?? 'none',
        nextPendingItem: needsProposedDraftPending
          ? {
              type: 'proposed_draft',
              text: 'editable portal message draft',
              draftText: DEFAULT_PORTAL_DRAFT,
              draftPurpose: 'ask a clinic to help interpret a demonstration risk estimate',
              expectedReplyType: 'review_or_acceptance',
            }
          : responsePlan.shouldAskQuestion && responsePlan.questionPurpose === 'timing'
            ? {
                type: 'action_commitment',
                text: 'when the user would like to send the accepted draft',
                expectedReplyType: 'open_response',
              }
            : responsePlan.shouldAskQuestion
              ? {
                  type: 'question',
                  text: responsePlan.questionPurpose ?? 'follow-up',
                  expectedReplyType: 'open_response',
                }
              : NO_PENDING_ITEM,
      },
      memory,
    );
  }

  if (input.requestInterpretation) {
    const operationPlan = planFromRequestInterpretation(input.requestInterpretation, memory, mustNotAssume);
    if (operationPlan) return operationPlan;
  }

  const practicalPrimary =
    primaryIntent === 'request_draft_help' ||
    primaryIntent === 'request_draft_review' ||
    primaryIntent === 'request_next_step' ||
    primaryIntent === 'confirm_proposed_action' ||
    primaryIntent === 'confirm_action';

  if (resolvedShortReply.isShortReply && resolvedShortReply.requiresClarification && !practicalPrimary) {
    return finish(
      {
        primaryGoal: 'clarify_short_reply',
        dialogueAct: 'ask_clarification',
        mustAddress: ['the user gave a short or ambiguous reply without enough context to resolve it safely'],
        mustNotAssume: [
          ...mustNotAssume,
          'that the short reply confirmed the most recently discussed topic',
        ],
        shouldAskQuestion: true,
        questionPurpose: 'clarification',
        nextPendingItem: {
          type: 'question',
          text: 'what the user meant by their last reply',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  if (
    primaryIntent === 'conversation_closing' ||
    strategy === 'close_supportively' ||
    isClosingMessage(input.latestMessage)
  ) {
    return finish(
      {
        primaryGoal: 'close_supportively',
        dialogueAct: 'close_conversation',
        mustAddress: ['the user indicated the conversation answered their question or is finished'],
        mustNotAssume: [...mustNotAssume, 'that a new barrier or action needs to be raised'],
        unresolvedNeed: undefined,
        shouldAskQuestion: false,
        nextPendingItem: NO_PENDING_ITEM,
      },
      memory,
    );
  }

  // Timing / action already committed — acknowledge the specific plan.
  if (
    primaryIntent === 'confirm_action' ||
    (timingKnown && draftAccepted && /\b(send|tonight|today|tomorrow|after work)\b/i.test(input.latestMessage))
  ) {
    return finish(
      {
        primaryGoal: 'confirm_progress',
        dialogueAct: 'confirm_progress',
        resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
        mustAddress: [
          'acknowledge the specific planned action',
          memory.plannedTiming ? `timing already chosen: ${memory.plannedTiming}` : 'the user confirmed a next step',
        ],
        mustNotAssume: [
          ...mustNotAssume,
          'that the user still needs to choose an action',
          'that timing is still unknown',
          'that readiness still needs exploration',
        ],
        unresolvedNeed: 'acknowledge the specific plan or close supportively',
        shouldAskQuestion: false,
        nextPendingItem: NO_PENDING_ITEM,
      },
      memory,
    );
  }

  if (primaryIntent === 'greeting' || primaryIntent === 'social_acknowledgment' || strategy === 'greet_user') {
    return finish(
      {
        primaryGoal: 'open_conversation',
        dialogueAct: 'greet_user',
        mustAddress: ['welcome the user briefly as an educational demonstration guide'],
        mustNotAssume: [
          ...mustNotAssume,
          'confusion',
          'worry',
          'a barrier',
          'a request for medical advice',
        ],
        shouldAskQuestion: true,
        questionPurpose: 'invite_topic',
        nextPendingItem: {
          type: 'question',
          text: 'what the user would like to discuss about the demonstration result',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'correction' || strategy === 'ask_clarification') {
    return finish(
      {
        primaryGoal: 'clarify_short_reply',
        dialogueAct: 'ask_clarification',
        mustAddress: ['the user corrected the previous interpretation'],
        mustNotAssume: [...mustNotAssume, 'that repeating the previous answer will help'],
        shouldAskQuestion: true,
        questionPurpose: 'clarification',
        nextPendingItem: {
          type: 'question',
          text: 'what the user meant instead',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'request_draft_help') {
    return finish(
      {
        primaryGoal: 'provide_practical_help',
        secondaryGoal,
        dialogueAct: 'plan_action',
        mustAddress: [
          optionSelected
            ? `preserve the selected communication option: ${memory.selectedCommunicationOption}`
            : 'the user can access a portal or messaging channel',
          'provide an editable draft the user can adapt',
        ],
        mustNotAssume: [
          ...mustNotAssume,
          'that the user is uncertain about which channel to use',
          'that the user wants another readiness question',
        ],
        unresolvedNeed: 'provide an editable draft',
        shouldAskQuestion: true,
        questionPurpose: 'action_planning',
        nextPendingItem: {
          type: 'proposed_draft',
          text: 'editable portal message draft',
          draftText: DEFAULT_PORTAL_DRAFT,
          draftPurpose: 'ask a clinic to help interpret a demonstration risk estimate',
          expectedReplyType: 'review_or_acceptance',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'confirm_proposed_action') {
    return finish(
      {
        primaryGoal: 'confirm_progress',
        secondaryGoal: timingKnown ? 'summarize the selected plan' : 'make the selected action specific',
        dialogueAct: timingKnown ? 'plan_action' : 'confirm_progress',
        resolvedUserDevelopment:
          resolvedShortReply.resolvedMeaning ?? 'The user accepts the proposed draft.',
        mustAddress: [
          'the draft has been accepted',
          'the selected option is preserved',
          'the user now has a usable message',
        ],
        mustNotAssume: [
          ...mustNotAssume,
          'that the message has already been sent',
          'that an appointment is required',
          'that the clinic has reviewed the result',
          'that the user is emotionally ready',
          'that the user wants to reconsider the decision',
        ],
        unresolvedNeed: timingKnown
          ? 'summarize the selected plan or close supportively'
          : 'ask about timing or close supportively',
        shouldAskQuestion: !timingKnown,
        questionPurpose: 'action_planning',
        nextPendingItem: timingKnown
          ? NO_PENDING_ITEM
          : {
              type: 'action_commitment',
              text: 'when the user would like to send the accepted draft',
              expectedReplyType: 'open_response',
            },
      },
      memory,
    );
  }

  if (primaryIntent === 'request_draft_review') {
    return finish(
      {
        primaryGoal: 'review_user_draft',
        secondaryGoal,
        dialogueAct: 'review_draft',
        resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
        mustAddress: ["whether the user's draft wording is clear and appropriate"],
        mustNotAssume: [
          ...mustNotAssume,
          'that the draft has already been sent',
          'that the draft is a new emotional disclosure',
        ],
        shouldAskQuestion: true,
        questionPurpose: 'action_planning',
        nextPendingItem: {
          type: 'action_commitment',
          text: 'whether the user wants to send or revise the draft',
          expectedReplyType: 'affirmation',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'request_next_step') {
    if (optionSelected) {
      return finish(
        {
          primaryGoal: 'provide_practical_help',
          secondaryGoal,
          dialogueAct: 'plan_action',
          mustAddress: [
            `preserve the already selected option: ${memory.selectedCommunicationOption}`,
            'help the user act on the selected communication approach',
          ],
          mustNotAssume: [
            ...mustNotAssume,
            'that the user still needs to choose among basic contact options',
          ],
          unresolvedNeed: 'help with the selected written or phone follow-up',
          shouldAskQuestion: true,
          questionPurpose: 'action_planning',
          nextPendingItem: {
            type: 'question',
            text: 'whether draft help would be useful for the selected option',
            expectedReplyType: 'affirmation',
          },
        },
        memory,
      );
    }

    return finish(
      {
        primaryGoal: 'provide_practical_help',
        secondaryGoal,
        dialogueAct: 'plan_action',
        mustAddress: ['a general, non-individualized next-step outline the user may choose'],
        mustNotAssume,
        unresolvedNeed: 'provide neutral general follow-up options',
        shouldAskQuestion: true,
        questionPurpose: 'action_planning',
        nextPendingItem: {
          type: 'multiple_options',
          text: 'which optional next step feels most manageable',
          expectedReplyType: 'choice',
        },
      },
      memory,
    );
  }

  // Option just selected — preserve it; offer drafting help rather than re-ask.
  if (
    optionSelected &&
    (/\bfits my schedule\b/i.test(input.latestMessage) ||
      /\bwriting to the clinic\b/i.test(input.latestMessage) ||
      primaryIntent === 'express_confidence')
  ) {
    return finish(
      {
        primaryGoal: 'recognize_capability',
        secondaryGoal: 'offer practical help for the selected option',
        dialogueAct: 'support_capability',
        resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
        mustAddress: [
          `preserve the selected communication option: ${memory.selectedCommunicationOption}`,
          'recognize that a communication approach has been chosen',
        ],
        mustNotAssume: [
          ...mustNotAssume,
          'that the user still needs to choose call versus write',
        ],
        unresolvedNeed: 'offer draft help for the selected written option if useful',
        shouldAskQuestion: true,
        questionPurpose: 'action_planning',
        nextPendingItem: {
          type: 'question',
          text: 'whether help drafting the clinic message would be useful',
          expectedReplyType: 'affirmation',
        },
      },
      memory,
    );
  }

  if (
    primaryIntent === 'confirm_understanding' ||
    (strategy === 'confirm_progress' && primaryIntent !== 'gratitude' && !draftAccepted)
  ) {
    return finish(
      {
        primaryGoal: 'confirm_understanding',
        dialogueAct: 'confirm_progress',
        resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
        mustAddress: ['the user confirmed understanding of the previous explanation'],
        mustNotAssume: [
          ...mustNotAssume,
          'that the user wants another explanation of the same point',
          'that the user is ready to take action',
        ],
        unresolvedNeed: 'invite the next topic',
        shouldAskQuestion: true,
        questionPurpose: 'next_concern',
        nextPendingItem: {
          type: 'question',
          text: 'what part of the result the user would like to discuss next',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'gratitude' && strategy === 'confirm_progress') {
    return finish(
      {
        primaryGoal: 'confirm_progress',
        dialogueAct: 'confirm_progress',
        mustAddress: ["acknowledge the user's thanks briefly"],
        mustNotAssume: [...mustNotAssume, 'that risk education must restart'],
        shouldAskQuestion: true,
        questionPurpose: 'invite_topic',
        nextPendingItem: {
          type: 'question',
          text: 'whether there is anything else the user wants to discuss',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  if (primaryIntent === 'accept_teach_back') {
    return finish(
      {
        primaryGoal: 'answer_question',
        secondaryGoal,
        dialogueAct: 'ask_understanding',
        resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
        mustAddress: ['invite the user to restate the risk explanation in their own words'],
        mustNotAssume: [...mustNotAssume, 'that the user already restated the explanation'],
        shouldAskQuestion: true,
        questionPurpose: 'teach_back',
        nextPendingItem: {
          type: 'teach_back',
          text: 'restate the risk explanation in their own words',
          expectedReplyType: 'explanation',
        },
      },
      memory,
    );
  }

  // Do not re-explain risk when already understood unless the user asks again.
  if (
    memory.riskExplanationStatus === 'understood' &&
    strategy === 'clarify_risk' &&
    primaryIntent !== 'explain_risk' &&
    primaryIntent !== 'explain_risk_horizon' &&
    primaryIntent !== 'general_question'
  ) {
    return finish(
      {
        primaryGoal: 'confirm_understanding',
        dialogueAct: 'confirm_progress',
        mustAddress: ['risk explanation is already understood — invite the next concern'],
        mustNotAssume: [...mustNotAssume, 'that another full risk explanation is needed'],
        shouldAskQuestion: true,
        questionPurpose: 'next_concern',
        nextPendingItem: {
          type: 'question',
          text: 'what the user would like to discuss next',
          expectedReplyType: 'open_response',
        },
      },
      memory,
    );
  }

  switch (strategy) {
    case 'clarify_risk': {
      const isMisunderstanding = state.understanding === 'incorrect' || state.understanding === 'partial';
      const useTeachBack =
        isMisunderstanding ||
        state.understanding === 'uncertain' ||
        input.previousAssistantDialogueAct === 'ask_understanding';

      if (
        useTeachBack &&
        primaryIntent !== 'explain_risk' &&
        primaryIntent !== 'explain_risk_horizon' &&
        primaryIntent !== 'general_question'
      ) {
        return finish(
          {
            primaryGoal: isMisunderstanding ? 'correct_misunderstanding' : 'answer_question',
            secondaryGoal,
            dialogueAct: isMisunderstanding ? 'correct_misunderstanding' : 'explain_information',
            mustAddress: [`the user's question or misunderstanding related to: ${primaryIntent}`],
            mustNotAssume,
            shouldAskQuestion: true,
            questionPurpose: 'teach_back',
            nextPendingItem: {
              type: 'teach_back',
              text: 'restate the risk explanation in their own words',
              expectedReplyType: 'explanation',
            },
          },
          memory,
        );
      }

      return finish(
        {
          primaryGoal: isMisunderstanding ? 'correct_misunderstanding' : 'answer_question',
          secondaryGoal,
          dialogueAct: isMisunderstanding ? 'correct_misunderstanding' : 'explain_information',
          mustAddress: [`the user's question or misunderstanding related to: ${primaryIntent}`],
          mustNotAssume,
          unresolvedNeed: 'explain the demonstration risk estimate',
          shouldAskQuestion: true,
          questionPurpose: 'comprehension',
          nextPendingItem: {
            type: 'comprehension_check',
            text: 'whether the explanation of the risk estimate is clearer',
            expectedReplyType: 'affirmation',
          },
        },
        memory,
      );
    }
    case 'explain_benefit':
      return finish(
        {
          primaryGoal: 'answer_question',
          secondaryGoal,
          dialogueAct: 'explain_information',
          mustAddress: ['the general value of professional interpretation of the result'],
          mustNotAssume,
          shouldAskQuestion: false,
          nextPendingItem: NO_PENDING_ITEM,
        },
        memory,
      );
    case 'acknowledge_emotion':
      // Emotion must not override drafting/planning once those are underway.
      if (draftAccepted || memory.draftStatus === 'proposed' || memory.draftStatus === 'requested') {
        return finish(
          {
            primaryGoal: 'confirm_progress',
            secondaryGoal: 'brief emotion acknowledgment only if needed',
            dialogueAct: 'confirm_progress',
            mustAddress: ['continue the practical drafting or planning thread'],
            mustNotAssume: [...mustNotAssume, 'that emotion is still the main conversational goal'],
            shouldAskQuestion: !timingKnown,
            questionPurpose: 'action_planning',
            nextPendingItem: NO_PENDING_ITEM,
          },
          memory,
        );
      }
      return finish(
        {
          primaryGoal: 'acknowledge_emotion',
          secondaryGoal,
          dialogueAct: 'reflect_emotion',
          mustAddress: [`the emotion currently expressed: ${state.emotion}`],
          mustNotAssume: [
            ...mustNotAssume,
            'an emotion stronger than what the user actually expressed this turn',
          ],
          shouldAskQuestion: true,
          questionPurpose: 'barrier_exploration',
          nextPendingItem: {
            type: 'question',
            text: 'what part of the result feels most concerning',
            expectedReplyType: 'open_response',
          },
        },
        memory,
      );
    case 'explore_barrier': {
      const barrierKey = `barrier:${state.barrier}`;
      if (memory.resolvedIssues.includes(barrierKey)) {
        return finish(
          {
            primaryGoal: 'provide_practical_help',
            secondaryGoal,
            dialogueAct: 'plan_action',
            mustAddress: ['the previously discussed barrier is resolved — advance to a practical next step'],
            mustNotAssume: [...mustNotAssume, 'that the resolved barrier still needs exploration'],
            shouldAskQuestion: true,
            questionPurpose: 'action_planning',
            nextPendingItem: {
              type: 'question',
              text: 'which optional next step feels manageable now',
              expectedReplyType: 'open_response',
            },
          },
          memory,
        );
      }
      const repeatingSameBarrier =
        transitionMetadata.previousBarrier === transitionMetadata.currentBarrier &&
        transitionMetadata.currentBarrier !== 'none';
      return finish(
        {
          primaryGoal: repeatingSameBarrier ? 'offer_manageable_option' : 'understand_barrier',
          secondaryGoal,
          dialogueAct: repeatingSameBarrier ? 'offer_option' : 'explore_barrier',
          mustAddress: [`the current barrier: ${state.barrier}`],
          mustNotAssume,
          shouldAskQuestion: true,
          questionPurpose: repeatingSameBarrier ? ('option' as const) : ('barrier_exploration' as const),
          nextPendingItem: repeatingSameBarrier
            ? {
                type: 'single_option',
                option: 'one manageable next step for the current barrier',
                expectedReplyType: 'affirmation',
              }
            : {
                type: 'question',
                text: 'what makes the current barrier difficult right now',
                expectedReplyType: 'open_response',
              },
        },
        memory,
      );
    }
    case 'support_self_efficacy':
      return finish(
        {
          primaryGoal: 'recognize_capability',
          secondaryGoal,
          dialogueAct: 'support_capability',
          resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
          mustAddress: ['the capability or confidence the user just expressed'],
          mustNotAssume,
          shouldAskQuestion: !timingKnown,
          questionPurpose: 'action_planning',
          nextPendingItem: timingKnown
            ? NO_PENDING_ITEM
            : {
                type: 'action_commitment',
                text: 'when the user would like to take the next step',
                expectedReplyType: 'open_response',
              },
        },
        memory,
      );
    case 'action_planning':
      if (draftAccepted && timingKnown) {
        return finish(
          {
            primaryGoal: 'confirm_progress',
            dialogueAct: 'confirm_progress',
            mustAddress: ['summarize the selected plan without reopening choices'],
            mustNotAssume: [...mustNotAssume, 'that another action choice is needed'],
            shouldAskQuestion: false,
            nextPendingItem: NO_PENDING_ITEM,
          },
          memory,
        );
      }
      return finish(
        {
          primaryGoal: 'make_action_specific',
          secondaryGoal,
          dialogueAct: 'plan_action',
          resolvedUserDevelopment: resolvedShortReply.resolvedMeaning,
          mustAddress: ['the action or intention the user just stated'],
          mustNotAssume: [...mustNotAssume, 'a specific outcome of the planned action'],
          shouldAskQuestion: !timingKnown,
          questionPurpose: 'action_planning',
          nextPendingItem: timingKnown
            ? NO_PENDING_ITEM
            : {
                type: 'question',
                text: 'anything the user wants to note down beforehand',
                expectedReplyType: 'open_response',
              },
        },
        memory,
      );
    case 'explore_readiness':
      // Never reopen readiness after draft acceptance or timing commitment.
      if (draftAccepted || timingKnown || optionSelected) {
        return finish(
          {
            primaryGoal: 'confirm_progress',
            dialogueAct: 'confirm_progress',
            mustAddress: ['recognize progress on the selected follow-up plan'],
            mustNotAssume: [...mustNotAssume, 'that broad readiness still needs exploration'],
            shouldAskQuestion: !timingKnown && draftAccepted,
            questionPurpose: 'action_planning',
            nextPendingItem: !timingKnown && draftAccepted
              ? {
                  type: 'action_commitment',
                  text: 'when the user would like to send the accepted draft',
                  expectedReplyType: 'open_response',
                }
              : NO_PENDING_ITEM,
          },
          memory,
        );
      }
      return finish(
        {
          primaryGoal: 'explore_ambivalence',
          secondaryGoal,
          dialogueAct: primaryIntent === 'express_ambivalence' ? 'explore_ambivalence' : 'ask_understanding',
          mustAddress: ['how the user currently feels about following up'],
          mustNotAssume,
          shouldAskQuestion: true,
          questionPurpose: 'readiness',
          nextPendingItem: {
            type: 'question',
            text: 'how the user feels about discussing this with a healthcare professional',
            expectedReplyType: 'open_response',
          },
        },
        memory,
      );
    default:
      return finish(
        {
          primaryGoal: 'confirm_progress',
          dialogueAct: 'confirm_progress',
          mustAddress: ['respond to the latest user turn and advance the unresolved need'],
          mustNotAssume,
          shouldAskQuestion: true,
          questionPurpose: 'invite_topic',
          nextPendingItem: {
            type: 'question',
            text: 'what the user would like to discuss next',
            expectedReplyType: 'open_response',
          },
        },
        memory,
      );
  }
}
