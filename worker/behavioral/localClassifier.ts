import {
  createDefaultAdaptiveState,
  normalizeAdaptiveState,
  type AdaptiveState,
  type Barrier,
  type Emotion,
  type Readiness,
  type SafetyFlag,
  type SelfEfficacy,
  type Understanding,
} from './state';

/**
 * Deterministic, keyword/regex-based classification of a single chat
 * message into a conservative AdaptiveState. No external LLM is used.
 *
 * This is a heuristic prototype, not a validated psychological instrument.
 * It estimates temporary conversational needs only, and safety-related
 * flags are always evaluated independently of — and take priority over —
 * any behavior-change signal.
 */

// ---------------------------------------------------------------------------
// Message normalization
// ---------------------------------------------------------------------------

function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
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
  /\b(which (medicine|medication|drug)|what treatment|should i (take|start (medication|treatment))|which drug)\b/;

function detectSafetyFlag(message: string): SafetyFlag {
  if (EMOTIONAL_CRISIS_PATTERN.test(message)) return 'emotional_crisis';
  if (URGENT_SYMPTOM_PATTERN.test(message)) return 'urgent_symptom';
  if (DIAGNOSIS_REQUEST_PATTERN.test(message)) return 'diagnosis_request';
  if (TREATMENT_REQUEST_PATTERN.test(message)) return 'treatment_request';
  return 'none';
}

// ---------------------------------------------------------------------------
// Behavioral signal patterns
// ---------------------------------------------------------------------------

const READY_ACTION_PATTERN =
  /\b(i will (call|message|schedule|contact|talk to|follow up|reach out)|i'll (call|message|schedule|contact|talk to|follow up|reach out)|i am going to (call|message|schedule|contact|talk to|follow up|reach out)|i'm going to (call|message|schedule|contact|talk to|follow up|reach out))\b/;

const PREPARING_INTENT_PATTERN =
  /\b(i want to (follow up|call|contact|schedule)|i plan to|i am trying to|i'm trying to)\b/;

const CORRECT_UNDERSTANDING_PATTERN =
  /\bi (understand|know|realize|get it)\b[^.?!]*\b(probability|percentage|estimate|risk|chance)\b/;

const PARTIAL_UNDERSTANDING_PATTERN =
  /\b(so i (might|could|may) have (cancer|it)|this means my risk is (higher|elevated)|not sure what (this|it) means)\b/;

const OVERWHELMED_PATTERN =
  /\b(overwhelmed|can't (handle|cope|deal with)|too much to (handle|process|take in)|falling apart)\b/;

const WORRIED_PATTERN = /\b(scared|afraid|frightened|worried|anxious|nervous|terrified)\b/;

const DISMISSIVE_PATTERN =
  /\b(does not matter|doesn't matter|do not think this matters|don't think this matters|not a big deal|whatever|do not care|don't care)\b/;

const MISTRUST_PATTERN =
  /\b(do not trust|don't trust|dont trust|not sure i trust|skeptical of|do not believe|don't believe)\b/;

const ACCESS_PATTERN =
  /\b(who to contact|where to go|how to schedule|no doctor|do not have a doctor|don't have a doctor|cannot get an appointment|can't get an appointment|do not know where to start|don't know where to start|do not know who|don't know who)\b/;

const COST_PATTERN = /\b(afford|cost|expensive|insurance|payment|out of pocket|money)\b/;

const TIME_PATTERN =
  /\b(no time|busy|work schedule|cannot call|can't call|too busy|while i am working|while i'm working|during work|working)\b/;

const UNCERTAINTY_PATTERN =
  /\b(not sure (what|how)|unsure (what|how)|do not know what to (think|believe)|don't know what to think)\b/;

// ---------------------------------------------------------------------------
// Field-level detectors
// ---------------------------------------------------------------------------

function detectUnderstanding(message: string, safetyFlag: SafetyFlag): Understanding | null {
  if (safetyFlag === 'diagnosis_request') return 'incorrect';
  if (CORRECT_UNDERSTANDING_PATTERN.test(message)) return 'correct';
  if (PARTIAL_UNDERSTANDING_PATTERN.test(message)) return 'partial';
  return null;
}

function detectEmotion(message: string, isReadyAction: boolean): Emotion | null {
  if (OVERWHELMED_PATTERN.test(message)) return 'overwhelmed';
  if (DISMISSIVE_PATTERN.test(message)) return 'dismissive';
  if (WORRIED_PATTERN.test(message)) return 'worried';
  if (isReadyAction) return 'calm';
  return null;
}

function detectBarrier(message: string, emotion: Emotion | null): Barrier | null {
  if (MISTRUST_PATTERN.test(message)) return 'mistrust';
  if (ACCESS_PATTERN.test(message)) return 'access';
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
): ReadinessSignal {
  if (isReadyAction) {
    return { readiness: 'ready', selfEfficacy: 'high' };
  }

  const isPreparing = PREPARING_INTENT_PATTERN.test(message);
  if (isPreparing && barrier) {
    return { readiness: 'preparing', selfEfficacy: 'moderate' };
  }

  if (barrier === 'mistrust') {
    return { readiness: 'not_considering', selfEfficacy: null };
  }

  if (barrier === 'access') {
    return { readiness: 'considering', selfEfficacy: 'low' };
  }

  if (barrier) {
    return { readiness: 'considering', selfEfficacy: null };
  }

  return { readiness: null, selfEfficacy: null };
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

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
  const normalized = normalizeMessage(message);
  const fallback = previousState ? normalizeAdaptiveState(previousState) : createDefaultAdaptiveState();

  const safetyFlag = detectSafetyFlag(normalized);
  const isReadyAction = READY_ACTION_PATTERN.test(normalized);

  const emotionSignal = detectEmotion(normalized, isReadyAction);
  const barrierSignal = detectBarrier(normalized, emotionSignal);
  const understandingSignal = detectUnderstanding(normalized, safetyFlag);
  const { readiness: readinessFromRules, selfEfficacy: selfEfficacyFromRules } =
    detectReadinessAndSelfEfficacy(normalized, barrierSignal, isReadyAction);

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

  return normalizeAdaptiveState({
    understanding: understandingSignal ?? fallback.understanding,
    emotion: emotionSignal ?? fallback.emotion,
    barrier: barrierSignal ?? fallback.barrier,
    selfEfficacy: selfEfficacyFromRules ?? fallback.selfEfficacy,
    readiness: readinessSignal ?? fallback.readiness,
    safetyFlag,
    confidence,
  });
}
