// Final safety net applied to every outgoing reply (generated or fixed).
// Rejects wording that would cross into diagnosis, treatment, or an
// unsafe guarantee, regardless of which strategy produced it.
const PROHIBITED_PATTERNS: RegExp[] = [
  // Excludes "...whether you have breast cancer" (used by the diagnosis-request
  // safety disclaimer itself, which explicitly declines to make this claim).
  /(?<!whether )\byou have breast cancer\b/i,
  /\byou do not have breast cancer\b/i,
  /\byou will develop breast cancer\b/i,
  /\byou will not develop breast cancer\b/i,
  /\byou definitely have cancer\b/i,
  /\byou are cancer-free\b/i,
  /\bi prescribe\b/i,
  /\byou should take this medication\b/i,
  /\byou must take\b/i,
  /\bthis guarantees\b/i,
  /\bdefinitely safe\b/i,
  // Phase 5 additions — dynamic (Groq-generated) replies can drift further
  // than the fixed template strings above, so a few more prohibited
  // categories are checked explicitly here.
  /\bi am a (doctor|clinician|physician|nurse|oncologist)\b/i,
  /\bas your (doctor|clinician|physician)\b/i,
  /\byou should (start|stop|switch) (taking|using)\b/i,
  /\byou need to get (a |your )?(mammogram|screening|biopsy) (now|immediately|today|this week)\b/i,
  /\byou should get screened (now|immediately)\b/i,
  /\bguaranteed\b/i,
  /\bwill definitely\b/i,
  /\b100% (certain|sure)\b/i,
  /\bwithout any doubt\b/i,
];

export const SAFE_FALLBACK_RESPONSE =
  'I cannot safely provide a personalized answer to that question. I can explain the general meaning of the risk result, but a qualified healthcare professional should interpret it for you.';

export function isResponseSafe(response: string): boolean {
  return !PROHIBITED_PATTERNS.some((pattern) => pattern.test(response));
}

/**
 * Validates a candidate reply and returns it unchanged if safe, or the
 * fixed safe fallback if it contains a prohibited diagnostic/treatment
 * claim. This is the last check applied before any reply leaves the
 * worker — see worker/index.ts.
 */
export function validateResponse(response: string): string {
  return isResponseSafe(response) ? response : SAFE_FALLBACK_RESPONSE;
}

// ---------------------------------------------------------------------------
// Phase 5: additional structural validation for Groq-generated replies.
// ---------------------------------------------------------------------------

export const REPLY_WORD_LIMIT = 90;
export const REPLY_MAX_QUESTIONS = 1;

/** Optional per-route overrides (e.g. clinician question lists need more ? and words). */
export interface ValidateGeneratedReplyOptions {
  maxWords?: number;
  maxQuestions?: number;
}

// Internal strategy/theory identifiers that must never leak into a reply
// shown to the user — see worker/behavioral/policy.ts and
// worker/behavioral/theoryMap.ts.
const INTERNAL_LABEL_PATTERNS: RegExp[] = [
  /\b(clarify_risk|acknowledge_emotion|explain_benefit|explore_barrier|support_self_efficacy|action_planning|explore_readiness|safety_boundary|urgent_referral)\b/i,
  /\b(adaptiveState|selfEfficacy|safetyFlag|currentTurnEvidence|classificationMode|responseMode)\b/,
  /\bFuzzy-Trace Theory\b/i,
  /\bHealth Belief Model\b/i,
  /\bMotivational Interviewing\b/i,
  /\breadiness-to-change framework\b/i,
  /\b(similarity score|retrieval query|theory construct|communication technique)\b/i,
];

// A few sentinel phrases lifted from our own system prompts — if any of
// these appear verbatim in a reply, the system prompt has leaked.
const SYSTEM_PROMPT_LEAK_PATTERNS: RegExp[] = [
  /supportive educational breast-cancer risk communication guide/i,
  /you estimate temporary conversational needs/i,
  /return only the json object required by the supplied schema/i,
];

const URL_PATTERN = /https?:\/\//i;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export type ReplyValidationFailureReason =
  | 'empty'
  | 'not_plain_text'
  | 'too_long'
  | 'too_many_questions'
  | 'unsafe_medical_claim'
  | 'internal_label_exposure'
  | 'system_prompt_exposure'
  | 'unapproved_url';

export type ReplyValidationResult =
  | { valid: true }
  | { valid: false; reason: ReplyValidationFailureReason };

/**
 * Structural + safety validation for a Groq-generated reply, applied
 * before grounded-evidence validation (see validateGroundedEvidence
 * below) and before the shared `validateResponse` prohibited-claim check
 * above. A failing result means the caller must discard the candidate and
 * fall back — never "repair" or truncate a generated reply, since partial
 * text could change its medical meaning.
 */
export function validateGeneratedReply(
  reply: unknown,
  options: ValidateGeneratedReplyOptions = {},
): ReplyValidationResult {
  if (typeof reply !== 'string') {
    return { valid: false, reason: 'not_plain_text' };
  }

  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'empty' };
  }

  // Reject anything that looks like markdown/code/HTML rather than plain
  // conversational text.
  if (/```|<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return { valid: false, reason: 'not_plain_text' };
  }

  const maxWords = options.maxWords ?? REPLY_WORD_LIMIT;
  const maxQuestions = options.maxQuestions ?? REPLY_MAX_QUESTIONS;

  if (countWords(trimmed) > maxWords) {
    return { valid: false, reason: 'too_long' };
  }

  if (countQuestions(trimmed) > maxQuestions) {
    return { valid: false, reason: 'too_many_questions' };
  }

  if (!isResponseSafe(trimmed)) {
    return { valid: false, reason: 'unsafe_medical_claim' };
  }

  if (INTERNAL_LABEL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { valid: false, reason: 'internal_label_exposure' };
  }

  if (SYSTEM_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { valid: false, reason: 'system_prompt_exposure' };
  }

  if (URL_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'unapproved_url' };
  }

  return { valid: true };
}
