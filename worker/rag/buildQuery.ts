import type { DialogueStrategy } from '../behavioral/policy';
import { getTheoryConstruct } from '../behavioral/theoryMap';
import type { AdaptiveState, Barrier } from '../behavioral/state';
import type { RiskResult } from '../types';
import { normalizeText } from './tokenize';

export interface RetrievalQueryInput {
  message: string;
  state: AdaptiveState;
  strategy: DialogueStrategy;
  riskResult: RiskResult;
  /** Deterministically resolved short-reply meaning (Section 7), when the latest message was a short reply. Adds back the specific vocabulary a bare "yes"/"tonight" otherwise lacks. */
  resolvedMeaning?: string;
  /** The dialogue-turn plan's question purpose (Section 10) — e.g. "teach_back" nudges retrieval toward explanatory evidence. */
  questionPurpose?: string;
}

// Strategy-specific retrieval concepts. These add domain vocabulary that
// the user's raw message may not contain, so evidence retrieval stays
// relevant even for short or ambiguous messages.
const STRATEGY_CONCEPTS: Record<DialogueStrategy, string> = {
  clarify_risk: 'risk probability diagnosis explanation elevated average natural frequency',
  acknowledge_emotion: 'risk concern fear probability not diagnosis supportive explanation',
  explain_benefit: 'professional interpretation benefit follow up personalized history',
  explore_barrier: 'follow up barrier manageable action appointment',
  support_self_efficacy: 'manageable next step confidence contact clinician follow up',
  action_planning: 'concrete next action contact healthcare professional patient portal draft message',
  confirm_progress: 'understanding clearer next concern question about result draft review',
  greet_user: 'welcome educational guide conversation topic',
  close_supportively: 'closing thanks conversation complete',
  ask_clarification: 'clarification what the user meant',
  explore_readiness: 'readiness',
  safety_boundary: 'risk estimate not diagnosis medical scope limitation',
  urgent_referral: 'application cannot evaluate symptoms prompt professional care',
};

// Additional, barrier-specific concepts layered on top of explore_barrier's
// general concept string above.
const BARRIER_CONCEPTS: Partial<Record<Barrier, string>> = {
  time: 'time barrier manageable action patient portal appointment',
  cost: 'cost barrier appointment coverage options',
  access: 'who to contact access healthcare professional patient portal',
  fear: 'fear barrier concern next step',
  mistrust: 'trust calculator concern explanation',
  uncertainty: 'uncertainty next step information',
  other: 'obstacle follow up',
};

/**
 * Builds a single, normalized retrieval query string from the user's
 * message plus the classified adaptive state, selected strategy, and risk
 * result. This keeps retrieval relevant even for short messages, without
 * inventing or asserting any diagnostic claim of its own — it only ever
 * reuses the (already-conservative) classification labels and the theory
 * objective text, never fabricated medical content.
 */
export function buildRetrievalQuery(input: RetrievalQueryInput): string {
  const { message, state, strategy, riskResult, resolvedMeaning, questionPurpose } = input;

  // The raw message carries the most specific, query-relevant vocabulary
  // (e.g. "certain", "five-year"), so it is weighted more heavily than the
  // generic strategy/theory vocabulary added below — otherwise a short,
  // specific message can be diluted into irrelevance by longer boilerplate.
  // A resolved short-reply meaning ("the user wants an out-of-100
  // explanation") is added at the same weight — a bare "yes"/"tonight"
  // otherwise carries almost no retrieval-relevant vocabulary of its own.
  const parts: string[] = [
    message,
    message,
    message,
    ...(resolvedMeaning ? [resolvedMeaning, resolvedMeaning] : []),
    riskResult.riskBranch,
    riskResult.riskHorizon,
    strategy,
    state.understanding,
  ];

  if (questionPurpose && questionPurpose !== 'none') {
    parts.push(questionPurpose.replace(/_/g, ' '));
  }

  if (state.barrier !== 'none') {
    parts.push(state.barrier);
    if (strategy === 'explore_barrier') {
      const barrierConcepts = BARRIER_CONCEPTS[state.barrier];
      if (barrierConcepts) {
        parts.push(barrierConcepts);
      }
    }
  }

  if (state.safetyFlag !== 'none') {
    parts.push(state.safetyFlag.replace(/_/g, ' '));
  }

  parts.push(STRATEGY_CONCEPTS[strategy]);

  // Skipped for explore_readiness: its objective text largely duplicates
  // the strategy concept above and would otherwise dilute short, specific
  // messages (e.g. "Is this result certain?") with repeated generic terms.
  if (strategy !== 'explore_readiness') {
    const theoryObjective = getTheoryConstruct(strategy).objective;
    if (theoryObjective) {
      parts.push(theoryObjective);
    }
  }

  return normalizeText(parts.join(' '));
}
