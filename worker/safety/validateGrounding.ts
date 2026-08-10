import type { DialogueStrategy } from '../behavioral/policy';
import type { RetrievedEvidence } from '../rag/types';

/**
 * Strategies whose objective is to explain a factual/medical concept
 * (see worker/behavioral/theoryMap.ts) and therefore must cite at least
 * one retrieved evidence ID. Other strategies (emotional reflection,
 * barrier exploration, self-efficacy support, action planning, readiness
 * exploration) may legitimately use zero evidence — see
 * docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md.
 */
const EVIDENCE_REQUIRED_STRATEGIES: ReadonlySet<DialogueStrategy> = new Set(['clarify_risk', 'explain_benefit']);

// A reply that states a specific-sounding medical statistic must be
// grounded in cited evidence regardless of strategy — this catches an
// ungrounded numeric claim slipping into e.g. an explore_barrier reply.
const NUMERIC_MEDICAL_CLAIM_PATTERN = /\d+(\.\d+)?\s*(%|percent|in\s+100|times (more|less) likely)/i;

export type GroundedEvidenceValidationResult =
  | { valid: true; usedEvidenceIds: string[] }
  | { valid: false; reason: string };

export interface ValidateGroundedEvidenceInput {
  usedEvidenceIds: string[];
  retrievedEvidence: RetrievedEvidence[];
  strategy: DialogueStrategy;
  reply: string;
}

/**
 * Validates that a generator's claimed `usedEvidenceIds`:
 *   - only reference evidence actually supplied to it this turn
 *     (`retrievedEvidence` — never a fabricated or previously-seen ID);
 *   - are deduplicated;
 * and that any strategy/content requiring a factual medical claim cites at
 * least one of them. Emotional or barrier-exploration replies that make no
 * factual claim are allowed to use zero evidence.
 */
export function validateGroundedEvidence(input: ValidateGroundedEvidenceInput): GroundedEvidenceValidationResult {
  // When medical RAG was intentionally skipped (deterministic calc, memory, metadata),
  // accept the reply without requiring evidence citations.
  if (input.retrievedEvidence.length === 0) {
    return { valid: true, usedEvidenceIds: [] };
  }

  const validIds = new Set(input.retrievedEvidence.map((evidence) => evidence.id));
  const deduped = Array.from(new Set(input.usedEvidenceIds));

  for (const id of deduped) {
    if (!validIds.has(id)) {
      return { valid: false, reason: `usedEvidenceIds contains an ID not present in retrievedEvidence: ${id}` };
    }
  }

  const requiresEvidence =
    EVIDENCE_REQUIRED_STRATEGIES.has(input.strategy) || NUMERIC_MEDICAL_CLAIM_PATTERN.test(input.reply);

  if (requiresEvidence && deduped.length === 0) {
    return { valid: false, reason: 'reply makes a factual medical claim without a supporting evidence id' };
  }

  return { valid: true, usedEvidenceIds: deduped };
}
