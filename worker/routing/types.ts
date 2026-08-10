/**
 * Global dialogue-routing types.
 * Routing decides what the user is asking; theory only modifies delivery.
 */

export type RoutingTopic =
  | 'risk_meaning'
  | 'risk_representation'
  | 'risk_level'
  | 'risk_uncertainty'
  | 'time_horizon'
  | 'calculator_inputs'
  | 'calculator_limitations'
  | 'calculator_validation'
  | 'calculator_applicability'
  | 'evidence_source'
  | 'screening_guidance'
  | 'symptom_guidance'
  | 'professional_interpretation'
  | 'lifestyle_risk_information'
  | 'communication_support'
  | 'message_drafting'
  | 'action_planning'
  | 'conversation_summary'
  | 'emotion'
  | 'greeting'
  | 'closing'
  | 'safety'
  | 'out_of_scope'
  | 'unclear';

export type RoutingOperation =
  | 'explain'
  | 'simplify'
  | 'convert'
  | 'compare'
  | 'correct_misunderstanding'
  | 'verify_understanding'
  | 'answer_factual_question'
  | 'answer_general_health_question'
  | 'explain_lifestyle_relationship'
  | 'set_personalized_advice_boundary'
  | 'provide_preparation_information'
  | 'list_information'
  | 'identify_limitation'
  | 'address_barrier'
  | 'provide_options'
  | 'draft'
  | 'revise'
  | 'review'
  | 'confirm'
  | 'reject'
  | 'plan'
  | 'defer'
  | 'close'
  | 'set_boundary'
  | 'request_clarification';
export type RoutingStance =
  | 'asking'
  | 'asserting'
  | 'confirming'
  | 'correcting'
  | 'accepting'
  | 'rejecting'
  | 'planning'
  | 'deferring'
  | 'completed'
  | 'uncertain'
  | 'neutral';

export type RoutingEmotion =
  | 'fear'
  | 'worry'
  | 'frustration'
  | 'confusion'
  | 'none'
  | 'not_expressed';

export type RoutingBarrier =
  | 'time'
  | 'cost'
  | 'access'
  | 'delay'
  | 'mistrust'
  | 'uncertainty'
  | 'none'
  | 'not_expressed';

export type InformationSource =
  | 'deterministic_calculation'
  | 'calculator_metadata'
  | 'vetted_medical_rag'
  | 'conversation_memory'
  | 'safety_boundary_policy'
  | 'safety_boundary_and_rag'
  | 'draft_and_constraints'
  | 'medical_rag'
  | 'safety_policy'
  | 'none';

export interface DialogueRoute {
  topic: RoutingTopic;
  primaryOperation: RoutingOperation;
  /** Alias of primaryOperation for newer consumers. */
  operation?: RoutingOperation;
  secondaryOperations: RoutingOperation[];
  stance: RoutingStance;

  explicitRequest: string;

  directAnswerRequired: boolean;
  safetyBoundaryRequired: boolean;
  medicalEvidenceRequired: boolean;
  calculatorMetadataRequired: boolean;
  deterministicCalculationRequired: boolean;
  conversationContextRequired: boolean;
  clarificationRequired: boolean;

  emotion: RoutingEmotion;
  barrier: RoutingBarrier;

  understanding:
    | 'correct'
    | 'partial'
    | 'incorrect'
    | 'not_assessable';

  currentTurnEvidence: {
    topic: string;
    operation: string;
    stance: string;
    emotion: string;
    barrier: string;
  };

  /** Legacy singular source. */
  selectedInformationSource: InformationSource;
  /** Preferred multi-source list (synced with selectedInformationSource). */
  selectedInformationSources: InformationSource[];

  previousPlanCompatible?: boolean;
  previousPlanDiscarded?: boolean;
  previousPlanDiscardReason?: string;

  theoryApplication?: import('../dialogue/theoryApplication').TheoryApplication;
  activeInformationNeed?: import('../dialogue/activeInformationNeed').ActiveInformationNeed;

  confidence: number;
  routingMode: 'groq-structured' | 'deterministic-safety' | 'local-semantic-fallback';
}

export interface PlanCompatibilityResult {
  compatible: boolean;
  /** Joined reasons for backward compatibility. */
  reason?: string;
  /** Individual discard/compat reasons. */
  reasons: string[];
  previousPlanDiscarded: boolean;
}

export interface RouteValidation {
  latestRequestPreserved: boolean;
  directQuestionDetected: boolean;
  operationSupportedByEvidence: boolean;
  currentTurnEvidenceConsistent: boolean;
  unsupportedEmotionDetected: boolean;
  unsupportedBarrierDetected: boolean;
  stalePlanDetected: boolean;
  routeSourceAppropriate: boolean;
  valid: boolean;
  reason?: string;
}

export interface RouteFulfillmentValidation {
  routeFulfilled: boolean;
  directAnswerProvided: boolean;
  requestedOperationCompleted: boolean;
  staleTopicRepeated: boolean;
  incompatibleDialogueMoveDetected: boolean;
  sourceMismatchDetected: boolean;
  valid: boolean;
  reason?: string;
  missingElements: string[];
}

/** Diagnostics payload for the developer panel ROUTING section. */
export interface RoutingDiagnostics {
  latestMessage: string;
  topic: RoutingTopic;
  primaryOperation: RoutingOperation;
  secondaryOperations: RoutingOperation[];
  stance: RoutingStance;
  explicitRequest: string;
  directAnswerRequired: boolean;
  emotion: RoutingEmotion;
  emotionEvidence: string;
  barrier: RoutingBarrier;
  barrierEvidence: string;
  previousPlanCompatible: boolean;
  previousPlanDiscarded: boolean;
  previousPlanDiscardReason?: string;
  selectedInformationSource: InformationSource;
  selectedInformationSources?: InformationSource[];
  activeResponseGoal: string;
  activeInformationNeed?: import('../dialogue/activeInformationNeed').ActiveInformationNeed;
  theoryApplication?: import('../dialogue/theoryApplication').TheoryApplication;
  routeValidation: RouteValidation | null;
  responseRouteValidation: RouteFulfillmentValidation | null;
  repairAttempted: boolean;
  fallbackReason?: string;
}
