/**
 * Response contracts: map specific primary goals to mustAddress / mustNotDo / requiredConcepts.
 * Prefer specific goals over bare answer_question.
 */

import type { DialogueRoute } from '../routing/types';
import type { RiskResult } from '../types';
import type { SemanticTurn } from './semanticTurn';
import { detectSemanticFeatures } from './semanticTurn';

export type ResponseGoal =
  | 'simplify_risk_explanation'
  | 'convert_to_natural_frequency'
  | 'explain_average_risk_label'
  | 'explain_elevated_risk_label'
  | 'correct_zero_risk_misunderstanding'
  | 'correct_diagnosis_misunderstanding'
  | 'correct_certainty_misunderstanding'
  | 'answer_concern_calibration'
  | 'address_practical_barrier'
  | 'apply_screening_boundary'
  | 'explain_five_year_risk_meaning'
  | 'compare_time_horizons'
  | 'respect_decision_deferral'
  | 'explain_calculator_inputs'
  | 'explain_calculator_result_source'
  | 'explain_calculator_limitations'
  | 'provide_next_step_options'
  | 'answer_general_lifestyle_question_with_boundary'
  | 'provide_preparation_information'
  | 'list_questions_for_clinician'
  | 'confirm_understanding'
  | 'acknowledge_emotion'
  | 'provide_practical_help'
  | 'maintain_safety'
  | 'close_supportively'
  | 'open_conversation'
  | 'clarify_short_reply'
  | 'answer_question';

export interface ResponseContract {
  mustAddress: string[];
  mustNotDo: string[];
  requiredConcepts: string[];
}

const CONTRACTS: Record<ResponseGoal, ResponseContract> = {
  simplify_risk_explanation: {
    mustAddress: ['plain nontechnical meaning of the five-year estimate', 'not a diagnosis'],
    mustNotDo: ['use dense jargon', 'replace simplification with readiness exploration'],
    requiredConcepts: ['probability', 'five-year horizon', 'plain language'],
  },
  convert_to_natural_frequency: {
    mustAddress: ['approximate people-out-of-N framing', 'time horizon', 'approximate wording'],
    mustNotDo: ['generic risk definition without conversion', 'readiness exploration'],
    requiredConcepts: ['natural frequency', 'denominator', 'approximation'],
  },
  explain_average_risk_label: {
    mustAddress: ['what average/comparison risk level means', 'not zero risk'],
    mustNotDo: ['say average means safe/zero risk', 'diagnose'],
    requiredConcepts: ['average risk label', 'comparison level'],
  },
  explain_elevated_risk_label: {
    mustAddress: ['elevated versus comparison/average level', 'not a current diagnosis'],
    mustNotDo: ['equate elevated with cancer diagnosis', 'lifetime-only detour', 'natural frequency unless asked'],
    requiredConcepts: ['elevated risk label', 'comparison level'],
  },
  correct_zero_risk_misunderstanding: {
    mustAddress: ['average/low is not zero risk', 'probability still present'],
    mustNotDo: ['agree that average means safe/zero', 'infer unsupported fear'],
    requiredConcepts: ['average_means_zero_risk correction'],
  },
  correct_diagnosis_misunderstanding: {
    mustAddress: ['estimate is not a diagnosis', 'population-level probability'],
    mustNotDo: ['confirm diagnosis', 'provide treatment advice'],
    requiredConcepts: ['risk_means_diagnosis correction'],
  },
  correct_certainty_misunderstanding: {
    mustAddress: ['cannot predict one individual outcome with certainty', 'population probability'],
    mustNotDo: ['claim individual certainty', 'infer unsupported fear'],
    requiredConcepts: ['risk_means_certainty correction'],
  },
  answer_concern_calibration: {
    mustAddress: ['calibrate concern to the demonstration risk level', 'avoid personalized medical advice'],
    mustNotDo: ['tell the user exactly how worried to feel as clinical advice', 'diagnose'],
    requiredConcepts: ['concern calibration', 'risk level'],
  },
  address_practical_barrier: {
    mustAddress: ['acknowledged practical barrier', 'one manageable optional alternative'],
    mustNotDo: ['reopen full risk explanation', 'assume portal access', 'infer unsupported emotion'],
    requiredConcepts: ['barrier acknowledgment'],
  },
  apply_screening_boundary: {
    mustAddress: [
      'screening decisions are individualized',
      'demonstration estimate cannot set a personal screening schedule',
    ],
    mustNotDo: ['give personalized screening recommendation', 'generic risk lecture only'],
    requiredConcepts: ['screening boundary'],
  },
  explain_five_year_risk_meaning: {
    mustAddress: ['probabilistic meaning of the five-year estimate', 'not a diagnosis'],
    mustNotDo: ['replace with readiness exploration', 'lifetime-only answer when five-year asked'],
    requiredConcepts: ['five-year risk meaning', 'probability'],
  },
  compare_time_horizons: {
    mustAddress: ['five-year meaning', 'lifetime meaning', 'key difference'],
    mustNotDo: ['explain only one horizon', 'unrelated next-step advice'],
    requiredConcepts: ['five-year', 'lifetime'],
  },
  respect_decision_deferral: {
    mustAddress: ['acknowledge deferral without pressure'],
    mustNotDo: ['force timing commitment', 'shame the user'],
    requiredConcepts: ['deferral respect'],
  },
  explain_calculator_inputs: {
    mustAddress: ['calculator input factors used in this demonstration'],
    mustNotDo: ['generic risk lecture without listing inputs'],
    requiredConcepts: ['calculator inputs'],
  },
  explain_calculator_result_source: {
    mustAddress: ['whether the demonstration uses personal clinical data'],
    mustNotDo: ['invent personal chart access', 'readiness exploration'],
    requiredConcepts: ['calculator result source', 'prototype inputs'],
  },
  explain_calculator_limitations: {
    mustAddress: ['why a population probability cannot predict one individual outcome'],
    mustNotDo: ['restart generic percentage definition without answering the limitation'],
    requiredConcepts: ['calculator limitations', 'uncertainty'],
  },
  provide_next_step_options: {
    mustAddress: ['neutral general next-step options'],
    mustNotDo: ['prescribe a required clinical action', 'pressure commitment'],
    requiredConcepts: ['professional interpretation options'],
  },
  answer_general_lifestyle_question_with_boundary: {
    mustAddress: [
      'general relationship of lifestyle/exercise/diet to health or risk at a population level',
      'motivational benefit or first-step framing without prescribing treatment',
      'personalized-advice boundary',
    ],
    mustNotDo: [
      'assume patient portal access',
      'assume a next appointment',
      'give a personalized exercise prescription',
      'recommend medication or a cancer treatment plan',
      'replace with readiness or self-efficacy exploration',
    ],
    requiredConcepts: ['lifestyle information', 'advice boundary'],
  },
  provide_preparation_information: {
    mustAddress: [
      'general preparation ideas before talking with a healthcare professional',
    ],
    mustNotDo: [
      'assume patient portal access',
      'assume a next or existing appointment',
      'prescribe a required clinical action',
    ],
    requiredConcepts: ['preparation information'],
  },
  list_questions_for_clinician: {
    mustAddress: [
      'a short list of general questions the user could ask a healthcare professional about a demonstration risk estimate',
      'boundary that these are general preparation ideas, not personalized clinical advice',
    ],
    mustNotDo: [
      'draft a portal or clinic message unless explicitly requested',
      'assume patient portal access',
      'assume a next or existing appointment',
      'replace the question list with readiness exploration',
    ],
    requiredConcepts: ['clinician questions', 'preparation boundary'],
  },
  confirm_understanding: {
    mustAddress: ['acknowledge correct understanding'],
    mustNotDo: ['repeat the full prior risk explanation'],
    requiredConcepts: ['understanding confirmation'],
  },
  acknowledge_emotion: {
    mustAddress: ['acknowledge evidenced emotion only'],
    mustNotDo: ['invent a barrier', 'replace with risk lecture'],
    requiredConcepts: ['emotion acknowledgment'],
  },
  provide_practical_help: {
    mustAddress: ['requested practical help'],
    mustNotDo: ['return to risk explanation when not requested'],
    requiredConcepts: ['practical help'],
  },
  maintain_safety: {
    mustAddress: ['safety boundary'],
    mustNotDo: ['provide diagnosis', 'provide treatment advice'],
    requiredConcepts: ['safety'],
  },
  close_supportively: {
    mustAddress: ['supportive closing'],
    mustNotDo: ['open a new barrier demand'],
    requiredConcepts: ['closing'],
  },
  open_conversation: {
    mustAddress: ['brief greeting as educational demonstration guide'],
    mustNotDo: ['auto-explain risk', 'invent worry'],
    requiredConcepts: ['greeting'],
  },
  clarify_short_reply: {
    mustAddress: ['one clarifying question about the user request'],
    mustNotDo: ['guess unsupported medical facts'],
    requiredConcepts: ['clarification'],
  },
  answer_question: {
    mustAddress: ['the explicit user question'],
    mustNotDo: ['replace with unrelated readiness exploration'],
    requiredConcepts: ['direct answer'],
  },
};

export function getResponseContract(primaryGoal: string): ResponseContract {
  if (primaryGoal in CONTRACTS) {
    return CONTRACTS[primaryGoal as ResponseGoal];
  }
  // Compat: map legacy goal strings.
  if (/natural.?frequency|convert/i.test(primaryGoal)) return CONTRACTS.convert_to_natural_frequency;
  if (/screening/i.test(primaryGoal)) return CONTRACTS.apply_screening_boundary;
  if (/lifestyle/i.test(primaryGoal)) return CONTRACTS.answer_general_lifestyle_question_with_boundary;
  if (/preparation/i.test(primaryGoal)) return CONTRACTS.provide_preparation_information;
  if (/barrier|calling/i.test(primaryGoal)) return CONTRACTS.address_practical_barrier;
  if (/defer/i.test(primaryGoal)) return CONTRACTS.respect_decision_deferral;
  if (/safety|maintain_safety/i.test(primaryGoal)) return CONTRACTS.maintain_safety;
  if (/calculator.?input/i.test(primaryGoal)) return CONTRACTS.explain_calculator_inputs;
  if (/calculator.?metadata|result.?source|personal/i.test(primaryGoal)) {
    return CONTRACTS.explain_calculator_result_source;
  }
  if (/correct|misunderstanding|prediction/i.test(primaryGoal)) {
    return CONTRACTS.correct_certainty_misunderstanding;
  }
  return CONTRACTS.answer_question;
}

export interface SelectPrimaryGoalInput {
  semanticTurn: SemanticTurn;
  route?: DialogueRoute;
  riskResult?: RiskResult;
  latestMessage?: string;
}

/**
 * Selects a specific primary goal — never bare answer_question for known cases.
 */
export function selectPrimaryGoal(
  semanticTurn: SemanticTurn,
  route?: DialogueRoute,
  riskResult?: RiskResult,
): ResponseGoal;
export function selectPrimaryGoal(input: SelectPrimaryGoalInput): ResponseGoal;
export function selectPrimaryGoal(
  turnOrInput: SemanticTurn | SelectPrimaryGoalInput,
  route?: DialogueRoute,
  _riskResult?: RiskResult,
): ResponseGoal {
  const turn =
    'semanticTurn' in (turnOrInput as SelectPrimaryGoalInput)
      ? (turnOrInput as SelectPrimaryGoalInput).semanticTurn
      : (turnOrInput as SemanticTurn);
  const activeRoute =
    'semanticTurn' in (turnOrInput as SelectPrimaryGoalInput)
      ? (turnOrInput as SelectPrimaryGoalInput).route
      : route;
  void _riskResult;

  const features = detectSemanticFeatures(turn.explicitRequest);
  const msgFeatures = turn.userQuestions[0]
    ? detectSemanticFeatures(turn.userQuestions[0])
    : features;

  if (turn.requiresSafetyBoundary || activeRoute?.safetyBoundaryRequired) {
    if (turn.topic === 'screening_guidance' || activeRoute?.topic === 'screening_guidance') {
      return 'apply_screening_boundary';
    }
    return 'maintain_safety';
  }

  if (
    turn.primaryOperation === 'defer' ||
    turn.primaryOperation === 'reject' ||
    activeRoute?.primaryOperation === 'defer' ||
    activeRoute?.primaryOperation === 'reject'
  ) {
    return 'respect_decision_deferral';
  }

  if (turn.primaryOperation === 'convert' || activeRoute?.primaryOperation === 'convert') {
    return 'convert_to_natural_frequency';
  }

  if (turn.primaryOperation === 'correct_misunderstanding') {
    if (turn.misunderstanding === 'average_means_zero_risk') return 'correct_zero_risk_misunderstanding';
    if (
      turn.misunderstanding === 'risk_means_diagnosis' ||
      turn.misunderstanding === 'elevated_means_diagnosis'
    ) {
      return 'correct_diagnosis_misunderstanding';
    }
    return 'correct_certainty_misunderstanding';
  }

  if (turn.primaryOperation === 'simplify' || msgFeatures.asksSimpleLanguage) {
    return 'simplify_risk_explanation';
  }

  if (
    /concern|calibrat/i.test(turn.explicitRequest) ||
    msgFeatures.asksConcernCalibration ||
    features.asksConcernCalibration
  ) {
    return 'answer_concern_calibration';
  }

  if (
    turn.topic === 'risk_level' &&
    turn.primaryOperation === 'explain' &&
    (/elevated/i.test(turn.explicitRequest) || msgFeatures.asksElevatedMeaning)
  ) {
    return 'explain_elevated_risk_label';
  }

  if (turn.topic === 'risk_level' && /average/i.test(turn.explicitRequest)) {
    return 'explain_average_risk_label';
  }

  if (turn.primaryOperation === 'compare' || turn.topic === 'time_horizon') {
    return 'compare_time_horizons';
  }

  if (
    turn.primaryOperation === 'address_barrier' ||
    activeRoute?.primaryOperation === 'address_barrier'
  ) {
    return 'address_practical_barrier';
  }
  if (turn.primaryOperation === 'verify_understanding') return 'confirm_understanding';
  if (turn.topic === 'calculator_inputs') return 'explain_calculator_inputs';
  if (
    turn.topic === 'calculator_validation' ||
    turn.topic === 'calculator_result_source' ||
    turn.requiresCalculatorMetadata
  ) {
    return 'explain_calculator_result_source';
  }
  if (turn.topic === 'calculator_limitations' || turn.primaryOperation === 'identify_limitation') {
    return 'explain_calculator_limitations';
  }
  // Prefer lifestyle/motivation goals from the turn topic/operation or from the
  // user's own wording (propositions), so a confused clarification flag cannot
  // steal a clear fitness / maintain-activity request.
  const userWording = [
    turn.explicitRequest,
    ...turn.propositions.map((p) => p.text),
    ...turn.userQuestions,
  ]
    .join(' ')
    .toLowerCase();
  const lifestyleFromWording =
    detectSemanticFeatures(userWording).asksLifestyleFocus ||
    /\b(physical activity|exercise|fitness|life[- ]?style|motivational guide)\b/.test(userWording);
  if (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'explain_lifestyle_relationship' ||
    (lifestyleFromWording &&
      !/\b(medication|chemotherapy|radiation|treatment plan|prescribe)\b/.test(userWording))
  ) {
    return 'answer_general_lifestyle_question_with_boundary';
  }
  if (
    turn.primaryOperation === 'list_information' &&
    (turn.topic === 'professional_interpretation' ||
      turn.userConstraints.some((c) => /questions for clinician/i.test(c)) ||
      /questions the user could ask/i.test(turn.explicitRequest))
  ) {
    return 'list_questions_for_clinician';
  }
  if (turn.primaryOperation === 'provide_preparation_information') {
    return 'provide_preparation_information';
  }
  if (turn.primaryOperation === 'provide_options' || turn.primaryOperation === 'plan') {
    if (turn.barrier !== 'not_expressed' && turn.barrier !== 'none') return 'address_practical_barrier';
    return 'provide_next_step_options';
  }
  if (turn.topic === 'emotion') return 'acknowledge_emotion';
  if (turn.topic === 'greeting') return 'open_conversation';
  if (turn.topic === 'closing' || turn.primaryOperation === 'close') return 'close_supportively';
  if (turn.primaryOperation === 'draft' || turn.primaryOperation === 'revise' || turn.primaryOperation === 'confirm') {
    return 'provide_practical_help';
  }
  if (turn.topic === 'risk_meaning' || turn.primaryOperation === 'explain' || turn.primaryOperation === 'elaborate') {
    return 'explain_five_year_risk_meaning';
  }
  if (turn.requiresClarification) return 'clarify_short_reply';

  return 'answer_question';
}
