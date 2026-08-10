/**
 * Global dialogue router: maps semantic meaning + memory → DialogueRoute.
 * Uses reusable semantic dimensions — not sentence-specific production rules.
 */

import type { ConversationMemory } from '../dialogue/conversationMemory';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import { detectSemanticFeatures, interpretSemanticTurnLocal } from '../dialogue/semanticTurn';
import type { PendingConversationItem } from '../dialogue/types';
import type { RiskResult } from '../types';
import type {
  DialogueRoute,
  InformationSource,
  RoutingBarrier,
  RoutingEmotion,
  RoutingOperation,
  RoutingStance,
  RoutingTopic,
} from './types';

export interface RouteDialogueTurnInput {
  latestMessage: string;
  riskResult: RiskResult;
  semanticTurn?: SemanticTurn;
  conversationMemory?: ConversationMemory;
  pendingItem?: PendingConversationItem;
  previousAssistantReply?: string;
  previousDraftPending?: boolean;
  safetyOverride?: boolean;
  previousRoute?: DialogueRoute | null;
  previousPrimaryGoal?: string | null;
}

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%.\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Feature: individualized screening / imaging schedule request. */
function detectsScreeningGuidance(message: string): boolean {
  return (
    /\b(mammogram|mri|ultrasound|screening schedule|screening (test|interval)|how often (should|do) i (get|have|screen)|need (a |an )?(mammogram|mri|ultrasound|screening))\b/.test(
      message,
    ) ||
    /\b(determine|decide|set).{0,40}(screening|mammogram|mri)\b/.test(message) ||
    /\b(based on (this|the) (number|result|score|estimate)).{0,40}(mammogram|mri|screening)\b/.test(
      message,
    ) ||
    /\b(mammogram|mri|screening).{0,40}(based on|from) (this|the) (number|result|score)\b/.test(
      message,
    )
  );
}

/** Feature: deferral / postpone action without rejecting the draft entirely. */
function detectsDeferral(message: string): boolean {
  return (
    /\b(save it|decide later|not (sending|send) it yet|another day|keep(ing)? the draft|maybe (i will|i'll)|later (on|today|this week)|not ready (to send|yet)|hold off|put (it|this) aside)\b/.test(
      message,
    ) ||
    (/\b(later|not yet|eventually)\b/.test(message) &&
      /\b(send|decide|use|draft|message)\b/.test(message) &&
      !/\b(tonight|today|tomorrow|after work)\b/.test(message))
  );
}

/** Feature: explicit return to a prior practical / schedule topic. */
function detectsReturnToWorkSchedule(message: string): boolean {
  return (
    /\b(return to|back to|about|regarding).{0,40}(work[- ]?schedule|calling|phone|schedule issue)\b/.test(
      message,
    ) || /\b(work[- ]?schedule issue|calling (issue|problem|barrier))\b/.test(message)
  );
}

function mapTopic(turn: SemanticTurn, message: string, memory?: ConversationMemory): RoutingTopic {
  if (detectsScreeningGuidance(message)) return 'screening_guidance';
  if (
    detectsReturnToWorkSchedule(message) &&
    (memory?.currentBarrier === 'time' ||
      memory?.currentTopic === 'communication_support' ||
      memory?.unresolvedNeed?.includes('work schedule'))
  ) {
    return 'communication_support';
  }

  switch (turn.topic) {
    case 'risk_meaning':
      return 'risk_meaning';
    case 'risk_level':
      return 'risk_level';
    case 'risk_uncertainty':
      return 'risk_uncertainty';
    case 'risk_representation':
      return 'risk_representation';
    case 'time_horizon':
      return 'time_horizon';
    case 'calculator_inputs':
      return 'calculator_inputs';
    case 'calculator_limitations':
      return 'calculator_limitations';
    case 'calculator_validation':
    case 'calculator_result_source':
      return 'calculator_validation';
    case 'calculator_applicability':
      return 'calculator_applicability';
    case 'evidence_source':
      return 'evidence_source';
    case 'screening_guidance':
      return 'screening_guidance';
    case 'symptom_guidance':
      return 'symptom_guidance';
    case 'professional_interpretation':
      return 'professional_interpretation';
    case 'lifestyle_risk_information':
      return 'lifestyle_risk_information';
    case 'communication_support':
      return 'communication_support';
    case 'message_drafting':
      return 'message_drafting';
    case 'action_planning':
      return 'action_planning';
    case 'conversation_summary':
      return 'conversation_summary';
    case 'emotion':
      return 'emotion';
    case 'greeting':
      return 'greeting';
    case 'closing':
      return 'closing';
    case 'safety':
      return 'safety';
    case 'out_of_scope':
      return 'out_of_scope';
    default:
      return 'unclear';
  }
}

function mapOperation(
  turn: SemanticTurn,
  topic: RoutingTopic,
  message: string,
): RoutingOperation {
  if (topic === 'screening_guidance') return 'set_boundary';
  if (topic === 'safety') return 'set_boundary';
  if (detectsDeferral(message) && (topic === 'action_planning' || topic === 'message_drafting')) {
    return 'defer';
  }

  switch (turn.primaryOperation) {
    case 'convert':
      return 'convert';
    case 'compare':
      return 'compare';
    case 'correct_misunderstanding':
      return 'correct_misunderstanding';
    case 'verify_understanding':
      return 'verify_understanding';
    case 'simplify':
      return 'simplify';
    case 'explain':
    case 'elaborate':
      return topic === 'calculator_limitations' ? 'identify_limitation' : 'explain';
    case 'list_information':
      return 'list_information';
    case 'answer_factual_question':
      return 'answer_factual_question';
    case 'answer_general_health_question':
      return 'answer_general_health_question';
    case 'explain_lifestyle_relationship':
      return 'explain_lifestyle_relationship';
    case 'set_personalized_advice_boundary':
      return 'set_personalized_advice_boundary';
    case 'provide_preparation_information':
      return 'provide_preparation_information';
    case 'identify_limitation':
      return 'identify_limitation';
    case 'address_barrier':
      return 'address_barrier';
    case 'provide_options':
      return 'provide_options';
    case 'plan':
    case 'clarify_preference':
      return turn.barrier !== 'not_expressed' && turn.barrier !== 'none'
        ? 'address_barrier'
        : 'provide_options';
    case 'draft':
      return 'draft';
    case 'revise':
      return 'revise';
    case 'review':
      return 'review';
    case 'confirm':
      return 'confirm';
    case 'reject':
      return 'reject';
    case 'defer':
      return 'defer';
    case 'close':
      return 'close';
    case 'set_boundary':
      return 'set_boundary';
    case 'request_clarification':
      return 'request_clarification';
    case 'summarize':
      return 'explain';
    default:
      return 'request_clarification';
  }
}

function mapStance(turn: SemanticTurn, operation: RoutingOperation): RoutingStance {
  if (operation === 'defer') return 'deferring';
  switch (turn.stance) {
    case 'asking':
      return 'asking';
    case 'asserting':
      return 'asserting';
    case 'correcting':
      return 'correcting';
    case 'confirming':
      return 'confirming';
    case 'accepting':
      return 'accepting';
    case 'rejecting':
      return 'rejecting';
    case 'deferring':
      return 'deferring';
    case 'planning':
      return 'planning';
    case 'completed':
      return 'completed';
    case 'uncertain':
      return 'uncertain';
    default:
      return operation === 'verify_understanding' || operation === 'confirm' ? 'confirming' : 'neutral';
  }
}

function mapEmotion(turn: SemanticTurn): RoutingEmotion {
  if (turn.emotion === 'relief') return 'none';
  if (
    turn.emotion === 'fear' ||
    turn.emotion === 'worry' ||
    turn.emotion === 'frustration' ||
    turn.emotion === 'confusion' ||
    turn.emotion === 'none' ||
    turn.emotion === 'not_expressed'
  ) {
    return turn.emotion;
  }
  return 'not_expressed';
}

function mapBarrier(turn: SemanticTurn): RoutingBarrier {
  if (turn.barrier === 'none' || turn.barrier === 'not_expressed') return turn.barrier;
  return turn.barrier;
}

function selectSource(route: {
  topic: RoutingTopic;
  primaryOperation: RoutingOperation;
  barrier: RoutingBarrier;
  medicalEvidenceRequired: boolean;
  calculatorMetadataRequired: boolean;
  deterministicCalculationRequired: boolean;
  safetyBoundaryRequired: boolean;
  hasLimitationSecondary: boolean;
}): InformationSource {
  if (route.safetyBoundaryRequired || route.primaryOperation === 'set_boundary') {
    return route.medicalEvidenceRequired ? 'safety_boundary_and_rag' : 'safety_boundary_policy';
  }
  if (route.deterministicCalculationRequired || route.primaryOperation === 'convert') {
    return 'deterministic_calculation';
  }
  // Greeting / closing / pure emotion: no medical RAG.
  if (route.topic === 'greeting' || route.topic === 'closing' || route.topic === 'emotion') {
    return 'none';
  }
  if (route.topic === 'message_drafting') return 'draft_and_constraints';
  // Personal-info / validation questions use calculator metadata.
  if (route.topic === 'calculator_validation' || route.topic === 'evidence_source') {
    return 'calculator_metadata';
  }
  // Inputs list alone → metadata; inputs+limitations needs vetted limitation evidence.
  if (route.topic === 'calculator_inputs') {
    return route.hasLimitationSecondary ? 'vetted_medical_rag' : 'calculator_metadata';
  }
  // Time barriers are practical (memory); access/cost often need professional-interpretation RAG.
  if (route.primaryOperation === 'address_barrier' || route.topic === 'communication_support') {
    if (route.barrier === 'access' || route.barrier === 'cost') {
      return 'vetted_medical_rag';
    }
    return 'conversation_memory';
  }
  if (route.primaryOperation === 'confirm' || route.primaryOperation === 'defer') {
    return 'conversation_memory';
  }
  if (route.medicalEvidenceRequired) return 'vetted_medical_rag';
  if (
    route.topic === 'risk_meaning' ||
    route.topic === 'risk_level' ||
    route.topic === 'risk_representation' ||
    route.topic === 'time_horizon' ||
    route.topic === 'calculator_limitations' ||
    route.topic === 'professional_interpretation' ||
    route.topic === 'lifestyle_risk_information' ||
    route.primaryOperation === 'answer_general_health_question' ||
    route.primaryOperation === 'provide_preparation_information'
  ) {
    return 'vetted_medical_rag';
  }
  return 'none';
}

function buildExplicitRequest(
  topic: RoutingTopic,
  operation: RoutingOperation,
  turn: SemanticTurn,
  message: string,
): string {
  if (topic === 'screening_guidance') {
    return 'Answer the screening question with an individualized-advice boundary; do not give a personal screening recommendation.';
  }
  if (operation === 'defer') {
    return 'Acknowledge deferral without pressure and leave follow-up open.';
  }
  if (detectsReturnToWorkSchedule(normalize(message))) {
    return 'Resume support for the work-schedule / calling barrier without reopening risk explanation.';
  }
  return turn.explicitRequest;
}

/**
 * Routes the latest turn into a single DialogueRoute using priority:
 * safety → direct question/operation → correction → barrier → emotion →
 * pending item → unresolved need → older state.
 */
export function routeDialogueTurn(input: RouteDialogueTurnInput): DialogueRoute {
  const message = normalize(input.latestMessage);
  const features = detectSemanticFeatures(input.latestMessage);

  if (input.safetyOverride) {
    return {
      topic: 'safety',
      primaryOperation: 'set_boundary',
      operation: 'set_boundary',
      secondaryOperations: [],
      stance: 'asking',
      explicitRequest: 'Apply the appropriate safety boundary.',
      directAnswerRequired: true,
      safetyBoundaryRequired: true,
      medicalEvidenceRequired: false,
      calculatorMetadataRequired: false,
      deterministicCalculationRequired: false,
      conversationContextRequired: false,
      clarificationRequired: false,
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      understanding: 'not_assessable',
      currentTurnEvidence: {
        topic: 'safety',
        operation: 'set_boundary',
        stance: 'asking',
        emotion: 'not expressed',
        barrier: 'not expressed',
      },
      selectedInformationSource: 'safety_boundary_policy',
      selectedInformationSources: ['safety_boundary_policy'],
      confidence: 1,
      routingMode: 'deterministic-safety',
    };
  }

  const turn =
    input.semanticTurn ??
    interpretSemanticTurnLocal({
      latestMessage: input.latestMessage,
      riskResult: input.riskResult,
      pendingItem: input.pendingItem,
      previousAssistantReply: input.previousAssistantReply,
      previousDraftPending: input.previousDraftPending,
    });

  // Priority overrides on top of semantic turn.
  let topic = mapTopic(turn, message, input.conversationMemory);
  let primaryOperation = mapOperation(turn, topic, message);

  // Resume prior communication-support when user explicitly returns.
  if (detectsReturnToWorkSchedule(message)) {
    topic = 'communication_support';
    primaryOperation = 'address_barrier';
  }

  // Deferral outranks action-planning confirm/plan when expressed.
  if (detectsDeferral(message) && !features.commitsTiming) {
    topic = topic === 'message_drafting' ? 'message_drafting' : 'action_planning';
    primaryOperation = 'defer';
  }

  // Screening guidance outranks generic risk explanation.
  if (detectsScreeningGuidance(message)) {
    topic = 'screening_guidance';
    primaryOperation = 'set_boundary';
  }

  // Lifestyle / preparation category overrides stale professional or unclear topics.
  if (features.asksLifestyleFocus && !features.asksPreparationInfo) {
    topic = 'lifestyle_risk_information';
    primaryOperation = 'answer_general_health_question';
  }
  if (features.asksPreparationInfo) {
    topic = 'professional_interpretation';
    primaryOperation = 'provide_preparation_information';
  }

  // Personal-data / calculator provenance questions.
  if (
    /\b(personal information|based on my|my (own )?information|my (medical|clinical) (record|chart|data)|prototype inputs?)\b/.test(
      message,
    )
  ) {
    topic = 'calculator_validation';
    primaryOperation = 'answer_factual_question';
  }

  // Time barrier with asserted understanding must not stay on risk topics.
  if (
    (turn.primaryOperation === 'address_barrier' || features.expressesBarrier === 'time') &&
    (features.assertsUnderstanding || turn.understanding === 'correct') &&
    topic !== 'screening_guidance'
  ) {
    topic = 'communication_support';
    primaryOperation = 'address_barrier';
  }

  const stance = mapStance(turn, primaryOperation);
  const emotion = mapEmotion(turn);
  let barrier = mapBarrier(turn);
  if (primaryOperation === 'address_barrier' && barrier === 'not_expressed') {
    barrier =
      features.expressesBarrier !== 'not_expressed' ? features.expressesBarrier : 'time';
  }

  const safetyBoundaryRequired =
    turn.requiresSafetyBoundary ||
    primaryOperation === 'set_boundary' ||
    topic === 'screening_guidance' ||
    topic === 'safety';

  const deterministicCalculationRequired =
    primaryOperation === 'convert' ||
    turn.requiresCalculation ||
    turn.requiresDeterministicCalculation;
  const calculatorMetadataRequired =
    topic === 'calculator_inputs' ||
    topic === 'calculator_validation' ||
    topic === 'evidence_source' ||
    turn.requiresCalculatorMetadata ||
    /\b(personal information|my (own )?information|based on my|prototype|which calculator|what (model|tool))\b/.test(
      message,
    );

  const medicalEvidenceRequired =
    topic !== 'emotion' &&
    topic !== 'greeting' &&
    topic !== 'closing' &&
    !safetyBoundaryRequired &&
    (turn.requiresMedicalEvidence ||
      topic === 'risk_meaning' ||
      topic === 'risk_level' ||
      topic === 'risk_representation' ||
      topic === 'time_horizon' ||
      topic === 'calculator_limitations' ||
      topic === 'professional_interpretation' ||
      topic === 'lifestyle_risk_information' ||
      primaryOperation === 'correct_misunderstanding' ||
      primaryOperation === 'explain' ||
      primaryOperation === 'simplify' ||
      primaryOperation === 'answer_general_health_question' ||
      primaryOperation === 'provide_preparation_information' ||
      ((barrier === 'access' || barrier === 'cost') && primaryOperation === 'address_barrier'));

  const conversationContextRequired =
    turn.requiresConversationContext ||
    primaryOperation === 'address_barrier' ||
    primaryOperation === 'confirm' ||
    primaryOperation === 'defer' ||
    primaryOperation === 'draft' ||
    primaryOperation === 'revise' ||
    primaryOperation === 'review' ||
    detectsReturnToWorkSchedule(message);

  const secondaryOperations: RoutingOperation[] = [];
  if (turn.secondaryOperations.includes('summarize')) secondaryOperations.push('explain');
  if (
    topic === 'calculator_inputs' &&
    turn.secondaryOperations.includes('identify_limitation')
  ) {
    secondaryOperations.push('identify_limitation');
  }

  const explicitRequest = buildExplicitRequest(topic, primaryOperation, turn, input.latestMessage);
  const selectedInformationSourceRaw = selectSource({
    topic,
    primaryOperation,
    barrier,
    medicalEvidenceRequired:
      medicalEvidenceRequired || (topic === 'screening_guidance' && false),
    calculatorMetadataRequired,
    deterministicCalculationRequired,
    safetyBoundaryRequired,
    hasLimitationSecondary: secondaryOperations.includes('identify_limitation'),
  });

  const selectedInformationSource =
    topic === 'screening_guidance' ? 'safety_boundary_and_rag' : selectedInformationSourceRaw;
  const route: DialogueRoute = {
    topic,
    primaryOperation,
    operation: primaryOperation,
    secondaryOperations,
    stance: primaryOperation === 'defer' || primaryOperation === 'reject' ? 'deferring' : stance,
    explicitRequest,
    directAnswerRequired: primaryOperation !== 'request_clarification',
    safetyBoundaryRequired,
    medicalEvidenceRequired:
      topic === 'screening_guidance' || topic === 'emotion' ? false : medicalEvidenceRequired,
    calculatorMetadataRequired,
    deterministicCalculationRequired,
    conversationContextRequired,
    clarificationRequired: turn.requiresClarification || primaryOperation === 'request_clarification',
    emotion,
    barrier,
    understanding: turn.understanding,
    currentTurnEvidence: {
      topic: turn.currentTurnEvidence.topic || topic,
      operation: turn.currentTurnEvidence.operation || primaryOperation,
      stance:
        primaryOperation === 'defer' || primaryOperation === 'reject'
          ? 'deferring'
          : turn.stance,
      emotion: turn.currentTurnEvidence.emotion || 'not expressed',
      barrier:
        primaryOperation === 'address_barrier'
          ? turn.currentTurnEvidence.barrier || features.expressesBarrier
          : turn.currentTurnEvidence.barrier || 'not expressed',
    },
    selectedInformationSource,
    selectedInformationSources: [selectedInformationSource],
    confidence: Math.max(turn.confidence, detectsScreeningGuidance(message) || detectsDeferral(message) ? 0.9 : 0),
    routingMode:
      turn.classificationMode === 'groq-structured' ? 'groq-structured' : 'local-semantic-fallback',
  };

  return route;
}

/**
 * Maps a DialogueRoute to the dialogue strategy that should deliver it.
 * Theory/strategy must not override the route's primary operation.
 */
export function strategyForRoute(route: DialogueRoute): string {
  if (route.topic === 'safety' && route.primaryOperation === 'set_boundary') {
    return 'safety_boundary';
  }
  // Screening uses clarify_risk delivery channel; the route plan owns the boundary wording.
  if (route.topic === 'screening_guidance') {
    return 'clarify_risk';
  }
  // Pure emotion turns: acknowledge. Emotion must not rewrite a concrete factual request.
  if (route.topic === 'emotion') {
    return 'acknowledge_emotion';
  }
  switch (route.primaryOperation) {
    case 'set_boundary':
      return 'safety_boundary';
    case 'convert':
    case 'explain':
    case 'simplify':
    case 'compare':
    case 'correct_misunderstanding':
    case 'list_information':
    case 'identify_limitation':
    case 'answer_factual_question':
    case 'provide_preparation_information':
    case 'set_personalized_advice_boundary':
      return 'clarify_risk';
    case 'answer_general_health_question':
    case 'explain_lifestyle_relationship':
      // HBM perceived benefits + cue-to-action delivery for lifestyle motivation.
      return 'explain_benefit';
    case 'verify_understanding':
      return 'confirm_progress';
    case 'address_barrier':
      return 'explore_barrier';
    case 'provide_options':
    case 'plan':
    case 'draft':
    case 'revise':
      return 'action_planning';
    case 'confirm':
      return 'confirm_progress';
    case 'reject':
    case 'defer':
      return 'close_supportively';
    case 'close':
      return 'close_supportively';
    case 'review':
      return 'confirm_progress';
    default:
      return 'ask_clarification';
  }
}
