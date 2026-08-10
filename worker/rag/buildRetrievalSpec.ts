/**
 * Focused RetrievalSpec per turn — do not concatenate unrelated topics.
 */

import type { ActiveInformationNeed } from '../dialogue/activeInformationNeed';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import type { DialogueRoute } from '../routing/types';
import type { RiskResult } from '../types';
import { normalizeText } from './tokenize';

export interface RetrievalSpec {
  query: string;
  required: boolean;
  excludeTerms: string[];
  includeTopics: string[];
  deterministicCalculationRequired: boolean;
  implementationMetadataRequired: boolean;
  medicalRagRequired: boolean;
}

export interface BuildRetrievalSpecInput {
  semanticTurn: SemanticTurn;
  route?: DialogueRoute;
  riskResult?: RiskResult;
  activeNeed?: ActiveInformationNeed;
}

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

/**
 * Builds a focused retrieval specification for the latest semantic request.
 */
export function buildRetrievalSpec(input: BuildRetrievalSpecInput): RetrievalSpec {
  const { semanticTurn: turn, route, riskResult, activeNeed } = input;
  const request = `${turn.explicitRequest} ${turn.userQuestions.join(' ')}`.trim();
  const model = riskResult?.model ?? 'breast cancer risk calculator';
  const horizon = riskResult?.riskHorizon ?? 'five-year';

  const base: RetrievalSpec = {
    query: '',
    required: false,
    excludeTerms: [],
    includeTopics: [],
    deterministicCalculationRequired: false,
    implementationMetadataRequired: false,
    medicalRagRequired: false,
  };

  if (turn.primaryOperation === 'convert' || route?.deterministicCalculationRequired) {
    return {
      ...base,
      query: '',
      required: false,
      deterministicCalculationRequired: true,
      medicalRagRequired: false,
      includeTopics: ['natural_frequency'],
      excludeTerms: ['screening', 'portal', 'mammogram'],
    };
  }

  if (
    turn.requiresCalculatorMetadata ||
    turn.topic === 'calculator_validation' ||
    turn.topic === 'calculator_result_source' ||
    turn.topic === 'calculator_applicability' ||
    route?.calculatorMetadataRequired
  ) {
    return {
      ...base,
      query: `${model} demonstration result source prototype inputs personal information`,
      required: false,
      implementationMetadataRequired: true,
      medicalRagRequired: false,
      includeTopics: ['calculator_result_source'],
      excludeTerms: ['mammogram', 'screening schedule', 'natural frequency'],
    };
  }

  if (turn.topic === 'calculator_inputs') {
    return {
      ...base,
      query: normalizeText(
        `official calculator input factors used to estimate ${horizon} breast cancer risk ${model}`,
      ),
      required: turn.secondaryOperations.includes('identify_limitation'),
      medicalRagRequired: turn.secondaryOperations.includes('identify_limitation'),
      implementationMetadataRequired: true,
      includeTopics: ['calculator_inputs'],
      excludeTerms: ['mammogram', 'portal message'],
    };
  }

  if (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    route?.topic === 'lifestyle_risk_information'
  ) {
    return {
      ...base,
      query: normalizeText(
        'lifestyle physical activity exercise fitness diet healthy habits breast cancer risk prevention initial care first steps follow up healthcare professional population level personalized advice boundary',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['lifestyle_risk', 'physical_activity', 'health_first_steps', 'professional_interpretation'],
      excludeTerms: ['portal', 'appointment', 'mammogram schedule', 'natural frequency', 'chemotherapy', 'radiation'],
    };
  }

  if (turn.primaryOperation === 'provide_preparation_information') {
    return {
      ...base,
      query: normalizeText(
        'prepare questions before talking with healthcare professional about breast cancer risk estimate demonstration',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['professional_interpretation', 'preparation'],
      excludeTerms: ['portal', 'appointment required', 'mammogram schedule'],
    };
  }

  if (turn.topic === 'screening_guidance' || route?.topic === 'screening_guidance') {
    return {
      ...base,
      query: normalizeText(
        'breast cancer screening decisions individualized professional interpretation demonstration estimate cannot set schedule',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['screening_guidance'],
      excludeTerms: ['natural frequency', 'portal draft'],
    };
  }

  if (turn.primaryOperation === 'address_barrier' || turn.topic === 'communication_support') {
    if (turn.barrier === 'access' || turn.barrier === 'cost') {
      return {
        ...base,
        query: normalizeText(
          'professional interpretation follow up communication options patient portal access contact who to contact',
        ),
        required: true,
        medicalRagRequired: true,
        includeTopics: ['professional_interpretation', 'symptom_follow_up'],
        excludeTerms: ['natural frequency', 'lifetime risk meaning'],
      };
    }
    return {
      ...base,
      query: '',
      required: false,
      medicalRagRequired: false,
      includeTopics: ['communication_support'],
      excludeTerms: ['mammogram schedule'],
    };
  }

  if (turn.topic === 'time_horizon' || turn.primaryOperation === 'compare') {
    return {
      ...base,
      query: normalizeText(
        'official explanation five-year risk versus lifetime breast cancer risk time horizon comparison',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['time_horizon', 'five_year', 'lifetime'],
      excludeTerms: ['portal', 'mammogram schedule'],
    };
  }

  // Elevated meaning: focused elevated-vs-comparison query; exclude unrelated topics.
  if (
    turn.topic === 'risk_level' &&
    (containsAny(request, ['elevated']) || /elevated/i.test(turn.explicitRequest))
  ) {
    return {
      ...base,
      query: normalizeText(
        'elevated breast cancer risk label meaning compared with average comparison level not diagnosis',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['elevated_risk', 'risk_level'],
      excludeTerms: ['lifetime', 'portal', 'screening', 'natural frequency', 'mammogram'],
    };
  }

  if (
    turn.misunderstanding === 'average_means_zero_risk' ||
    /average.*zero|average.*safe/i.test(turn.explicitRequest)
  ) {
    return {
      ...base,
      query: normalizeText(
        'average breast cancer risk label does not mean zero risk probability still present',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['average_risk', 'risk_level'],
      excludeTerms: ['portal', 'screening schedule'],
    };
  }

  if (
    turn.primaryOperation === 'correct_misunderstanding' ||
    turn.misunderstanding === 'risk_means_diagnosis' ||
    turn.misunderstanding === 'risk_means_certainty'
  ) {
    return {
      ...base,
      query: normalizeText(
        'breast cancer risk estimate probability not diagnosis not individual prediction',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['probability_not_diagnosis'],
      excludeTerms: ['portal', 'screening schedule'],
    };
  }

  if (/concern|calibrat/i.test(turn.explicitRequest)) {
    return {
      ...base,
      query: normalizeText(
        'breast cancer risk level concern calibration probability not diagnosis professional interpretation',
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: ['risk_level', 'concern_calibration'],
      excludeTerms: ['natural frequency', 'portal draft'],
    };
  }

  if (turn.primaryOperation === 'simplify' || turn.primaryOperation === 'explain') {
    const fiveYearFocus =
      /\bfive[- ]?year|5[- ]?year\b/i.test(turn.explicitRequest) ||
      /\bfive[- ]?year|5[- ]?year\b/i.test(request) ||
      /five/i.test(String(horizon));
    return {
      ...base,
      query: normalizeText(
        fiveYearFocus
          ? 'official explanation of five-year breast cancer risk estimate absolute risk time horizon probability versus diagnosis five year versus lifetime'
          : `breast cancer ${horizon} risk estimate probability meaning not diagnosis ${turn.primaryOperation === 'simplify' ? 'plain language' : ''}`,
      ),
      required: true,
      medicalRagRequired: true,
      includeTopics: fiveYearFocus
        ? ['risk_meaning', 'five_year_vs_lifetime_risk']
        : ['risk_meaning'],
      excludeTerms: ['portal', 'mammogram schedule'],
    };
  }

  if (activeNeed && !activeNeed.resolved && activeNeed.sourceRequired === 'medical_rag') {
    return {
      ...base,
      query: normalizeText(activeNeed.unresolvedQuestion || turn.explicitRequest),
      required: true,
      medicalRagRequired: true,
      includeTopics: [turn.topic],
      excludeTerms: [],
    };
  }

  if (turn.requiresMedicalEvidence || route?.medicalEvidenceRequired) {
    return {
      ...base,
      query: normalizeText(turn.explicitRequest || `${model} ${horizon} breast cancer risk`),
      required: true,
      medicalRagRequired: true,
      includeTopics: [turn.topic],
      excludeTerms: [],
    };
  }

  return base;
}
