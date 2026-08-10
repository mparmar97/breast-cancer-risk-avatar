import { isClosingUtterance } from '../dialogue/closingSignals';
import { assertsUnderstandingUtterance } from '../dialogue/understandingSignals';
import { asksWhoToContact, normalizeUserText } from '../dialogue/normalizeUserText';
import {
  ACCESS_SYNONYM_PATTERN,
  CONFIDENCE_SYNONYM_PATTERN,
  COST_SYNONYM_PATTERN,
  DELAY_SYNONYM_PATTERN,
  DISMISSIVE_SYNONYM_PATTERN,
  MISTRUST_SYNONYM_PATTERN,
  OVERWHELM_SYNONYM_PATTERN,
  PREPARING_SYNONYM_PATTERN,
  READY_ACTION_SYNONYM_PATTERN,
  TIME_SYNONYM_PATTERN,
  UNCERTAINTY_SYNONYM_PATTERN,
  WORRY_SYNONYM_PATTERN,
  inferAdaptiveSignals,
  inferEmotionFromFeelingPhrase,
} from './adaptiveSignalLexicon';
import {
  createDefaultAdaptiveState,
  normalizeAdaptiveState,
  type AdaptiveState,
  type Barrier,
  type Emotion,
  type Intent,
  type Readiness,
  type SafetyFlag,
  type SelfEfficacy,
  type Understanding,
} from './state';

/**
 * Deterministic, category-based classification of a single chat message into
 * a conservative AdaptiveState. Matches synonym and indirect cues — not only
 * exact example phrases. No external LLM is used.
 *
 * This is a heuristic prototype, not a validated psychological instrument.
 * It estimates temporary conversational needs only, and safety-related
 * flags are always evaluated independently of — and take priority over —
 * any behavior-change signal.
 *
 * This module is also the Phase 5 fallback classifier: whenever Groq is
 * unavailable, times out, or returns an invalid/unschema-conforming
 * response (see worker/llm/classifyAdaptiveState.ts), `classifyLocalState`
 * (or `classifyLocalStateDetailed`, which additionally derives an
 * `Intent`) is used instead, so the chat pipeline always returns a safe
 * reply even without an API key.
 */

// ---------------------------------------------------------------------------
// Message normalization
// ---------------------------------------------------------------------------

// A small set of common shorthand/typo expansions, applied before pattern
// matching. This is intentionally minimal — Groq (the primary classifier
// in Phase 5) handles natural, imperfect language directly; this local
// fallback only needs to tolerate a few very common cases so it still
// degrades gracefully when Groq is unavailable.
const SHORTHAND_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bidk\b/g, 'i do not know'],
  [/\bwhta\b/g, 'what'],
  [/\b(\d+)\s*yr\b/g, '$1 year'],
  [/\bmanagable\b/g, 'manageable'],
  [/\bputing\b/g, 'putting'],
];

function normalizeMessage(message: string): string {
  // Typo fixes only — skip domain Levenshtein so common words like "think"
  // are not rewritten (e.g. think → thanks).
  let normalized = normalizeUserText(message, { dictionaryCorrect: false });

  for (const [pattern, replacement] of SHORTHAND_EXPANSIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Safety patterns (highest priority; evaluated first and independently)
// ---------------------------------------------------------------------------

const EMOTIONAL_CRISIS_PATTERN =
  /\b(suicidal|kill myself|end my life|end it all|want to die|do not want to live|don't want to live|harm myself|self-?harm|can't go on|no reason to live)\b/;

const URGENT_SYMPTOM_PATTERN =
  /\b(new lump|found a lump|bleeding|severe (breast )?pain|symptoms? (are|is) getting worse|getting worse|discharge from (my |the )?(breast|nipple))\b/;

const DIAGNOSIS_REQUEST_PATTERN =
  /\b(do i have (breast )?cancer|does (this|it|elevated( risk)?) mean (i have (breast )?cancer|cancer)|am i diagnosed|is this a diagnosis)\b/;

const TREATMENT_REQUEST_PATTERN =
  /\b(which (medicine|medication|drug)|what treatment|should i (take|start (medication|treatment))|which drug|chemotherapy|radiation|treat(ment|ing) (for )?(breast )?cancer|prescribe .{0,20}(medicine|medication|drug))\b/;

function detectSafetyFlag(message: string): SafetyFlag {
  if (EMOTIONAL_CRISIS_PATTERN.test(message)) return 'emotional_crisis';
  if (URGENT_SYMPTOM_PATTERN.test(message)) return 'urgent_symptom';
  if (DIAGNOSIS_REQUEST_PATTERN.test(message)) return 'diagnosis_request';
  if (TREATMENT_REQUEST_PATTERN.test(message)) return 'treatment_request';
  return 'none';
}

// ---------------------------------------------------------------------------
// Behavioral signal patterns (synonyms + indirect cues via lexicon)
// ---------------------------------------------------------------------------

const READY_ACTION_PATTERN = READY_ACTION_SYNONYM_PATTERN;
const PREPARING_INTENT_PATTERN = PREPARING_SYNONYM_PATTERN;

const GREETING_PATTERN =
  /^(hi|hello|hey|hiya|howdy|good (morning|afternoon|evening))( there| guide)?[.!?]*$/;

const GRATITUDE_PATTERN =
  /^(ok(ay)?[,.]?\s*)?(thanks|thank you|thx|appreciate (it|that))[.!]*$/;

const CORRECTION_PATTERN =
  /\b(no,? that('?s| is) not what i (meant|mean)|that('?s| is) not what i (meant|mean)|i (meant|mean) something else|you misunderstood)\b/;

const DRAFT_HELP_PATTERN =
  /\b((help|helping|can you|could you).{0,40}(write|draft|wording|message)|what to write|not sure what to write|do not know what to write|don'?t know what to write|dont know what to write|help (me )?write|write a (portal )?message)\b/;

const DRAFT_REVIEW_PATTERN =
  /\b(does (this|the) (message|draft|wording|text) (sound|look|read|seem) (clear|ok|okay|good|fine)|is (this|the) (message|draft|wording) (clear|ok|okay|good)|review (this|my) (draft|message|wording))\b/;

const DRAFT_ACCEPT_PATTERN =
  /\b(that (draft|message|wording) sounds? clear|that looks good|the (message|draft|wording) is fine|i like that wording|i can use this|that works for me|i('ll| will) use that (message|draft)|looks good|yes,? that is clear|no changes (are )?needed|the wording is clear)\b/;

const NEXT_STEP_PATTERN =
  /\b(what should i do next|what (do|can) i do next|what'?s next|whats next|next step|what now|how (do|should) i (follow up|proceed)|ok tell me next|unsure what to do|do not know what to do|don'?t know what to do|dont know what to do)\b/;

const CORRECT_UNDERSTANDING_PATTERN =
  /\bi (understand|know|realize|get it)\b[^.?!]*\b(probability|percentage|estimate|risk|chance|result|number)\b|\b(the number makes sense|i get the result|understand the (result|percentage|number)|that (clicks|makes sense now)|gotcha on the (percentage|number|estimate))\b/;

const PARTIAL_UNDERSTANDING_PATTERN =
  /\b(so i (might|could|may) have (cancer|it)|this means my risk is (higher|elevated)|not sure what (this|it) means|kind of means|so (i'?m|i am) (at )?higher risk)\b/;

// Direct informational questions about what a risk estimate/number means —
// distinct from a misunderstanding statement, but routed to the same
// clarify_risk strategy (see worker/behavioral/policy.ts).
const EXPLAIN_RISK_HORIZON_PATTERN =
  /\b(five.?year|5.?year|lifetime) risk\b.*\bmean\b|\bmean\b.*\b(five.?year|5.?year|lifetime) risk\b|\bwhat (does|is) (a |the )?(five.?year|5.?year|lifetime) risk\b/;

const EXPLAIN_RISK_PATTERN =
  /\bwhat (is|does) (a |the )?(risk estimate|risk|percentage|probability|estimate)\b|\bexplain\b.{0,40}\b(risk estimate|demonstration risk|demo risk|percentage|probability|risk|estimate)\b|\bwhat does (this|the|a) (percentage|probability|estimate|risk) mean\b|\bexplain (the )?percentage\b/;

const OVERWHELMED_PATTERN = OVERWHELM_SYNONYM_PATTERN;
const WORRIED_PATTERN = WORRY_SYNONYM_PATTERN;
const DISMISSIVE_PATTERN = DISMISSIVE_SYNONYM_PATTERN;
const MISTRUST_PATTERN = MISTRUST_SYNONYM_PATTERN;
const DELAY_PATTERN = DELAY_SYNONYM_PATTERN;
const ACCESS_PATTERN = ACCESS_SYNONYM_PATTERN;
const COST_PATTERN = COST_SYNONYM_PATTERN;
const TIME_PATTERN = TIME_SYNONYM_PATTERN;
const UNCERTAINTY_PATTERN = UNCERTAINTY_SYNONYM_PATTERN;
const CONFIDENCE_PATTERN = CONFIDENCE_SYNONYM_PATTERN;
// ---------------------------------------------------------------------------
// Field-level detectors
// ---------------------------------------------------------------------------

function detectUnderstanding(message: string, safetyFlag: SafetyFlag): Understanding | null {
  if (safetyFlag === 'diagnosis_request') return 'incorrect';
  const inferred = inferAdaptiveSignals(message).understanding;
  if (inferred) return inferred;
  if (CORRECT_UNDERSTANDING_PATTERN.test(message)) return 'correct';
  if (PARTIAL_UNDERSTANDING_PATTERN.test(message)) return 'partial';
  return null;
}

function detectEmotion(message: string, isReadyAction: boolean): Emotion | null {
  const inferred = inferEmotionFromFeelingPhrase(message);
  if (inferred === 'overwhelmed') return 'overwhelmed';
  if (inferred === 'dismissive') return 'dismissive';
  if (inferred === 'worried') return 'worried';
  if (OVERWHELMED_PATTERN.test(message)) return 'overwhelmed';
  if (DISMISSIVE_PATTERN.test(message)) return 'dismissive';
  if (WORRIED_PATTERN.test(message)) return 'worried';
  if (isReadyAction) return 'calm';
  return null;
}

function detectBarrier(message: string, emotion: Emotion | null, isConfident: boolean): Barrier | null {
  // Expressed confidence explicitly resolves/clears whatever barrier may
  // have been carried forward from an earlier turn.
  if (isConfident) return 'none';
  const inferred = inferAdaptiveSignals(message).barrier;
  if (inferred) return inferred;
  if (DELAY_PATTERN.test(message)) return 'delay';
  if (MISTRUST_PATTERN.test(message)) return 'mistrust';
  if (ACCESS_PATTERN.test(message) || asksWhoToContact(message)) return 'access';
  if (COST_PATTERN.test(message)) return 'cost';
  if (TIME_PATTERN.test(message)) return 'time';
  if (UNCERTAINTY_PATTERN.test(message)) return 'uncertainty';
  if (emotion === 'worried') return 'fear';
  return null;
}

interface ReadinessSignal {
  readiness: Readiness | null;
  selfEfficacy: SelfEfficacy | null;
}

function detectReadinessAndSelfEfficacy(
  message: string,
  barrier: Barrier | null,
  isReadyAction: boolean,
  isConfident: boolean,
): ReadinessSignal {
  const inferred = inferAdaptiveSignals(message);

  if (isReadyAction) {
    return { readiness: 'ready', selfEfficacy: inferred.selfEfficacy ?? 'high' };
  }

  if (DRAFT_ACCEPT_PATTERN.test(message)) {
    return { readiness: 'preparing', selfEfficacy: inferred.selfEfficacy ?? 'moderate' };
  }

  // Access / "don't know who" hardship should keep low efficacy even if readiness is soft.
  if (barrier === 'access') {
    return {
      readiness: inferred.readiness === 'ready' ? 'ready' : 'considering',
      selfEfficacy: inferred.selfEfficacy === 'high' || inferred.selfEfficacy === 'moderate'
        ? inferred.selfEfficacy
        : (inferred.selfEfficacy ?? 'low'),
    };
  }

  if (isConfident || inferred.selfEfficacy === 'moderate' || inferred.selfEfficacy === 'high') {
    return {
      readiness: inferred.readiness ?? 'preparing',
      selfEfficacy: inferred.selfEfficacy ?? 'moderate',
    };
  }

  if (inferred.readiness === 'ready') {
    return { readiness: 'ready', selfEfficacy: inferred.selfEfficacy ?? 'high' };
  }
  if (inferred.readiness === 'preparing') {
    return { readiness: 'preparing', selfEfficacy: inferred.selfEfficacy ?? 'moderate' };
  }
  if (inferred.readiness === 'not_considering') {
    return { readiness: 'not_considering', selfEfficacy: inferred.selfEfficacy };
  }

  const isPreparing = PREPARING_INTENT_PATTERN.test(message);
  if (isPreparing) {
    // Time/cost "cannot call/afford" is a barrier; keep preparing at moderate efficacy.
    const situationalBarrier =
      barrier === 'time' ||
      barrier === 'cost' ||
      /\b(can'?t|cannot)\s+(call|make calls|afford)\b/.test(message.toLowerCase());
    const efficacy =
      situationalBarrier && inferred.selfEfficacy === 'low'
        ? 'moderate'
        : (inferred.selfEfficacy ?? 'moderate');
    return { readiness: 'preparing', selfEfficacy: efficacy };
  }

  if (barrier === 'mistrust') {
    return { readiness: 'not_considering', selfEfficacy: inferred.selfEfficacy };
  }

  if (barrier === 'delay') {
    return { readiness: 'considering', selfEfficacy: inferred.selfEfficacy };
  }

  if (barrier) {
    return { readiness: inferred.readiness ?? 'considering', selfEfficacy: inferred.selfEfficacy };
  }

  if (inferred.selfEfficacy === 'low') {
    return { readiness: inferred.readiness ?? 'considering', selfEfficacy: 'low' };
  }

  if (inferred.readiness) {
    return { readiness: inferred.readiness, selfEfficacy: inferred.selfEfficacy };
  }

  return { readiness: null, selfEfficacy: inferred.selfEfficacy };
}

function detectIntent(
  message: string,
  safetyFlag: SafetyFlag,
  understanding: Understanding | null,
  emotion: Emotion | null,
  barrier: Barrier | null,
  isConfident: boolean,
  isReadyAction: boolean,
): Intent {
  if (safetyFlag === 'diagnosis_request') return 'diagnosis_question';
  if (safetyFlag === 'treatment_request') return 'treatment_question';
  if (safetyFlag === 'urgent_symptom') return 'symptom_report';
  if (GREETING_PATTERN.test(message)) return 'greeting';
  if (isClosingUtterance(message)) return 'conversation_closing';
  if (CORRECTION_PATTERN.test(message)) return 'correction';
  if (DRAFT_ACCEPT_PATTERN.test(message)) return 'confirm_proposed_action';
  if (DRAFT_REVIEW_PATTERN.test(message)) return 'request_draft_review';
  if (DRAFT_HELP_PATTERN.test(message)) return 'request_draft_help';
  if (NEXT_STEP_PATTERN.test(message)) return 'request_next_step';
  if (GRATITUDE_PATTERN.test(message)) return 'gratitude';
  // Understanding acknowledgments after an explanation — advance, don't re-menu.
  if (assertsUnderstandingUtterance(message)) return 'confirm_understanding';
  if (isReadyAction) return 'confirm_action';
  if (isConfident) return 'express_confidence';
  if (EXPLAIN_RISK_HORIZON_PATTERN.test(message)) return 'explain_risk_horizon';
  if (EXPLAIN_RISK_PATTERN.test(message)) return 'explain_risk';
  if (understanding === 'partial' || understanding === 'incorrect') return 'explain_risk';
  if (barrier === 'delay') return 'express_ambivalence';
  // Pure fear/worry language often also produces barrier=fear from emotion —
  // keep that as express_emotion so policy acknowledges emotion rather than
  // opening a barrier exploration for a message like "I am scared."
  if (emotion === 'worried' || emotion === 'overwhelmed') {
    if (!barrier || barrier === 'fear') return 'express_emotion';
  }
  if (barrier) return 'describe_barrier';
  if (/\?\s*$/.test(message.trim())) return 'general_question';
  return 'unclear';
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

export interface LocalCurrentTurnEvidence {
  intent: string;
  understanding: string;
  emotion: string;
  barrier: string;
  selfEfficacy: string;
  readiness: string;
  safetyFlag: string;
}

export interface LocalClassificationDetail {
  state: AdaptiveState;
  intent: Intent;
  currentTurnEvidence: LocalCurrentTurnEvidence;
}

const NOT_EXPRESSED = 'not expressed';

/**
 * Classifies a single user message into a conservative AdaptiveState.
 *
 * `previousState` (if supplied by the caller) is used only as a per-field
 * fallback when the current message provides no new signal for that field
 * — e.g. a short follow-up like "ok" doesn't reset an already-established
 * barrier. Safety flag and confidence are always recomputed fresh from the
 * current message and are never inherited, so a stale safety condition can
 * never leak into a later, unrelated turn.
 */
export function classifyLocalState(message: string, previousState?: AdaptiveState): AdaptiveState {
  return classifyLocalStateDetailed(message, previousState).state;
}

/**
 * Like {@link classifyLocalState}, but additionally derives a per-turn
 * {@link Intent} and short natural-language `currentTurnEvidence`
 * rationale strings for each field — the same shape Groq's structured
 * classifier returns (see worker/llm/classifyAdaptiveState.ts), so the
 * rest of the pipeline (state transition, developer diagnostics) can treat
 * "local-fallback" and "groq-structured" classification uniformly.
 */
export function classifyLocalStateDetailed(
  message: string,
  previousState?: AdaptiveState,
): LocalClassificationDetail {
  const normalized = normalizeMessage(message);
  const fallback = previousState ? normalizeAdaptiveState(previousState) : createDefaultAdaptiveState();

  const safetyFlag = detectSafetyFlag(normalized);
  const isReadyAction = READY_ACTION_PATTERN.test(normalized);
  const isConfident = CONFIDENCE_PATTERN.test(normalized);

  const emotionSignal = detectEmotion(normalized, isReadyAction);
  const barrierSignal = detectBarrier(normalized, emotionSignal, isConfident);
  const understandingSignal = detectUnderstanding(normalized, safetyFlag);
  const readinessSignals = detectReadinessAndSelfEfficacy(normalized, barrierSignal, isReadyAction, isConfident);
  const readinessFromRules = readinessSignals.readiness;
  const selfEfficacyFromRules = readinessSignals.selfEfficacy;

  let readinessSignal = readinessFromRules;
  if (!readinessSignal && emotionSignal === 'dismissive') {
    readinessSignal = 'not_considering';
  }

  const hasBehaviorSignal =
    understandingSignal !== null ||
    emotionSignal !== null ||
    barrierSignal !== null ||
    readinessFromRules !== null ||
    selfEfficacyFromRules !== null ||
    readinessSignal !== null;

  let confidence = createDefaultAdaptiveState().confidence;
  if (safetyFlag === 'diagnosis_request') {
    confidence = 0.9;
  } else if (safetyFlag === 'treatment_request') {
    confidence = 0.92;
  } else if (safetyFlag === 'urgent_symptom' || safetyFlag === 'emotional_crisis') {
    confidence = 0.9;
  } else if (hasBehaviorSignal) {
    confidence = 0.75;
  }

  const state = normalizeAdaptiveState({
    understanding: understandingSignal ?? fallback.understanding,
    emotion: emotionSignal ?? fallback.emotion,
    barrier: barrierSignal ?? fallback.barrier,
    selfEfficacy: selfEfficacyFromRules ?? fallback.selfEfficacy,
    readiness: readinessSignal ?? fallback.readiness,
    safetyFlag,
    confidence,
  });

  const intent = detectIntent(
    normalized,
    safetyFlag,
    understandingSignal,
    emotionSignal,
    barrierSignal,
    isConfident,
    isReadyAction,
  );

  const currentTurnEvidence: LocalCurrentTurnEvidence = {
    intent:
      intent === 'greeting'
        ? 'greeting'
        : intent === 'request_draft_help'
          ? 'asked for help writing a message'
          : intent === 'request_draft_review'
            ? 'asked whether draft wording is clear'
            : intent === 'request_next_step'
              ? 'asked what to do next'
              : intent === 'correction'
                ? 'corrected the previous interpretation'
                : intent === 'conversation_closing'
                  ? 'indicated the conversation is finished'
                  : intent === 'gratitude'
                    ? 'expressed thanks'
                    : isConfident
                      ? 'expressed confidence that the next step will be manageable'
                      : isReadyAction
                        ? 'stated a concrete intention to act'
                        : NOT_EXPRESSED,
    understanding: understandingSignal ? `local pattern match: ${understandingSignal}` : NOT_EXPRESSED,
    emotion: emotionSignal ? `local pattern match: ${emotionSignal}` : NOT_EXPRESSED,
    barrier: barrierSignal ? `local pattern match: ${barrierSignal}` : NOT_EXPRESSED,
    selfEfficacy: selfEfficacyFromRules ? `local pattern match: ${selfEfficacyFromRules}` : NOT_EXPRESSED,
    readiness: readinessSignal ? `local pattern match: ${readinessSignal}` : NOT_EXPRESSED,
    safetyFlag: safetyFlag !== 'none' ? `local pattern match: ${safetyFlag}` : NOT_EXPRESSED,
  };

  return { state, intent, currentTurnEvidence };
}
