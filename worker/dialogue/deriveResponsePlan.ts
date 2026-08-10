/**
 * Generic response planner: SemanticTurn + memory → ResponsePlan.
 * Theory modifies goals; it never overrides the user's direct request.
 */

import type { AdaptiveState } from '../behavioral/state';
import type { TheoryConstruct } from '../behavioral/theoryMap';
import type { DecisionSupportState } from '../decisionSupport/types';
import type { DialogueRoute } from '../routing/types';
import type { ConversationMemory } from './conversationMemory';
import type { SemanticTurn } from './semanticTurn';
import type { RiskResult } from '../types';
import {
  getResponseContract,
  selectPrimaryGoal,
  type ResponseGoal,
} from './responseContracts';

export interface ResponsePlan {
  primaryGoal: string;
  secondaryGoals: string[];

  directAnswerRequired: boolean;

  mustAddress: string[];
  optionalDetails: string[];
  mustNotDo: string[];

  /** Preferred information sources for this plan (ordered). */
  informationSources: Array<
    | 'calculator_metadata'
    | 'deterministic_calculation'
    | 'medical_rag'
    | 'conversation_memory'
    | 'safety_policy'
  >;

  /** Alias synced from route/sources. */
  selectedInformationSources: Array<
    | 'calculator_metadata'
    | 'deterministic_calculation'
    | 'medical_rag'
    | 'conversation_memory'
    | 'safety_policy'
  >;

  factsNeeded: string[];
  calculationNeeded?: string;

  relevantMemory: string[];
  resolvedItemsNotToReopen: string[];

  shouldAskQuestion: boolean;
  questionPurpose?: string;

  responseStyle: {
    maximumWords: number;
    requestedFormat?: string;
    tone: string;
  };

  /** Compat fields for existing DialogueTurnPlan consumers. */
  dialogueAct?: string;
  topic?: string;
  primaryOperation?: string;
  secondaryOperations?: string[];
  explicitRequest?: string;
  requiredConcepts?: string[];
}

export interface DeriveResponsePlanInput {
  semanticTurn: SemanticTurn;
  conversationMemory: ConversationMemory;
  riskResult: RiskResult;
  adaptiveState?: AdaptiveState;
  decisionState?: DecisionSupportState;
  theoryConstruct?: TheoryConstruct;
  decisionSupportTheory?: TheoryConstruct;
  safetyOverride?: boolean;
  /** When present, the active route owns the primary goal; theory only modifies delivery. */
  dialogueRoute?: DialogueRoute;
}

function theoryModifiers(
  theory?: TheoryConstruct,
  decisionTheory?: TheoryConstruct,
): string[] {
  const goals: string[] = [];
  const texts = [theory, decisionTheory]
    .filter(Boolean)
    .map((t) => `${t!.theory} ${t!.construct} ${t!.objective}`.toLowerCase());

  for (const text of texts) {
    if (/fuzzy|gist|verbatim/.test(text)) {
      goals.push('clarify gist', 'distinguish probability from diagnosis');
    }
    if (/health belief|perceived barrier|self-efficacy|benefit/.test(text)) {
      goals.push('address an expressed barrier when present', 'support self-efficacy');
    }
    if (/motivational|autonomy|ambivalence/.test(text)) {
      goals.push('preserve autonomy', 'avoid pressure');
    }
    if (/ottawa|decision support|decisional/.test(text)) {
      goals.push('clarify missing information', 'clarify preferences when unresolved');
    }
  }
  return Array.from(new Set(goals));
}

function constraintsOf(turn: SemanticTurn): string[] {
  return turn.constraints.length > 0 ? turn.constraints : turn.userConstraints;
}

function styleFor(turn: SemanticTurn): ResponsePlan['responseStyle'] {
  const constraints = constraintsOf(turn);
  const format =
    turn.requestedOutputFormat ??
    turn.requestedFormat ??
    constraints.find((c) =>
      /short|brief|two short|natural frequency|one simple|formal|simple language/.test(c),
    );
  let maximumWords = 100;
  if (turn.topic === 'greeting' || turn.topic === 'closing') maximumWords = 45;
  else if (turn.primaryOperation === 'compare') maximumWords = 130;
  else if (
    turn.primaryOperation === 'list_information' &&
    /detailed/i.test(turn.requestedFormat ?? '')
  ) {
    maximumWords = 220;
  } else if (turn.secondaryOperations.length > 0) maximumWords = 160;
  else if (turn.topic === 'message_drafting') maximumWords = 180;
  else if (turn.requiresSafetyBoundary) maximumWords = 120;

  let tone = 'supportive educational';
  if (turn.emotion === 'worry' || turn.emotion === 'fear') tone = 'calm supportive';
  if (turn.stance === 'accepting' || turn.stance === 'planning') tone = 'confirming practical';
  if (constraints.some((c) => /less formal|informal/.test(c))) tone = 'conversational';

  return {
    maximumWords,
    requestedFormat: format,
    tone,
  };
}

function informationSourcesFor(
  turn: SemanticTurn,
  route?: DialogueRoute,
): ResponsePlan['informationSources'] {
  const mapOne = (
    source: string,
  ): ResponsePlan['informationSources'][number] | null => {
    switch (source) {
      case 'deterministic_calculation':
        return 'deterministic_calculation';
      case 'calculator_metadata':
        return 'calculator_metadata';
      case 'vetted_medical_rag':
      case 'medical_rag':
      case 'safety_boundary_and_rag':
        return 'medical_rag';
      case 'conversation_memory':
      case 'draft_and_constraints':
        return 'conversation_memory';
      case 'safety_boundary_policy':
      case 'safety_policy':
        return 'safety_policy';
      default:
        return null;
    }
  };

  if (route?.selectedInformationSources && route.selectedInformationSources.length > 0) {
    const mapped = route.selectedInformationSources
      .map(mapOne)
      .filter((s): s is ResponsePlan['informationSources'][number] => Boolean(s));
    if (mapped.length > 0) return Array.from(new Set(mapped));
  }
  if (route?.selectedInformationSource) {
    const mapped = mapOne(route.selectedInformationSource);
    if (mapped) return [mapped];
  }
  if (turn.requiresSafetyBoundary || route?.safetyBoundaryRequired) {
    return route?.medicalEvidenceRequired ? ['safety_policy', 'medical_rag'] : ['safety_policy'];
  }
  if (turn.requiresCalculation || route?.deterministicCalculationRequired) {
    return ['deterministic_calculation'];
  }
  if (turn.requiresCalculatorMetadata || route?.calculatorMetadataRequired) {
    return ['calculator_metadata'];
  }
  if (
    turn.primaryOperation === 'address_barrier' ||
    turn.topic === 'communication_support' ||
    turn.topic === 'message_drafting' ||
    turn.topic === 'action_planning' ||
    turn.topic === 'greeting' ||
    turn.topic === 'closing' ||
    turn.topic === 'emotion'
  ) {
    return ['conversation_memory'];
  }
  if (turn.requiresMedicalEvidence) return ['medical_rag'];
  return ['conversation_memory'];
}

function dialogueActFor(goal: ResponseGoal): string {
  switch (goal) {
    case 'apply_screening_boundary':
    case 'maintain_safety':
      return 'fixed_safety';
    case 'address_practical_barrier':
      return 'explore_barrier';
    case 'confirm_understanding':
      return 'confirm_progress';
    case 'respect_decision_deferral':
    case 'close_supportively':
      return 'close_conversation';
    case 'acknowledge_emotion':
      return 'acknowledge_emotion';
    case 'open_conversation':
      return 'greet_user';
    case 'clarify_short_reply':
      return 'ask_clarification';
    case 'provide_practical_help':
    case 'provide_next_step_options':
      return 'plan_action';
    default:
      return 'explain_information';
  }
}

/**
 * Derives a ResponsePlan from semantic meaning and memory — not canned sentences.
 */
export function deriveResponsePlan(input: DeriveResponsePlanInput): ResponsePlan {
  const { semanticTurn: turn, conversationMemory: memory, riskResult } = input;
  const theoryGoals = theoryModifiers(input.theoryConstruct, input.decisionSupportTheory);
  const resolved = [
    ...memory.understoodConcepts,
    ...memory.answeredQuestions,
    ...(memory.resolvedIssues ?? []),
  ];
  const relevantMemory = [
    ...memory.understoodConcepts.map((c) => `understood: ${c}`),
    ...memory.selectedOptions.map((o) => `selected: ${o}`),
    ...(memory.plannedTiming ? [`timing: ${memory.plannedTiming}`] : []),
    ...(memory.acceptedDraft ? ['draft accepted'] : []),
  ];

  const route = input.dialogueRoute;
  const primaryGoal: ResponseGoal =
    input.safetyOverride || turn.requiresSafetyBoundary
      ? turn.topic === 'screening_guidance' || route?.topic === 'screening_guidance'
        ? 'apply_screening_boundary'
        : 'maintain_safety'
      : selectPrimaryGoal(turn, route, riskResult);

  const contract = getResponseContract(primaryGoal);
  const sources = informationSourcesFor(turn, route);
  const constraints = constraintsOf(turn);

  const baseMustNot = [
    ...contract.mustNotDo,
    'invent unsupported emotion or barrier',
    'expose internal labels',
    ...resolved.map((item) => `reopen resolved: ${item}`),
    ...theoryGoals.filter((g) => /avoid pressure/.test(g)).map(() => 'press for action'),
  ];

  const mustAddress = [...contract.mustAddress];
  if (turn.emotion !== 'not_expressed' && !mustAddress.some((m) => /concern|emotion/i.test(m))) {
    if (
      primaryGoal === 'explain_five_year_risk_meaning' ||
      primaryGoal === 'answer_concern_calibration' ||
      primaryGoal === 'provide_next_step_options'
    ) {
      mustAddress.push('brief acknowledgment of expressed concern');
    }
  }

  // Barrier-specific mustAddress refinements.
  if (primaryGoal === 'address_practical_barrier') {
    const barrierEvidence = turn.evidence?.barrier ?? turn.currentTurnEvidence.barrier;
    const callingDuringWork =
      turn.barrier === 'time' &&
      (constraints.some((c) => /call|work/i.test(c)) ||
        /call|work/i.test(barrierEvidence) ||
        /call during work/i.test(turn.explicitRequest));
    mustAddress.length = 0;
    if (callingDuringWork) {
      mustAddress.push(
        'calling during work is difficult',
        'one optional alternative compatible with the user’s schedule',
      );
    } else {
      mustAddress.push(`acknowledged ${turn.barrier} barrier`, 'one manageable optional next step');
    }
  }

  if (primaryGoal === 'convert_to_natural_frequency') {
    mustAddress.length = 0;
    mustAddress.push(
      'approximate numerator and denominator',
      'correct time horizon',
      'probabilistic wording',
    );
  }

  const shouldAskQuestion =
    primaryGoal === 'address_practical_barrier' ||
    primaryGoal === 'acknowledge_emotion' ||
    primaryGoal === 'open_conversation' ||
    primaryGoal === 'clarify_short_reply' ||
    (primaryGoal === 'provide_next_step_options' && !constraints.includes('one simple step')) ||
    (primaryGoal === 'provide_practical_help' &&
      turn.topic === 'message_drafting' &&
      turn.primaryOperation === 'confirm' &&
      !memory.plannedTiming);

  let questionPurpose: string | undefined;
  if (primaryGoal === 'address_practical_barrier') {
    questionPurpose =
      turn.barrier === 'time'
        ? 'clarify whether written communication would fit better'
        : 'barrier_exploration';
  } else if (primaryGoal === 'provide_next_step_options') {
    questionPurpose = 'action_planning';
  } else if (primaryGoal === 'open_conversation') {
    questionPurpose = 'invite_topic';
  } else if (primaryGoal === 'clarify_short_reply') {
    questionPurpose = 'clarification';
  } else if (primaryGoal === 'acknowledge_emotion') {
    questionPurpose = 'next_concern';
  } else if (shouldAskQuestion && turn.topic === 'message_drafting') {
    questionPurpose = 'timing';
  }

  const secondaryGoals = [
    ...theoryGoals.slice(0, 3),
    ...(turn.emotion !== 'not_expressed' && primaryGoal === 'provide_next_step_options'
      ? ['briefly acknowledge concern']
      : []),
  ];

  return {
    primaryGoal,
    secondaryGoals: Array.from(new Set(secondaryGoals)),
    directAnswerRequired: turn.directAnswerRequired && primaryGoal !== 'clarify_short_reply',
    mustAddress,
    optionalDetails: [],
    mustNotDo: Array.from(new Set(baseMustNot)),
    informationSources: sources,
    selectedInformationSources: sources,
    factsNeeded:
      primaryGoal === 'convert_to_natural_frequency'
        ? ['risk estimate', 'time horizon']
        : primaryGoal === 'explain_calculator_inputs'
          ? turn.secondaryOperations.includes('identify_limitation')
            ? ['calculator metadata', 'calculator limitations']
            : ['calculator metadata']
          : primaryGoal === 'explain_calculator_result_source'
            ? ['calculator metadata']
            : primaryGoal === 'explain_calculator_limitations'
              ? ['calculator limitations', 'uncertainty']
              : primaryGoal === 'compare_time_horizons'
                ? ['five-year versus lifetime risk']
                : primaryGoal === 'provide_next_step_options'
                  ? ['professional interpretation options']
                  : contract.requiredConcepts,
    calculationNeeded:
      primaryGoal === 'convert_to_natural_frequency'
        ? `natural frequency for ${turn.entities.riskValue ?? riskResult.fiveYearRisk}% out of ${turn.entities.denominator ?? 100}`
        : undefined,
    relevantMemory,
    resolvedItemsNotToReopen: resolved,
    shouldAskQuestion,
    questionPurpose,
    responseStyle: styleFor(turn),
    dialogueAct: dialogueActFor(primaryGoal),
    topic: route?.topic ?? turn.topic,
    primaryOperation: route?.primaryOperation ?? turn.primaryOperation,
    secondaryOperations: route?.secondaryOperations ?? turn.secondaryOperations,
    explicitRequest: route?.explicitRequest ?? turn.explicitRequest,
    requiredConcepts: contract.requiredConcepts,
  };
}
