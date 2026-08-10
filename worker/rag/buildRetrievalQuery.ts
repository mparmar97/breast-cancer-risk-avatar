import type { AdaptiveState } from '../behavioral/state';
import type { DialogueStrategy } from '../behavioral/policy';
import type { RequestInterpretation } from '../dialogue/currentTurnInterpretation';
import type { RiskResult } from '../types';
import { buildRetrievalQuery as buildLegacyRetrievalQuery } from './buildQuery';
import { normalizeText } from './tokenize';

export interface OperationAwareRetrievalQueryInput {
  message: string;
  state: AdaptiveState;
  strategy: DialogueStrategy;
  riskResult: RiskResult;
  requestInterpretation?: RequestInterpretation;
  resolvedMeaning?: string;
  questionPurpose?: string;
  skipMedicalRag?: boolean;
}

const TOPIC_QUERY: Partial<Record<RequestInterpretation['topic'], string>> = {
  natural_frequency:
    'natural frequency people out of 100 breast cancer risk probability explanation five-year',
  time_horizon:
    'official explanation five-year risk versus lifetime breast cancer risk time horizon comparison',
  calculator_inputs:
    'official calculator input factors used to estimate five-year breast cancer risk',
  calculator_limitations:
    'limitations of breast cancer risk calculator population probability individual prediction uncertainty',
  calculator_applicability: 'breast cancer risk calculator purpose applicability population estimate',
  risk_meaning: 'breast cancer risk estimate probability not diagnosis explanation',
  risk_value: 'breast cancer risk percentage meaning probability',
  decision_support:
    'professional interpretation follow up communication options patient portal access contact',
  evidence_source: 'breast cancer risk calculator evidence source professional interpretation',
  communication_option: 'professional interpretation communication options patient portal',
  action_planning:
    'professional interpretation follow up communication options patient portal access contact',
  barrier:
    'professional interpretation follow up communication options patient portal access contact who to contact',
};

/**
 * Builds an operation-aware medical retrieval query. Prefer specific topic
 * vocabulary over a broad "risk meaning" bag-of-words query.
 */
export function buildOperationAwareRetrievalQuery(input: OperationAwareRetrievalQueryInput): string {
  if (input.skipMedicalRag) {
    return '';
  }

  const interpretation = input.requestInterpretation;
  if (!interpretation || interpretation.topic === 'unclear' || interpretation.confidence < 0.7) {
    return buildLegacyRetrievalQuery({
      message: input.message,
      state: input.state,
      strategy: input.strategy,
      riskResult: input.riskResult,
      resolvedMeaning: input.resolvedMeaning,
      questionPurpose: input.questionPurpose,
    });
  }

  const topicTerms = TOPIC_QUERY[interpretation.topic] ?? '';
  const operationTerms = interpretation.operation.replace(/_/g, ' ');
  const formatTerms = interpretation.requestedOutputFormat?.replace(/_/g, ' ') ?? '';
  const horizonBoost =
    /\bfive[- ]?year|lifetime\b/i.test(input.message) ||
    /\bfive[- ]?year|lifetime\b/i.test(interpretation.explicitRequest)
      ? TOPIC_QUERY.time_horizon
      : '';
  const accessBoost =
    /\b(who to contact|where to (start|begin)|access|portal|clinic)\b/i.test(input.message) ||
    interpretation.topic === 'decision_support' ||
    (interpretation as { topic?: string }).topic === 'action_planning'
      ? 'professional interpretation follow up communication options patient portal clinic contact'
      : '';
  const parts = [
    interpretation.explicitRequest,
    interpretation.explicitRequest,
    input.message,
    topicTerms,
    topicTerms,
    horizonBoost,
    accessBoost,
    operationTerms,
    formatTerms,
    input.riskResult.model,
    input.riskResult.riskHorizon,
    input.riskResult.riskBranch,
  ].filter(Boolean);

  return normalizeText(parts.join(' '));
}

/** Back-compat export name used by the product spec. */
export function buildRetrievalQuery(input: OperationAwareRetrievalQueryInput): string {
  return buildOperationAwareRetrievalQuery(input);
}
