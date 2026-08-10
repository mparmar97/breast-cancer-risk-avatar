export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

export type Screen = 'consent' | 'calculator' | 'chat';

export type RiskBranch = 'average' | 'elevated';

export type MenarcheBand = '<12' | '12-13' | '>=14';
export type FirstBirthBand = 'never' | '<20' | '20-24' | '25-29' | '>=30';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';

/** Gail-inspired educational calculator inputs (not a clinical BCRAT run). */
export interface CalculatorInputs {
  age: number;
  ageAtMenarche: MenarcheBand;
  ageAtFirstLiveBirth: FirstBirthBand;
  firstDegreeRelatives: 0 | 1 | 2;
  priorBiopsies: 0 | 1 | 2;
  atypicalHyperplasia: YesNoUnknown;
}

export interface RiskResult {
  model: string;
  fiveYearRisk: number;
  riskHorizon: string;
  riskBranch: RiskBranch;
  disclaimer: string;
  calculatorInputs?: CalculatorInputs;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  /** Per-turn developer diagnostics (assistant messages only). */
  diagnostics?: ChatDiagnostics | null;
}

// --- Adaptive Readiness-to-Action Dialogue Engine types (Phase 3) ---------
//
// These mirror worker/behavioral/state.ts, worker/behavioral/policy.ts, and
// worker/behavioral/theoryMap.ts. They describe temporary, conversational-
// turn estimates only, and must never be presented as a diagnosis of any
// kind. They are shown only in the developer-only diagnostic panel.

export type Understanding = 'correct' | 'partial' | 'incorrect' | 'uncertain';

export type Emotion = 'calm' | 'worried' | 'overwhelmed' | 'dismissive' | 'uncertain';

export type Barrier =
  | 'none'
  | 'fear'
  | 'time'
  | 'cost'
  | 'access'
  | 'mistrust'
  | 'uncertainty'
  | 'delay'
  | 'other';

export type SelfEfficacy = 'low' | 'moderate' | 'high' | 'unknown';

export type Readiness = 'not_considering' | 'considering' | 'preparing' | 'ready' | 'unclear';

export type SafetyFlag =
  | 'none'
  | 'diagnosis_request'
  | 'treatment_request'
  | 'urgent_symptom'
  | 'emotional_crisis'
  | 'out_of_scope';

export interface AdaptiveState {
  understanding: Understanding;
  emotion: Emotion;
  barrier: Barrier;
  selfEfficacy: SelfEfficacy;
  readiness: Readiness;
  safetyFlag: SafetyFlag;
  confidence: number;
}

export type DialogueStrategy =
  | 'safety_boundary'
  | 'urgent_referral'
  | 'clarify_risk'
  | 'acknowledge_emotion'
  | 'explain_benefit'
  | 'explore_barrier'
  | 'support_self_efficacy'
  | 'action_planning'
  | 'confirm_progress'
  | 'greet_user'
  | 'close_supportively'
  | 'ask_clarification'
  | 'explore_readiness';

/**
 * A single-turn estimate of *why* the user sent this message. Mirrors
 * worker/behavioral/state.ts `Intent`.
 */
export type UserIntent =
  | 'greeting'
  | 'gratitude'
  | 'conversation_closing'
  | 'social_acknowledgment'
  | 'explain_risk'
  | 'explain_risk_horizon'
  | 'diagnosis_question'
  | 'treatment_question'
  | 'symptom_report'
  | 'express_emotion'
  | 'describe_barrier'
  | 'express_confidence'
  | 'express_ambivalence'
  | 'request_next_step'
  | 'confirm_action'
  | 'confirm_understanding'
  | 'accept_teach_back'
  | 'request_draft_help'
  | 'request_draft_review'
  | 'confirm_proposed_action'
  | 'correction'
  | 'general_question'
  | 'affirmation'
  | 'negation'
  | 'unclear';

export interface TheoryConstruct {
  theory: string;
  construct: string;
  communicationTechnique: string;
  objective: string;
  /** Dialogue-design source IDs/citations backing this strategy's technique — design rationale only, never medical support. */
  sourceIds?: string[];
  citations?: string[];
}

// --- Phase 5: Groq-powered dynamic adaptive dialogue types ---------------
//
// Mirrors worker/llm/types.ts and worker/llm/classifyAdaptiveState.ts.
// `currentTurnEvidence` holds short natural-language rationale strings for
// each classified field (from Groq's structured output, or an equivalent
// local rationale) — never a raw provider response, prompt, or the
// GROQ_API_KEY.

export type ClassificationMode = 'groq-structured' | 'local-fallback' | 'local-safety-precheck';

export type ResponseMode = 'groq-dynamic-rag' | 'local-rag-fallback' | 'fixed-safety';

export type FallbackReason =
  | 'missing_configuration'
  | 'classification_provider_failure'
  | 'classification_validation_failure'
  | 'generation_provider_failure'
  | 'generation_validation_failure'
  | 'repetition_failure'
  | 'insufficient_evidence';

export interface CurrentTurnEvidence {
  intent: string;
  understanding: string;
  emotion: string;
  barrier: string;
  selfEfficacy: string;
  readiness: string;
  safetyFlag: string;
}

export interface ConfigStatus {
  backendConnected: boolean;
  groqConfigured: boolean;
  groqModel: string;
  dynamicModeAvailable: boolean;
}

// --- General dynamic multi-turn dialogue manager types --------------------
//
// Mirrors worker/dialogue/types.ts, worker/behavioral/transitionState.ts,
// and worker/dialogue/resolveShortReply.ts. These describe conversational
// bookkeeping (what the assistant was trying to do, what it's waiting on,
// how state changed this turn) layered on top of the Phase 3 AdaptiveState/
// DialogueStrategy types above. None of this is a diagnosis — it is a
// lightweight heuristic shown only in the developer-only diagnostic panel.

export type AssistantDialogueAct =
  | 'greet_user'
  | 'explain_information'
  | 'correct_misunderstanding'
  | 'reflect_emotion'
  | 'explore_barrier'
  | 'offer_option'
  | 'ask_clarification'
  | 'ask_understanding'
  | 'support_capability'
  | 'explore_ambivalence'
  | 'plan_action'
  | 'confirm_progress'
  | 'review_draft'
  | 'close_conversation'
  | 'fixed_safety'
  | 'none';

export type PendingItemType =
  | 'question'
  | 'single_option'
  | 'multiple_options'
  | 'teach_back'
  | 'comprehension_check'
  | 'action_commitment'
  | 'proposed_draft'
  | 'none';

export type ExpectedReplyType =
  | 'affirmation'
  | 'negation'
  | 'explanation'
  | 'choice'
  | 'review_or_acceptance'
  | 'open_response'
  | 'none';

/** What the assistant is waiting to hear back about — round-tripped so a short next-turn reply like "yes" can be resolved contextually. */
export interface PendingConversationItem {
  type: PendingItemType;
  text?: string;
  option?: string;
  draftText?: string;
  draftPurpose?: string;
  expectedReplyType?: ExpectedReplyType;
}

export type ShortReplyType = 'affirmation' | 'negation' | 'uncertain_reply' | 'not_short_reply';

/** The full result of interpreting a single conversational turn (Groq's structured classification, or the local fallback equivalent). */
export interface CurrentTurnInterpretation {
  primaryIntent: UserIntent;
  secondaryIntents: UserIntent[];
  understanding: Understanding;
  emotion: Emotion;
  barrier: Barrier;
  selfEfficacy: SelfEfficacy;
  readiness: Readiness;
  safetyFlag: SafetyFlag;
  currentTurnEvidence: CurrentTurnEvidence;
  refersToPreviousAssistantTurn: boolean;
  shortReplyType: ShortReplyType;
  confidence: number;
}

/** Deterministic interpretation of a short reply (e.g. "yes") against the previous assistant turn's pending item. */
export interface ResolvedShortReply {
  isShortReply: boolean;
  shortReplyType: ShortReplyType;
  resolvedMeaning?: string;
  overridePrimaryIntent?: UserIntent;
  overrideUnderstanding?: Understanding;
  overrideSelfEfficacy?: SelfEfficacy;
  overrideReadiness?: Readiness;
  overrideBarrier?: Barrier;
  requiresClarification: boolean;
}

export interface StateTransitionMetadata {
  previousUnderstanding: Understanding;
  currentUnderstanding: Understanding;
  understandingChanged: boolean;
  previousEmotion: Emotion;
  currentEmotion: Emotion;
  previousBarrier: Barrier;
  currentBarrier: Barrier;
  barrierCleared: boolean;
  previousSelfEfficacy: SelfEfficacy;
  currentSelfEfficacy: SelfEfficacy;
  previousReadiness: Readiness;
  currentReadiness: Readiness;
  stateChanged: boolean;
  changedFields: string[];
  barrierUnmentionedTurns: number;
}

export type DialogueTurnPrimaryGoal =
  | 'open_conversation'
  | 'answer_question'
  | 'correct_misunderstanding'
  | 'acknowledge_emotion'
  | 'understand_barrier'
  | 'offer_manageable_option'
  | 'recognize_capability'
  | 'explore_ambivalence'
  | 'provide_practical_help'
  | 'make_action_specific'
  | 'confirm_understanding'
  | 'confirm_progress'
  | 'review_user_draft'
  | 'clarify_short_reply'
  | 'maintain_safety'
  | 'close_supportively';

export type DialogueQuestionPurpose =
  | 'invite_topic'
  | 'clarification'
  | 'teach_back'
  | 'comprehension'
  | 'explore_next_concern'
  | 'next_concern'
  | 'barrier_exploration'
  | 'confidence'
  | 'option'
  | 'action_planning'
  | 'readiness'
  | 'none';

/** What the next response must accomplish — the deterministic hand-off between policy selection and response generation. */
export interface DialogueTurnPlan {
  primaryGoal: DialogueTurnPrimaryGoal | string;
  secondaryGoal?: string;
  dialogueAct: AssistantDialogueAct;
  topic?: string;
  primaryOperation?: string;
  secondaryOperations?: string[];
  explicitRequest?: string;
  requestedOutputFormat?: string;
  mustAddress: string[];
  optionalDetails?: string[];
  mustNotDo?: string[];
  mustNotRepeat?: string[];
  mustNotAssume: string[];
  alreadyKnown?: string[];
  alreadyResolved?: string[];
  selectedOption?: string;
  acceptedDraft?: string;
  unresolvedNeed?: string;
  resolvedUserDevelopment?: string;
  requiresEvidence?: boolean;
  requiresCalculation?: boolean;
  shouldAskQuestion: boolean;
  questionPurpose?: DialogueQuestionPurpose;
  nextPendingItem?: PendingConversationItem;
}

export interface NaturalFrequencyResult {
  originalRiskPercent: number;
  numerator: number;
  denominator: number;
  timeHorizon?: string;
  approximationText: string;
}

export interface RequestInterpretation {
  topic: string;
  operation: string;
  secondaryOperations: string[];
  primaryIntent: string;
  secondaryIntents: string[];
  explicitRequest: string;
  requestedOutputFormat?: string;
  entities: {
    riskValue?: number;
    denominator?: number;
    timeHorizon?: string;
    comparisonTarget?: string;
    draftText?: string;
    selectedOption?: string;
    timing?: string;
  };
  currentTurnEvidence: {
    topic: string;
    operation: string;
    explicitRequest: string;
  };
  requiresMedicalEvidence: boolean;
  requiresCalculation: boolean;
  requiresConversationContext: boolean;
  requiresClarification: boolean;
  confidence: number;
  classificationMode: 'groq-structured' | 'local-fallback' | string;
}

export interface OperationValidation {
  explicitRequestAddressed: boolean;
  primaryOperationCompleted: boolean;
  secondaryOperationsCompleted: boolean;
  requestedFormatUsed: boolean;
  directAnswerProvided: boolean;
  genericSubstitutionDetected: boolean;
  unsupportedMedicalClaimDetected: boolean;
  unnecessaryQuestionDetected: boolean;
  valid?: boolean;
  reason?: string;
  missingElements?: string[];
  mustNotRepeat?: string[];
}

export type RiskExplanationStatus =
  | 'not_discussed'
  | 'explained'
  | 'partially_understood'
  | 'understood';

export type ConversationDraftStatus =
  | 'none'
  | 'requested'
  | 'proposed'
  | 'revision_requested'
  | 'accepted'
  | 'rejected';

export interface ConversationMemory {
  riskExplanationStatus: RiskExplanationStatus;
  currentTopic?: string;
  unresolvedNeed?: string;
  selectedCommunicationOption?: string;
  rejectedCommunicationOptions: string[];
  draftStatus: ConversationDraftStatus;
  acceptedDraftText?: string;
  plannedAction?: string;
  plannedTiming?: string;
  lastAssistantDialogueAct?: AssistantDialogueAct;
  pendingConversationItem?: PendingConversationItem;
  resolvedIssues: string[];
}

export type ClassificationConsistency = 'passed' | 'repaired' | 'fallback';

// --- Local RAG evidence types (Phase 4/4b) --------------------------------
//
// Mirrors worker/rag/types.ts. `medical-rag` sources are the only kind
// returned in `sources` and are the sole factual basis for a chat reply.
// `dialogue-design` sources (returned only in `dialogueDesignSources`, for
// developer diagnostics) justify behavioral-theory/communication-technique
// choices and must never be treated as medical support. See
// docs/EVIDENCE_REGISTER.md. Only non-sensitive source metadata is ever
// sent to the frontend; raw evidence text never leaves the worker.

export type EvidenceStatus = 'demo-placeholder' | 'vetted';

export type EvidenceUse = 'medical-rag' | 'dialogue-design';

export type EvidenceSourceType =
  | 'official-calculator-documentation'
  | 'government-patient-education'
  | 'clinical-guideline'
  | 'primary-research'
  | 'theory-paper'
  | 'systematic-review';

export interface SourceMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  section: string;
  topic: string;
  score: number;
  status: EvidenceStatus;
  sourceUse: EvidenceUse;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  clinicalUseRestriction?: string;
  researchLimitation?: string;
}

export interface DialogueDesignMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  topic: string;
  status: EvidenceStatus;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  researchLimitation?: string;
}

// --- Decision-support estimates (temporary; not validated scores) ---------

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

export interface OrchestrationValidation {
  primaryIntentAddressed: boolean;
  decisionalNeedAddressed: boolean;
  selectedOptionPreserved: boolean;
  resolvedIssueRepeated: boolean;
  unsupportedAssumptionDetected: boolean;
  medicalGroundingPassed: boolean;
  safetyPassed: boolean;
  dialogueProgressed: boolean;
  repetitionPassed: boolean;
  draftAccepted?: boolean;
  decisionNeedResolved?: boolean;
  dialogueAdvanced?: boolean;
  unnecessaryReconsiderationDetected?: boolean;
}

export interface InnovationMetadata {
  adaptiveDimensionsUsed: string[];
  decisionalNeedsAddressed: string[];
  theoriesOperationalized: string[];
  medicalEvidenceUsed: string[];
  safetyControlsApplied: string[];
  progressionControlsApplied: string[];
  deliveryMode: 'text' | 'static-avatar' | 'live-avatar';
}

export interface ChatDiagnostics {
  adaptiveState: AdaptiveState;
  previousAdaptiveState: AdaptiveState | null;
  decisionState?: DecisionSupportState | null;
  previousDecisionState?: DecisionSupportState | null;
  conversationMemory?: ConversationMemory | null;
  previousConversationMemory?: ConversationMemory | null;
  decisionTransition?: DecisionTransitionMetadata | null;
  decisionSupportStrategy?: DecisionSupportStrategy | null;
  decisionSupportTheoryConstruct?: TheoryConstruct | null;
  decisionSupportTurnPlan?: DecisionSupportTurnPlan | null;
  currentTurnEvidence: CurrentTurnEvidence;
  currentTurnInterpretation: CurrentTurnInterpretation;
  requestInterpretation?: RequestInterpretation | null;
  semanticTurn?: {
    topic: string;
    primaryOperation: string;
    secondaryOperations?: string[];
    stance?: string;
    explicitRequest: string;
    requestedFormat?: string;
    requestedOutputFormat?: string;
    propositions?: Array<{ text: string; status: string }>;
    understanding?: string;
    misunderstanding?: string;
    emotion?: string;
    barrier?: string;
    evidence?: {
      topic?: string;
      operation?: string;
      understanding?: string;
      misunderstanding?: string;
      emotion?: string;
      barrier?: string;
    };
    currentTurnEvidence?: {
      emotion?: string;
      barrier?: string;
      understanding?: string;
      stance?: string;
    };
    userConstraints?: string[];
    confidence?: number;
  } | null;
  responsePlan?: {
    primaryGoal: string;
    secondaryGoals?: string[];
    directAnswerRequired?: boolean;
    mustAddress?: string[];
    factsNeeded?: string[];
    shouldAskQuestion?: boolean;
    questionPurpose?: string;
  } | null;
  dialogueRoute?: {
    topic: string;
    primaryOperation: string;
    secondaryOperations?: string[];
    stance?: string;
    explicitRequest: string;
    directAnswerRequired?: boolean;
    emotion?: string;
    barrier?: string;
    selectedInformationSource?: string;
    confidence?: number;
    routingMode?: string;
    currentTurnEvidence?: {
      topic?: string;
      operation?: string;
      stance?: string;
      emotion?: string;
      barrier?: string;
    };
  } | null;
  routingDiagnostics?: {
    latestMessage: string;
    topic: string;
    primaryOperation: string;
    secondaryOperations?: string[];
    stance?: string;
    explicitRequest: string;
    directAnswerRequired?: boolean;
    emotion?: string;
    emotionEvidence?: string;
    barrier?: string;
    barrierEvidence?: string;
    previousPlanCompatible?: boolean;
    previousPlanDiscarded?: boolean;
    previousPlanDiscardReason?: string;
    selectedInformationSource?: string;
    selectedInformationSources?: string[];
    activeResponseGoal?: string;
    activeInformationNeed?: {
      topic?: string;
      operation?: string;
      unresolvedQuestion?: string;
      requestedInformation?: string[];
      resolved?: boolean;
      sourceRequired?: string;
      currentTurnPriority?: number;
    };
    theoryApplication?: {
      healthBehaviorTheory?: string;
      communicationTheory?: string;
      decisionSupportFramework?: string;
      construct?: string;
      communicationObjective?: string;
      activationReason?: string;
    };
    routeValidation?: Record<string, unknown> | null;
    responseRouteValidation?: Record<string, unknown> | null;
    repairAttempted?: boolean;
    fallbackReason?: string;
  } | null;
  resolvedShortReply: ResolvedShortReply;
  stateTransition: StateTransitionMetadata;
  strategy: DialogueStrategy;
  theoryConstruct: TheoryConstruct;
  dialogueTurnPlan: DialogueTurnPlan;
  retrievalQuery: string;
  calculationResult?: NaturalFrequencyResult | null;
  sources: SourceMetadata[];
  dialogueDesignSources: DialogueDesignMetadata[];
  usedEvidenceIds: string[];
  initialGeneratedResponse?: string | null;
  repairedResponse?: string | null;
  operationValidation?: OperationValidation | null;
  operationRepairAttempted?: boolean;
  classificationMode: ClassificationMode;
  responseMode: ResponseMode;
  groqModel: string;
  classificationConsistency: ClassificationConsistency;
  classificationRepairUsed: boolean;
  strategyRepeated: boolean;
  strategyProgressionApplied: boolean;
  repetitionDetected: boolean;
  regenerationUsed: boolean;
  similarityScore: number;
  repeatedDialogueMove: string | null;
  dialogueAdvanced: boolean;
  primaryGoalSatisfied: boolean;
  decisionNeedAddressed?: boolean;
  unsupportedAssumptionDetected: boolean;
  resolvedIssueRepeated: boolean;
  directQuestionAnswered: boolean;
  shortReplyResolved: boolean;
  resolvedMeaning: string | null;
  understandingChanged: boolean;
  repeatedExplanationDetected: boolean;
  practicalRequestFulfilled: boolean;
  userCorrectionHandled: boolean;
  /** Up to the last few selected strategies, most-recent-last — round-tripped for strategy-stagnation detection only. */
  recentStrategies: DialogueStrategy[];
  safetyOverrideApplied?: boolean;
  fallbackUsed?: boolean;
  orchestrationValidation?: OrchestrationValidation | null;
  innovationMetadata?: InnovationMetadata | null;
  fallbackReason?: FallbackReason;
  turnRequest?: {
    turnId: string;
    sessionId: string;
    latestMessage: string;
    receivedAt: string;
  } | null;
  pipelineTrace?: {
    turnId: string;
    requestReceived?: boolean;
    latestMessagePresentAtBoundary?: boolean;
    latestMessagePresentAtSafety?: boolean;
    latestMessagePresentAtClassification?: boolean;
    latestMessagePresentAtRouting?: boolean;
    latestMessagePresentAtPlanning?: boolean;
    latestMessagePresentAtGeneration?: boolean;
    latestMessagePresentAtValidation?: boolean;
    classificationProviderAttempted?: boolean;
    classificationProviderSucceeded?: boolean;
    generationProviderAttempted?: boolean;
    generationProviderSucceeded?: boolean;
    classificationFallbackUsed?: boolean;
    generationFallbackUsed?: boolean;
    failedStage?: string;
    providerErrorCategory?: string;
    stages: Array<{
      stage: string;
      latestMessagePresent: boolean;
      at: string;
    }>;
  } | null;
  providerExecution?: {
    providerFailureStage?: string;
    providerErrorCategory?: string;
    classificationFailureStage?: string;
    generationFailureStage?: string;
    classificationErrorCategory?: string;
    generationErrorCategory?: string;
    generationValidationReason?: string;
    retriesUsed?: number;
  } | null;
  assumptionValidation?: {
    patientPortalAssumed?: boolean;
    appointmentAssumed?: boolean;
    clinicianRelationshipAssumed?: boolean;
    selectedActionInvented?: boolean;
    unsupportedPersonalizationDetected?: boolean;
    unsupportedAssumptionDetected?: boolean;
    portalAssumedWithoutMemory: boolean;
    appointmentAssumedWithoutMemory: boolean;
    clinicianRelationshipAssumedWithoutMemory: boolean;
    valid: boolean;
    failedAssumptions: string[];
    repairAttempted: boolean;
  } | null;
  metadataConsistency?: {
    latestMessageConsistent?: boolean;
    clarificationFieldsConsistent?: boolean;
    shortReplyFieldsConsistent?: boolean;
    routeAndPlanConsistent?: boolean;
    responseModeConsistent?: boolean;
    fallbackReasonConsistent?: boolean;
    valid: boolean;
    failures: string[];
  } | null;
}

export interface ChatApiResponse extends ChatDiagnostics {
  reply: string;
  timestamp: string;
}

/** Short note included in every session export (D4 / R8). */
export const SESSION_ANALYSIS_NOTES =
  'Suggested analyses: (1) compare time-on-task and turn count by risk branch; ' +
  '(2) measure whether elevated-risk users ask about clinician follow-up or preparation; ' +
  '(3) track which barriers and readiness states precede action-planning moves; ' +
  '(4) audit safety overrides and Groq fallback rates for reliability monitoring.';

export interface SessionData {
  consentGiven: boolean;
  screen: Screen;
  riskResult: RiskResult | null;
  messages: ChatMessage[];
  /** Diagnostics from the most recent assistant reply, for the developer panel and next-turn round-trip context. */
  latestDiagnostics: ChatDiagnostics | null;
  createdAt: string;
  updatedAt: string;
  /** When the user entered the chat screen after a risk result. */
  conversationStartedAt: string | null;
  /** Seconds from conversationStartedAt to updatedAt (recomputed on export). */
  timeOnTaskSeconds?: number;
  /** What we would analyze later — always present on export. */
  analysisNotes?: string;
}
