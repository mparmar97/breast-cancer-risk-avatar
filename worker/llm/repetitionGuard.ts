import { asksWhoToContact, asksRiskExplanation } from '../dialogue/normalizeUserText';
import { expressesWorryOrOverwhelm } from '../behavioral/adaptiveSignalLexicon';
import {
  GENERIC_HELPFUL_FALLBACK,
  GRATITUDE_FALLBACK,
  WHO_TO_CONTACT_FALLBACK,
  riskExplanationFallback,
  understandingNextStepFallback,
} from './fallbackCopy';
import { isClosingUtterance, isGratitudeUtterance } from '../dialogue/closingSignals';
import { assertsUnderstandingUtterance } from '../dialogue/understandingSignals';
import { generateLocalResponse } from './localGenerator';
import { generateDynamicResponse, type DynamicResponseInput, type DynamicResponseResult } from './generateDynamicResponse';
import type { FetchLike } from './groqClient';
import type { Env } from '../types';

function lastResortNonRepeatingReply(
  input: Pick<DynamicResponseInput, 'latestMessage' | 'riskResult' | 'retrievedEvidence'>,
): string {
  const latest = input.latestMessage ?? '';
  // True treatment/medication asks stay on the safety path. Fitness / initial
  // healthy-step language is handled by lifestyle RAG + motivational fallbacks.
  if (/\b(medication|chemotherapy|radiation|treatment plan|prescribe|treat(ment|ing) (for )?(breast )?cancer)\b/i.test(latest)) {
    return 'I cannot recommend an individual treatment or medication. Those decisions require a qualified healthcare professional who understands your medical history. I can help explain this demonstration risk estimate or share general lifestyle and prevention information from vetted sources.';
  }
  if (
    /\b(work[- ]?schedule|calling during|return to .{0,30}(work|schedule|time|barrier))\b/i.test(latest)
  ) {
    return 'Coming back to the schedule concern: calling during work can be hard. A written option when available, or saving the question for a time that fits better, may be more manageable than trying to phone during busy hours.';
  }
  if (/\b(i like|i love|i enjoy|doing gym|the gym|walking|yoga|swimming)\b/i.test(latest)) {
    return 'Regular physical activity is associated with lower breast cancer risk at a population level. Keeping an activity you already like—such as gym time—is a practical maintenance step. This is general encouragement, not a personalized training plan. What would help you keep that activity consistent this week?';
  }
  if (/\b(motivate|motivation|motivational|encourage me|cheer me)\b/i.test(latest)) {
    return /\b(every ?day|daily|each day)\b/i.test(latest)
      ? 'I can offer educational motivational support in this conversation, though I cannot send daily check-ins outside the session. Regular physical activity is linked with lower breast cancer risk at a population level. What is one healthy habit or activity you want to focus on right now?'
      : 'I can offer educational motivational support in this session—not daily coaching or a personalized training plan. Regular physical activity is linked with lower breast cancer risk at a population level. What is one healthy habit or activity you want to focus on right now?';
  }
  if (
    /\b(physical activity|exercise|fitness|life[- ]?style|motivational guide|maintain .{0,40}activity)\b/i.test(
      latest,
    )
  ) {
    return 'I can support you as an educational motivational guide for keeping activity in your routine—not as a personal trainer or treatment planner. Regular movement is linked with lower breast cancer risk at a population level. What is one small activity you could keep this week?';
  }
  if (asksWhoToContact(latest)) return WHO_TO_CONTACT_FALLBACK;
  if (asksRiskExplanation(latest)) return riskExplanationFallback(input.riskResult);
  if (assertsUnderstandingUtterance(latest)) return understandingNextStepFallback(input.riskResult);
  if (isGratitudeUtterance(latest) || isClosingUtterance(latest)) {
    return GRATITUDE_FALLBACK;
  }
  if (expressesWorryOrOverwhelm(latest)) {
    return 'It sounds like seeing this result has been worrying. A risk estimate is not a diagnosis. What part of the result feels most concerning?';
  }
  return GENERIC_HELPFUL_FALLBACK;
}

const SIMILARITY_THRESHOLD = 0.78;
const LEADING_TOKEN_COUNT = 8;
// Compare against up to the previous five assistant responses (Section 16).
const COMPARISON_WINDOW = 5;

const CONTRACTION_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bi'm\b/g, 'i am'],
  [/\bit's\b/g, 'it is'],
  [/\byou're\b/g, 'you are'],
  [/\bthat's\b/g, 'that is'],
  [/\bwe're\b/g, 'we are'],
];

/** Lowercases, expands common contractions, strips punctuation, collapses whitespace. */
export function normalizeForComparison(text: string): string {
  let normalized = text.toLowerCase();
  for (const [pattern, replacement] of CONTRACTION_EXPANSIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
}

function tokenize(normalizedText: string): string[] {
  return normalizedText.length === 0 ? [] : normalizedText.split(' ');
}

/** Simple term-frequency cosine similarity over two already-normalized token lists. */
export function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const countsA = new Map<string, number>();
  for (const token of tokensA) countsA.set(token, (countsA.get(token) ?? 0) + 1);
  const countsB = new Map<string, number>();
  for (const token of tokensB) countsB.set(token, (countsB.get(token) ?? 0) + 1);

  const vocabulary = new Set([...countsA.keys(), ...countsB.keys()]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const term of vocabulary) {
    const a = countsA.get(term) ?? 0;
    const b = countsB.get(term) ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Strips a single trailing sentence (typically the follow-up question),
 * for the "same statement repeated with only the question differing"
 * check. Punctuation is already removed by {@link normalizeForComparison},
 * so sentences are split on the word " and the final one is dropped.
 */
function stripTrailingQuestion(normalizedText: string): string {
  const words = normalizedText.split(' ').filter(Boolean);
  // Heuristic: treat the final ~40% of words (at least 3) as the
  // "question" portion when the text is long enough to plausibly contain
  // both a statement and a follow-up question.
  if (words.length < 6) return normalizedText;
  const statementWordCount = Math.ceil(words.length * 0.6);
  return words.slice(0, statementWordCount).join(' ');
}

// Named "dialogue move" fingerprints (Section 16.5) — recurring
// conversational moves that read as repetitive to a user even when the
// exact wording around them varies. Detection here is only ever used to
// *flag* repetition and choose a different fallback; it never generates
// response text itself.
const DIALOGUE_MOVE_PATTERNS: Record<string, RegExp> = {
  time_is_the_obstacle: /\btime (is|appears to be|seems to be) the (main |primary )?obstacle\b/i,
  not_knowing_where_to_begin: /\b(not knowing|don'?t know|do not know) where to (begin|start)\b/i,
  result_is_worrying: /\b(seeing this result|the result) (is|has been|feels) worrying\b/i,
  common_obstacle: /\b(common|frequent) obstacle\b/i,
  manageable_first_step: /\bmanageable first step\b/i,
  putting_it_off: /\bkeeps? getting put off\b|\bkeep(s)? putting it off\b/i,
  risk_probability_explanation:
    /\brisk estimate describes probability\b|\bdoes not mean that you currently have (breast )?cancer\b/i,
  emotional_acknowledgment: /\bit sounds like (seeing this result|this) (has been|is) worrying\b/i,
  broad_readiness_question: /\bhow do you currently feel about discussing this result\b/i,
  choose_action_question: /\bwhat action feels realistic\b|\bwould writing a brief portal message or\b/i,
  barrier_statement: /\bit sounds like .{0,40} (is|may be) (the main obstacle|making follow-up)\b/i,
};

const OPENING_CLICHE_PATTERN =
  /^(it sounds like|it seems|it is understandable|i understand|i hear that)\b/i;

function detectDialogueMove(text: string): string | null {
  for (const [move, pattern] of Object.entries(DIALOGUE_MOVE_PATTERNS)) {
    if (pattern.test(text)) return move;
  }
  return null;
}

export interface RepetitionAnalysis {
  repetitionDetected: boolean;
  similarityScore: number;
  repeatedDialogueMove: string | null;
}

/**
 * Compares a proposed reply against up to the previous
 * {@link COMPARISON_WINDOW} assistant replies and returns the highest
 * similarity found plus whether any Phase-5/general-dialogue repetition
 * condition is met:
 *   - normalized text is identical;
 *   - token cosine similarity is {@link SIMILARITY_THRESHOLD} or greater;
 *   - the first 8 meaningful tokens are identical;
 *   - the same leading statement is repeated with only the question
 *     (final sentence) differing;
 *   - the same named dialogue-move fingerprint recurs.
 */
export function analyzeRepetition(candidateReply: string, recentReplies: string[]): RepetitionAnalysis {
  const normalizedCandidate = normalizeForComparison(candidateReply);
  const candidateTokens = tokenize(normalizedCandidate);
  const candidateLeadingTokens = candidateTokens.slice(0, LEADING_TOKEN_COUNT).join(' ');
  const candidateWithoutQuestion = stripTrailingQuestion(normalizedCandidate);
  const candidateMove = detectDialogueMove(candidateReply);

  let repetitionDetected = false;
  let highestSimilarity = 0;
  let repeatedDialogueMove: string | null = null;

  for (const recent of recentReplies.slice(-COMPARISON_WINDOW)) {
    const normalizedRecent = normalizeForComparison(recent);
    if (normalizedRecent.length === 0) continue;

    if (normalizedRecent === normalizedCandidate) {
      repetitionDetected = true;
      highestSimilarity = Math.max(highestSimilarity, 1);
    }

    const recentTokens = tokenize(normalizedRecent);
    const similarity = cosineSimilarity(candidateTokens, recentTokens);
    highestSimilarity = Math.max(highestSimilarity, similarity);
    if (similarity >= SIMILARITY_THRESHOLD) {
      repetitionDetected = true;
    }

    const recentLeadingTokens = recentTokens.slice(0, LEADING_TOKEN_COUNT).join(' ');
    if (candidateLeadingTokens.length > 0 && candidateLeadingTokens === recentLeadingTokens) {
      repetitionDetected = true;
    }

    const recentWithoutQuestion = stripTrailingQuestion(normalizedRecent);
    if (
      candidateWithoutQuestion.length > 0 &&
      candidateWithoutQuestion === recentWithoutQuestion &&
      normalizedRecent !== normalizedCandidate
    ) {
      repetitionDetected = true;
    }

    if (candidateMove && detectDialogueMove(recent) === candidateMove) {
      repetitionDetected = true;
      repeatedDialogueMove = candidateMove;
    }

    // Same cliché opening structure across turns.
    if (
      OPENING_CLICHE_PATTERN.test(candidateReply.trim()) &&
      OPENING_CLICHE_PATTERN.test(recent.trim())
    ) {
      repetitionDetected = true;
      repeatedDialogueMove = repeatedDialogueMove ?? 'repeated_opening_structure';
    }
  }

  return { repetitionDetected, similarityScore: highestSimilarity, repeatedDialogueMove };
}

/** @deprecated Use {@link analyzeRepetition} — kept for any external/legacy callers. */
export function detectRepetition(candidateReply: string, recentReplies: string[]): boolean {
  return analyzeRepetition(candidateReply, recentReplies).repetitionDetected;
}

export interface RepetitionGuardedResult extends DynamicResponseResult {
  repetitionDetected: boolean;
  regenerationUsed: boolean;
  similarityScore: number;
  repeatedDialogueMove: string | null;
  regenerationRequired: boolean;
}

/**
 * Applies the semantic repetition guard to an already-generated dynamic
 * response: if it repeats a recent assistant reply, requests exactly one
 * Groq regeneration — supplying the identified repeated dialogue move and
 * asking for meaningfully different wording. Prefers keeping a Groq reply
 * even if regeneration is still similar. Local fallback is used only when
 * regeneration itself hits an infrastructure/provider failure (no usable
 * Groq text). At most one extra Groq call is ever made.
 */
export async function applyRepetitionGuard(
  env: Env,
  input: DynamicResponseInput,
  candidate: DynamicResponseResult,
  fetchImpl?: FetchLike,
): Promise<RepetitionGuardedResult> {
  // Local fallbacks must also progress: never return the same assistant line again.
  if (candidate.responseMode !== 'groq-dynamic-rag') {
    const localAnalysis = analyzeRepetition(candidate.reply, input.recentAssistantMessages);
    if (!localAnalysis.repetitionDetected) {
      return {
        ...candidate,
        repetitionDetected: false,
        regenerationUsed: false,
        similarityScore: localAnalysis.similarityScore,
        repeatedDialogueMove: null,
        regenerationRequired: false,
      };
    }
    const progressed = generateLocalResponse({
      strategy: input.strategy,
      state: input.adaptiveState,
      riskResult: input.riskResult,
      evidence: input.retrievedEvidence,
      primaryIntent: input.primaryIntent,
      dialogueTurnPlan: input.dialogueTurnPlan,
      decisionSupportStrategy: input.decisionSupportStrategy,
      selectedOption:
        input.conversationMemory?.selectedCommunicationOption ?? input.decisionState?.selectedOption,
      actionTiming: input.conversationMemory?.plannedTiming ?? input.decisionState?.actionTiming,
      draftStatus: input.conversationMemory?.draftStatus ?? input.decisionState?.draftStatus,
      conversationMemory: input.conversationMemory,
      requestInterpretation: input.requestInterpretation,
      calculationResult: input.calculationResult,
      latestMessage: input.latestMessage,
      recentAssistantMessages: input.recentAssistantMessages,
    });
    const stillRepeated = analyzeRepetition(progressed, input.recentAssistantMessages).repetitionDetected;
    return {
      reply: stillRepeated ? lastResortNonRepeatingReply(input) : progressed,
      usedEvidenceIds: [],
      responseMode: 'local-rag-fallback',
      // Candidate was already local (provider/infra). Keep that reason if present.
      fallbackReason: candidate.fallbackReason ?? 'generation_provider_failure',
      repetitionDetected: true,
      regenerationUsed: true,
      similarityScore: localAnalysis.similarityScore,
      repeatedDialogueMove: localAnalysis.repeatedDialogueMove,
      regenerationRequired: true,
    };
  }

  const analysis = analyzeRepetition(candidate.reply, input.recentAssistantMessages);
  if (!analysis.repetitionDetected) {
    return {
      ...candidate,
      repetitionDetected: false,
      regenerationUsed: false,
      similarityScore: analysis.similarityScore,
      repeatedDialogueMove: null,
      regenerationRequired: false,
    };
  }

  const regenerated = await generateDynamicResponse(
    env,
    {
      ...input,
      avoidRepeatingReply: candidate.reply,
      repeatedDialogueMove: analysis.repeatedDialogueMove ?? undefined,
    },
    fetchImpl,
  );

  if (regenerated.responseMode === 'groq-dynamic-rag') {
    const regenerationAnalysis = analyzeRepetition(regenerated.reply, input.recentAssistantMessages);
    // Prefer Groq even when still similar — do not replace with local templates.
    return {
      ...regenerated,
      repetitionDetected: true,
      regenerationUsed: true,
      similarityScore: regenerationAnalysis.similarityScore,
      repeatedDialogueMove: analysis.repeatedDialogueMove,
      regenerationRequired: true,
    };
  }

  // Regeneration had no usable Groq text (infra/provider). Keep original Groq
  // candidate rather than switching the whole turn to local templates.
  return {
    ...candidate,
    fallbackReason: undefined,
    repetitionDetected: true,
    regenerationUsed: true,
    similarityScore: analysis.similarityScore,
    repeatedDialogueMove: analysis.repeatedDialogueMove,
    regenerationRequired: true,
  };
}
