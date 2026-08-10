/**
 * Temporary conversational estimates of decisional needs after a
 * demonstration breast-cancer risk result. These are prototype heuristics
 * inspired by Ottawa Decision Support Framework constructs — not validated
 * decisional-conflict scores, clinical assessments, or personality labels.
 */

export type DecisionTopic =
  | 'risk_interpretation'
  | 'whether_to_follow_up'
  | 'how_to_follow_up'
  | 'message_drafting'
  | 'choose_timing'
  | 'prepare_questions'
  | 'shared_decision_preparation'
  | 'review_message_draft'
  | 'none';

export type DecisionStage =
  | 'not_started'
  | 'information_seeking'
  | 'option_clarification'
  | 'preference_clarification'
  | 'selected_option'
  | 'planning_action'
  | 'preparing_action'
  | 'action_confirmed'
  | 'deferred'
  | 'closed';

export type DraftStatus =
  | 'none'
  | 'proposed'
  | 'under_review'
  | 'accepted'
  | 'revision_requested'
  | 'rejected';

export type DecisionalNeed =
  | 'missing_information'
  | 'unclear_options'
  | 'unclear_preferences'
  | 'low_confidence'
  | 'insufficient_support'
  | 'practical_barrier'
  | 'emotional_barrier'
  | 'none'
  | 'resolved';

export type DecisionConfidence = 'low' | 'moderate' | 'high' | 'unknown';

export type DecisionSupportStrategy =
  | 'provide_information'
  | 'clarify_options'
  | 'clarify_preferences'
  | 'build_confidence'
  | 'prepare_questions'
  | 'address_barrier'
  | 'acknowledge_emotion_need'
  | 'support_deferral'
  | 'confirm_selected_action'
  | 'review_draft'
  | 'close_decision'
  | 'none';

export type DecisionSupportGoal =
  | 'supply_missing_information'
  | 'clarify_available_options'
  | 'clarify_preferences'
  | 'strengthen_decision_confidence'
  | 'prepare_communication'
  | 'address_decisional_barrier'
  | 'acknowledge_emotional_need'
  | 'support_decision_deferral'
  | 'confirm_action_commitment'
  | 'review_communication_draft'
  | 'close_supportively'
  | 'maintain_safety'
  | 'none';

export interface DecisionSupportState {
  decisionTopic: DecisionTopic;
  decisionStage: DecisionStage;
  primaryDecisionalNeed: DecisionalNeed;
  secondaryDecisionalNeeds: DecisionalNeed[];
  expressedPreferences: string[];
  selectedOption: string | null;
  unresolvedQuestion: string | null;
  decisionConfidence: DecisionConfidence;
  draftAccepted: boolean;
  draftStatus: DraftStatus;
  acceptedDraftText: string | null;
  acceptedDraftPurpose: string | null;
  draftNeedResolved: boolean;
  actionTiming: string | null;
  informationNeedResolved: boolean;
}

export interface DecisionTransitionMetadata {
  previousNeed: DecisionalNeed;
  currentNeed: DecisionalNeed;
  previousStage: DecisionStage;
  currentStage: DecisionStage;
  previousSelectedOption: string | null;
  currentSelectedOption: string | null;
  selectedOptionPreserved: boolean;
  informationNeedResolvedThisTurn: boolean;
  decisionDeferredThisTurn: boolean;
  actionConfirmedThisTurn: boolean;
  draftAcceptedThisTurn: boolean;
  draftStatus: DraftStatus;
  decisionNeedResolved: boolean;
  unnecessaryReconsiderationDetected: boolean;
  changedFields: string[];
  stateChanged: boolean;
}

export interface DecisionSupportTurnPlan {
  primaryGoal: DecisionSupportGoal;
  secondaryGoal?: string;
  mustAddress: string[];
  mustNotAssume: string[];
  preserveSelectedOption: boolean;
  shouldAskQuestion: boolean;
}

export function createDefaultDecisionSupportState(): DecisionSupportState {
  return {
    decisionTopic: 'none',
    decisionStage: 'not_started',
    primaryDecisionalNeed: 'none',
    secondaryDecisionalNeeds: [],
    expressedPreferences: [],
    selectedOption: null,
    unresolvedQuestion: null,
    decisionConfidence: 'unknown',
    draftAccepted: false,
    draftStatus: 'none',
    acceptedDraftText: null,
    acceptedDraftPurpose: null,
    draftNeedResolved: false,
    actionTiming: null,
    informationNeedResolved: false,
  };
}

export function normalizeDecisionSupportState(
  value: Partial<DecisionSupportState> | null | undefined,
): DecisionSupportState {
  const defaults = createDefaultDecisionSupportState();
  if (!value || typeof value !== 'object') return defaults;
  return {
    decisionTopic: value.decisionTopic ?? defaults.decisionTopic,
    decisionStage: value.decisionStage ?? defaults.decisionStage,
    primaryDecisionalNeed: value.primaryDecisionalNeed ?? defaults.primaryDecisionalNeed,
    secondaryDecisionalNeeds: Array.isArray(value.secondaryDecisionalNeeds)
      ? value.secondaryDecisionalNeeds.filter((item): item is DecisionalNeed => typeof item === 'string')
      : defaults.secondaryDecisionalNeeds,
    expressedPreferences: Array.isArray(value.expressedPreferences)
      ? value.expressedPreferences.filter((item): item is string => typeof item === 'string')
      : defaults.expressedPreferences,
    selectedOption: typeof value.selectedOption === 'string' ? value.selectedOption : null,
    unresolvedQuestion: typeof value.unresolvedQuestion === 'string' ? value.unresolvedQuestion : null,
    decisionConfidence: value.decisionConfidence ?? defaults.decisionConfidence,
    draftAccepted: Boolean(value.draftAccepted) || value.draftStatus === 'accepted',
    draftStatus: value.draftStatus ?? (value.draftAccepted ? 'accepted' : defaults.draftStatus),
    acceptedDraftText: typeof value.acceptedDraftText === 'string' ? value.acceptedDraftText : null,
    acceptedDraftPurpose: typeof value.acceptedDraftPurpose === 'string' ? value.acceptedDraftPurpose : null,
    draftNeedResolved: Boolean(value.draftNeedResolved) || value.draftStatus === 'accepted',
    actionTiming: typeof value.actionTiming === 'string' ? value.actionTiming : null,
    informationNeedResolved: Boolean(value.informationNeedResolved),
  };
}
