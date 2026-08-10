import {
  BARRIER_VALUES,
  EMOTION_VALUES,
  INTENT_VALUES,
  READINESS_VALUES,
  SAFETY_FLAG_VALUES,
  SELF_EFFICACY_VALUES,
  UNDERSTANDING_VALUES,
} from '../behavioral/state';
import { SHORT_REPLY_TYPE_VALUES } from '../dialogue/types';
import { EVIDENCE_STRING_MAX_LENGTH, MAX_SECONDARY_INTENTS, type GroqClassificationOutput } from './classificationSchema';

export type ValidateAdaptiveStateResult =
  | { valid: true; data: GroqClassificationOutput }
  | { valid: false; reason: string };

const TOP_LEVEL_KEYS = [
  'primaryIntent',
  'secondaryIntents',
  'understanding',
  'emotion',
  'barrier',
  'selfEfficacy',
  'readiness',
  'safetyFlag',
  'currentTurnEvidence',
  'refersToPreviousAssistantTurn',
  'shortReplyType',
  'confidence',
] as const;

const EVIDENCE_KEYS = [
  'intent',
  'understanding',
  'emotion',
  'barrier',
  'selfEfficacy',
  'readiness',
  'safetyFlag',
] as const;

function isEnumValue(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

/**
 * Locally re-validates a parsed Groq current-turn-interpretation response,
 * even though strict JSON schema output was requested — providers can
 * still return malformed, truncated, or unexpectedly-shaped JSON. Never
 * throws; always returns a discriminated result so the caller
 * (worker/llm/classifyAdaptiveState.ts) can fall back without exposing a
 * raw error to the user. Purely structural — see
 * {@link checkEvidenceConsistency} below for the separate cross-field
 * semantic check.
 */
export function validateAdaptiveStateClassification(input: unknown): ValidateAdaptiveStateResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, reason: 'response is not a JSON object' };
  }

  const record = input as Record<string, unknown>;

  const unknownTopLevelKeys = Object.keys(record).filter(
    (key) => !(TOP_LEVEL_KEYS as readonly string[]).includes(key),
  );
  if (unknownTopLevelKeys.length > 0) {
    return { valid: false, reason: `unknown top-level properties: ${unknownTopLevelKeys.join(', ')}` };
  }

  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in record)) {
      return { valid: false, reason: `missing required field: ${key}` };
    }
  }

  if (!isEnumValue(record.primaryIntent, INTENT_VALUES)) {
    return { valid: false, reason: 'invalid primaryIntent enum value' };
  }

  if (!Array.isArray(record.secondaryIntents)) {
    return { valid: false, reason: 'secondaryIntents must be an array' };
  }
  if (record.secondaryIntents.length > MAX_SECONDARY_INTENTS) {
    return { valid: false, reason: `secondaryIntents exceeds ${MAX_SECONDARY_INTENTS} entries` };
  }
  if (!record.secondaryIntents.every((entry) => isEnumValue(entry, INTENT_VALUES))) {
    return { valid: false, reason: 'secondaryIntents contains an invalid intent enum value' };
  }

  if (!isEnumValue(record.understanding, UNDERSTANDING_VALUES)) {
    return { valid: false, reason: 'invalid understanding enum value' };
  }
  if (!isEnumValue(record.emotion, EMOTION_VALUES)) {
    return { valid: false, reason: 'invalid emotion enum value' };
  }
  if (!isEnumValue(record.barrier, BARRIER_VALUES)) {
    return { valid: false, reason: 'invalid barrier enum value' };
  }
  if (!isEnumValue(record.selfEfficacy, SELF_EFFICACY_VALUES)) {
    return { valid: false, reason: 'invalid selfEfficacy enum value' };
  }
  if (!isEnumValue(record.readiness, READINESS_VALUES)) {
    return { valid: false, reason: 'invalid readiness enum value' };
  }
  if (!isEnumValue(record.safetyFlag, SAFETY_FLAG_VALUES)) {
    return { valid: false, reason: 'invalid safetyFlag enum value' };
  }
  if (typeof record.refersToPreviousAssistantTurn !== 'boolean') {
    return { valid: false, reason: 'refersToPreviousAssistantTurn must be a boolean' };
  }
  if (!isEnumValue(record.shortReplyType, SHORT_REPLY_TYPE_VALUES)) {
    return { valid: false, reason: 'invalid shortReplyType enum value' };
  }

  const confidence = record.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { valid: false, reason: 'confidence must be a finite number between 0 and 1' };
  }

  const evidence = record.currentTurnEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { valid: false, reason: 'currentTurnEvidence is not an object' };
  }
  const evidenceRecord = evidence as Record<string, unknown>;

  const unknownEvidenceKeys = Object.keys(evidenceRecord).filter(
    (key) => !(EVIDENCE_KEYS as readonly string[]).includes(key),
  );
  if (unknownEvidenceKeys.length > 0) {
    return { valid: false, reason: `unknown currentTurnEvidence properties: ${unknownEvidenceKeys.join(', ')}` };
  }

  for (const key of EVIDENCE_KEYS) {
    const value = evidenceRecord[key];
    if (typeof value !== 'string') {
      return { valid: false, reason: `currentTurnEvidence.${key} must be a string` };
    }
    if (value.length > EVIDENCE_STRING_MAX_LENGTH) {
      return { valid: false, reason: `currentTurnEvidence.${key} exceeds ${EVIDENCE_STRING_MAX_LENGTH} characters` };
    }
  }

  const data = {
    primaryIntent: record.primaryIntent,
    secondaryIntents: record.secondaryIntents,
    understanding: record.understanding,
    emotion: record.emotion,
    barrier: record.barrier,
    selfEfficacy: record.selfEfficacy,
    readiness: record.readiness,
    safetyFlag: record.safetyFlag,
    refersToPreviousAssistantTurn: record.refersToPreviousAssistantTurn,
    shortReplyType: record.shortReplyType,
    confidence,
    currentTurnEvidence: {
      intent: evidenceRecord.intent,
      understanding: evidenceRecord.understanding,
      emotion: evidenceRecord.emotion,
      barrier: evidenceRecord.barrier,
      selfEfficacy: evidenceRecord.selfEfficacy,
      readiness: evidenceRecord.readiness,
      safetyFlag: evidenceRecord.safetyFlag,
    },
  } as GroqClassificationOutput;

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// Cross-field evidence-consistency validation (Section 6).
// ---------------------------------------------------------------------------

const NOT_EXPRESSED_VALUES = new Set(['', 'not expressed', 'none', 'n/a', 'not mentioned', 'not stated']);

function wasExpressed(evidenceText: string): boolean {
  return !NOT_EXPRESSED_VALUES.has(evidenceText.trim().toLowerCase());
}

const NEUTRAL_EMOTIONS = new Set(['calm', 'uncertain']);

export interface EvidenceConsistencyResult {
  consistent: boolean;
  conflictingFields: string[];
}

/**
 * Verifies that a structurally-valid classification's labels don't
 * contradict their own supporting evidence — e.g. `emotion: "worried"`
 * while `currentTurnEvidence.emotion === "not expressed"`. This catches a
 * class of Groq errors that a JSON *shape* check alone cannot: internally
 * plausible-looking JSON that nonetheless invents a signal the latest
 * message didn't actually contain. See worker/llm/classifyAdaptiveState.ts
 * for the one-shot repair flow this feeds into.
 */
export function checkEvidenceConsistency(data: GroqClassificationOutput): EvidenceConsistencyResult {
  const conflictingFields: string[] = [];

  if (!wasExpressed(data.currentTurnEvidence.emotion) && !NEUTRAL_EMOTIONS.has(data.emotion)) {
    conflictingFields.push('emotion');
  }
  if (!wasExpressed(data.currentTurnEvidence.barrier) && data.barrier !== 'none') {
    conflictingFields.push('barrier');
  }
  if (!wasExpressed(data.currentTurnEvidence.selfEfficacy) && data.selfEfficacy !== 'unknown') {
    conflictingFields.push('selfEfficacy');
  }
  if (!wasExpressed(data.currentTurnEvidence.safetyFlag) && data.safetyFlag !== 'none') {
    conflictingFields.push('safetyFlag');
  }
  if (!wasExpressed(data.currentTurnEvidence.understanding) && data.understanding !== 'uncertain') {
    conflictingFields.push('understanding');
  }
  if (!wasExpressed(data.currentTurnEvidence.readiness) && data.readiness !== 'unclear') {
    conflictingFields.push('readiness');
  }

  // Greetings must not invent worry, barriers, or misunderstanding without evidence.
  if (data.primaryIntent === 'greeting' || data.primaryIntent === 'social_acknowledgment') {
    if (!wasExpressed(data.currentTurnEvidence.emotion) && !NEUTRAL_EMOTIONS.has(data.emotion)) {
      if (!conflictingFields.includes('emotion')) conflictingFields.push('emotion');
    }
    if (data.barrier !== 'none' && !wasExpressed(data.currentTurnEvidence.barrier)) {
      if (!conflictingFields.includes('barrier')) conflictingFields.push('barrier');
    }
    if (data.understanding === 'incorrect' && !wasExpressed(data.currentTurnEvidence.understanding)) {
      if (!conflictingFields.includes('understanding')) conflictingFields.push('understanding');
    }
  }

  return { consistent: conflictingFields.length === 0, conflictingFields };
}
