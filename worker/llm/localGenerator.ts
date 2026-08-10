import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState, Barrier } from '../behavioral/state';
import type { DecisionSupportStrategy } from '../decisionSupport/types';
import type { ConversationMemory } from '../dialogue/conversationMemory';
import type { RequestInterpretation } from '../dialogue/currentTurnInterpretation';
import type { DialogueTurnPlan } from '../dialogue/types';
import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { RetrievedEvidence } from '../rag/types';
import type { RiskResult } from '../types';
import { generateOperationFallback } from './operationFallbacks';
import { shouldUseOperationFallback } from '../dialogue/currentTurnInterpretation';
import {
  asksMotivationSupport,
  extractChosenActivityLabel,
  isLifestyleActivityChoiceTurn,
} from '../dialogue/lifestyleActivitySignals';
import {
  asksWhoToContact,
  asksRiskExplanation,
  mentionsClarifyNumber,
  mentionsPrepareQuestions,
  normalizeUserText,
} from '../dialogue/normalizeUserText';
import { isClosingUtterance, isGratitudeUtterance } from '../dialogue/closingSignals';
import {
  GRATITUDE_FALLBACK,
  riskExplanationFallback,
  understandingNextStepFallback,
  WHO_TO_CONTACT_FALLBACK,
} from './fallbackCopy';

// Deterministic, template-based response generation. No external LLM call is
// made in this phase — responses are fixed, theory-informed strings selected
// by dialogue strategy (and, for explore_barrier, by the detected barrier),
// and factual/medical claims are only ever used when supported by locally
// retrieved evidence (see worker/rag/). Every response is kept short, asks
// at most one question, and avoids diagnostic or treatment language.

export interface LocalResponseInput {
  strategy: DialogueStrategy;
  state: AdaptiveState;
  riskResult: RiskResult;
  evidence: RetrievedEvidence[];
  /** Optional primary intent — used only to specialize local draft/next-step fallbacks. */
  primaryIntent?: string;
  /** Optional dialogue-turn plan — preferred when present for goal-specific fallbacks. */
  dialogueTurnPlan?: DialogueTurnPlan;
  decisionSupportStrategy?: DecisionSupportStrategy;
  selectedOption?: string | null;
  actionTiming?: string | null;
  draftStatus?: string | null;
  conversationMemory?: ConversationMemory;
  requestInterpretation?: RequestInterpretation;
  calculationResult?: NaturalFrequencyResult | null;
  /** Latest user message — used so fallback can progress instead of repeating. */
  latestMessage?: string;
  /** Recent assistant replies — used to avoid verbatim fallback loops. */
  recentAssistantMessages?: string[];
}

// Topics whose presence in the retrieved (medical-rag only — see
// worker/rag/retrieve.ts) evidence justifies the factual "a risk estimate
// is not a diagnosis" style claim used by clarify_risk and
// acknowledge_emotion. If none of these topics were retrieved, those
// strategies fall back to safer, ungrounded wording rather than asserting
// an unsupported medical claim. Kept in sync with the vetted topics
// defined in worker/rag/evidence.ts.
const RISK_INTERPRETATION_TOPICS = new Set([
  'calculator_purpose',
  'elevated_risk_not_current_cancer',
  'average_risk_not_zero',
]);

function hasGroundingTopic(evidence: RetrievedEvidence[], topics: ReadonlySet<string>): boolean {
  return evidence.some((item) => topics.has(item.topic));
}

export const NO_EVIDENCE_FALLBACK_RESPONSE =
  'I do not have enough grounded information to answer that safely. I can explain the general meaning of the demonstration risk result, but a qualified healthcare professional should interpret personal medical questions.';

const CLARIFY_RISK_RESPONSE =
  'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer. Does that help clarify what the number represents?';

const ACKNOWLEDGE_EMOTION_WITH_CLAIM =
  'It sounds like seeing this result has been worrying. A risk estimate is not a diagnosis. What part of the result feels most concerning?';

const ACKNOWLEDGE_EMOTION_WITHOUT_CLAIM =
  'It sounds like seeing this result has been worrying. What part of the result feels most concerning?';

/** When the user names fear of currently having cancer after a concern prompt. */
const ACKNOWLEDGE_FEAR_OF_CURRENT_CANCER =
  'Feeling afraid that this means you currently have breast cancer is understandable. A demonstration risk estimate describes chance over time for people with similar calculator information — it is not a diagnosis of current cancer. A qualified healthcare professional can interpret it with your fuller history. Would it help next to look at what the number means, or at questions you could ask a professional?';

const ACKNOWLEDGE_EMOTION_PROGRESSION_NO_REASK =
  'Thank you for sharing that. Feeling worried about what the result could mean is understandable. A demonstration risk estimate is a probability over time, not a diagnosis. Would it help to clarify the number itself, or to prepare a question for a healthcare professional?';

function normalizeLocalMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\bbreastcancer\b/g, 'breast cancer')
    .replace(/\s+/g, ' ')
    .trim();
}

function fearsCurrentCancer(message: string): boolean {
  const m = normalizeLocalMessage(message);
  return (
    /\b(afraid|scared|worried|fear|terrified).{0,50}\b(have|having|got|get)\b.{0,30}\b(breast cancer|cancer)\b/.test(
      m,
    ) ||
    /\bafraid if i have\b.{0,30}\b(breast cancer|cancer)\b/.test(m) ||
    /\b(do i|did i|might i|may i) have\b.{0,20}\b(breast cancer|cancer)\b/.test(m)
  );
}

function previousAskedMostConcerning(recentAssistantMessages?: string[]): boolean {
  const prev = recentAssistantMessages?.[0] ?? '';
  return /\bmost concerning\b/i.test(prev) || /\bwhat part of the result\b/i.test(prev);
}

function isNearDuplicate(candidate: string, recentAssistantMessages?: string[]): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const c = norm(candidate);
  if (!c) return false;
  return (recentAssistantMessages ?? []).some((prev) => {
    const p = norm(prev);
    if (!p) return false;
    if (p === c) return true;
    const shorter = p.length < c.length ? p : c;
    const longer = p.length < c.length ? c : p;
    return shorter.length >= 40 && longer.includes(shorter);
  });
}

const BARRIER_RESPONSES: Partial<Record<Barrier, string>> = {
  fear: 'It sounds like fear is making follow-up feel difficult. What part of taking the next step feels most concerning?',
  time: 'It sounds like time is the main obstacle — calling during work may not fit. A written option, such as a patient-portal message when available, may be easier. Would writing feel more manageable than calling?',
  cost: 'It sounds like cost may be making follow-up difficult. Would it help to identify a clinic contact who can explain appointment or coverage options?',
  access: WHO_TO_CONTACT_FALLBACK,
  mistrust:
    'It sounds like you are uncertain about trusting the result. What part of the calculator or explanation concerns you most?',
  uncertainty:
    'It sounds like uncertainty is making the next step difficult. What information would help you feel clearer?',
  delay:
    "It sounds like you know the next step but it keeps getting put off. What would make it easier to actually do it, rather than plan to?",
  other:
    'It sounds like something may be making follow-up difficult. What is the main obstacle for you right now?',
};

const STATIC_RESPONSES: Partial<Record<DialogueStrategy, string>> = {
  explain_benefit:
    'A healthcare professional can interpret the estimate together with your personal and family history. Would it be helpful to discuss what a follow-up conversation might involve?',
  support_self_efficacy:
    'It is okay not to know exactly where to start. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?',
  action_planning:
    'You have identified a possible next step. A healthcare professional can interpret the result using broader medical information. What action feels realistic for you?',
  confirm_progress:
    'Glad that is clear. What would you like to do next with this demonstration estimate?',
  greet_user:
    'Hello — I am an educational demonstration guide for this risk-result conversation. What would you like to discuss about the result?',
  close_supportively:
    'You are welcome. I am glad that helped. You can return anytime if another question comes up.',
  ask_clarification:
    'Thanks for clarifying. What did you mean instead?',
  explore_readiness:
    'How do you currently feel about discussing this result with a healthcare professional?',
};

const DUAL_CHOICE_CLARIFICATION =
  'Just to be sure — would you like help clarifying the number itself, or preparing a question for a healthcare professional?';

function selectedPrepareQuestions(latest: string): boolean {
  return mentionsPrepareQuestions(normalizeUserText(latest));
}

function selectedClarifyNumber(latest: string): boolean {
  return mentionsClarifyNumber(normalizeUserText(latest));
}

function inDualChoiceContext(input: LocalResponseInput): boolean {
  const meaning = (input.requestInterpretation?.explicitRequest ?? '').toLowerCase();
  const prev = input.recentAssistantMessages?.[0] ?? '';
  return (
    /two options|which one|clarif.+vs|or preparing a question/i.test(meaning) ||
    /\b(would it help|would you like).+\bor\b.+/i.test(prev) ||
    /\b(number|clarif\w*).+\bor\b.+\b(question|prepare)\b/i.test(prev) ||
    /\bjust to be sure\b.+\bor\b/i.test(prev)
  );
}

function wantsDualChoiceClarification(input: LocalResponseInput): boolean {
  const latest = normalizeUserText(input.latestMessage ?? '');
  if (!latest) return false;
  // User already chose a side — do not re-ask.
  if (selectedPrepareQuestions(latest) || selectedClarifyNumber(latest)) return false;
  const shortYes = /^(yes|yeah|yep|yup|sure|ok|okay)\.?$/.test(latest);
  if (!shortYes) return false;
  return inDualChoiceContext(input);
}

const DRAFT_HELP_RESPONSE =
  'Here is a short editable draft you could adapt: "Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it with my personal and family history. Please advise whether a discussion would be appropriate." Would you like to revise any part of it?';

const CLINICIAN_QUESTIONS_RESPONSE =
  'Here are some general questions people often ask a healthcare professional about a demonstration risk estimate: What does this estimate mean for me personally? Which parts of my personal or family history matter most here? Are any follow-up discussions or tests appropriate for my situation? What should I watch for or ask about next? These are general preparation ideas, not a personalized care plan.';

const CLINICIAN_QUESTIONS_DETAILED_RESPONSE =
  'Here are more detailed general questions people often ask a healthcare professional about a demonstration risk estimate. What does this estimate mean for me personally? — helps translate a population-level number into your individual context. Which parts of my personal or family history matter most here? — clarifies which factors a clinician may weigh most. Are any follow-up discussions or tests appropriate for my situation? — keeps next steps individualized rather than assumed. How should I use this demonstration result alongside screening or other care already in place? — avoids treating the estimate as a diagnosis. What should I watch for or ask about next? — supports ongoing questions without pressure. These are general preparation ideas, not a personalized care plan.';

const DRAFT_REVIEW_RESPONSE =
  'That wording is clear and appropriate as a request for interpretation — it does not diagnose or demand an appointment. Would you like to send it as written, or adjust anything first?';

const DRAFT_ACCEPTED_RESPONSE =
  'The draft is ready to use. When would you like to send it?';

const DRAFT_ACCEPTED_WITH_TIMING_RESPONSE =
  'The draft is ready, and your next step is clear. You can send it when you feel ready.';

const DRAFT_REJECTED_RESPONSE =
  'That is completely fine. You do not have to send that message. If you want a different approach later, we can look at options without pressure.';

const OPTION_SELECTED_RESPONSE =
  'Writing to the clinic fits well when schedule is tight. If you want, I can help draft a short editable message for that channel.';

const NEXT_STEP_RESPONSE =
  'A general next step many people choose is to share the demonstration estimate with a healthcare professional and ask how it fits their personal and family history. Would writing a brief portal message or bringing it to an existing visit feel more manageable?';

const SELECTED_OPTION_RESPONSE =
  'A portal message fits well when calling during work is hard. If you want, I can help draft a short editable message that asks for interpretation of this demonstration estimate. Would that be useful?';

const FALLBACK_RESPONSE = STATIC_RESPONSES.explore_readiness as string;

/**
 * Generates a deterministic, theory-informed, evidence-grounded reply for
 * a non-safety dialogue strategy. `safety_boundary` and `urgent_referral`
 * are handled separately by worker/safety/safetyResponses.ts, which takes
 * precedence over this generator entirely and never depends on it — see
 * worker/index.ts.
 *
 * Only `clarify_risk` and `acknowledge_emotion` make a factual claim about
 * what a risk estimate means, so only those two strategies are gated on
 * retrieved evidence: if no relevant evidence was retrieved, they fall
 * back to safer wording (or, for clarify_risk, the explicit "not enough
 * grounded information" fallback) rather than asserting an unsupported
 * claim. Other strategies offer behavioral suggestions, not medical
 * claims, so they are not evidence-gated.
 */
export function generateLocalResponse(input: LocalResponseInput): string {
  const { strategy, state, evidence, primaryIntent, dialogueTurnPlan, decisionSupportStrategy, selectedOption } = input;
  const isGrounded = hasGroundingTopic(evidence, RISK_INTERPRETATION_TOPICS);
  const primaryGoal = dialogueTurnPlan?.primaryGoal;
  const wantsDraft =
    primaryIntent === 'request_draft_help' ||
    (primaryGoal === 'provide_practical_help' && dialogueTurnPlan?.nextPendingItem?.type === 'proposed_draft') ||
    dialogueTurnPlan?.nextPendingItem?.type === 'proposed_draft';

  const latestForChoice = input.latestMessage ?? '';
  if (
    isGratitudeUtterance(latestForChoice) ||
    isClosingUtterance(latestForChoice) ||
    strategy === 'close_supportively' ||
    primaryIntent === 'gratitude' ||
    primaryIntent === 'conversation_closing' ||
    primaryGoal === 'close_supportively'
  ) {
    return GRATITUDE_FALLBACK;
  }
  if (asksMotivationSupport(latestForChoice)) {
    return /\b(every ?day|daily|each day)\b/i.test(latestForChoice)
      ? 'I can offer educational motivational support in this conversation, though I cannot send daily check-ins outside the session. Regular physical activity is linked with lower breast cancer risk at a population level. What is one healthy habit or activity you want to focus on right now?'
      : 'I can offer educational motivational support in this session—not daily coaching or a personalized training plan. Regular physical activity is linked with lower breast cancer risk at a population level. What is one healthy habit or activity you want to focus on right now?';
  }
  // Lifestyle activity choice (e.g. "I like doing gym") — reinforce, do not use clinician action-planning.
  if (
    isLifestyleActivityChoiceTurn(
      latestForChoice,
      input.recentAssistantMessages?.[0],
      input.conversationMemory?.lastRouteTopic,
    ) ||
    (input.requestInterpretation?.semanticTurn?.topic === 'lifestyle_risk_information' &&
      /chosen activity:/i.test(input.requestInterpretation.semanticTurn.userConstraints.join(' ')))
  ) {
    const activity = extractChosenActivityLabel(latestForChoice);
    return `Regular physical activity is associated with lower breast cancer risk at a population level. Choosing ${activity} is a practical way to keep movement in your routine—sticking with something you already like often makes maintenance easier. This is general educational encouragement, not a personalized training or treatment plan. What would help you keep ${activity} consistent this week?`;
  }

  // Advance A-or-B flow when the user picks a side (typos like "quetsion" allowed).
  if (inDualChoiceContext(input) && selectedPrepareQuestions(latestForChoice)) {
    return CLINICIAN_QUESTIONS_RESPONSE;
  }
  if (inDualChoiceContext(input) && selectedClarifyNumber(latestForChoice)) {
    return isGrounded ? CLARIFY_RISK_RESPONSE : riskExplanationFallback(input.riskResult);
  }

  // Bare "yes" after an A-or-B offer → ask which option, not a generic clarification.
  if (wantsDualChoiceClarification(input)) {
    return DUAL_CHOICE_CLARIFICATION;
  }

  // Operation-specific fallbacks take priority over generic risk templates.
  if (input.requestInterpretation && shouldUseOperationFallback(input.requestInterpretation)) {
    return generateOperationFallback({
      interpretation: input.requestInterpretation,
      riskResult: input.riskResult,
      calculation: input.calculationResult,
    });
  }

  if (input.draftStatus === 'rejected' || (decisionSupportStrategy === 'support_deferral' && input.draftStatus === 'rejected')) {
    return DRAFT_REJECTED_RESPONSE;
  }

  const timingKnown = Boolean(
    input.actionTiming ||
      input.conversationMemory?.plannedTiming ||
      (input.selectedOption && /\btonight|today|tomorrow|after work\b/i.test(input.selectedOption)),
  );
  const draftAccepted =
    input.draftStatus === 'accepted' || input.conversationMemory?.draftStatus === 'accepted';

  if (
    primaryIntent === 'confirm_action' ||
    (primaryGoal === 'confirm_progress' && timingKnown && draftAccepted) ||
    (dialogueTurnPlan?.unresolvedNeed?.includes('acknowledge the specific plan') ?? false)
  ) {
    const timing = input.conversationMemory?.plannedTiming ?? input.actionTiming ?? 'tonight';
    return `That is a clear next step. You can send the message ${timing} when you are ready.`;
  }

  if (wantsDraft) {
    return DRAFT_HELP_RESPONSE;
  }
  if (
    primaryIntent === 'confirm_proposed_action' ||
    (primaryGoal === 'confirm_progress' && decisionSupportStrategy === 'confirm_selected_action') ||
    (strategy === 'confirm_progress' && decisionSupportStrategy === 'confirm_selected_action')
  ) {
    return timingKnown ? DRAFT_ACCEPTED_WITH_TIMING_RESPONSE : DRAFT_ACCEPTED_RESPONSE;
  }
  if (
    (selectedOption || input.conversationMemory?.selectedCommunicationOption) &&
    (primaryIntent === 'express_confidence' || primaryGoal === 'recognize_capability') &&
    !wantsDraft
  ) {
    return OPTION_SELECTED_RESPONSE;
  }
  if (
    primaryGoal === 'list_questions_for_clinician' ||
    (decisionSupportStrategy === 'prepare_questions' &&
      primaryIntent !== 'request_draft_help' &&
      !wantsDraft)
  ) {
    const wantsDetail =
      /detailed/i.test(dialogueTurnPlan?.mustAddress?.join(' ') ?? '') ||
      /detailed/i.test(input.requestInterpretation?.explicitRequest ?? '') ||
      /detailed|in detail|indetail/i.test(input.requestInterpretation?.semanticTurn?.requestedFormat ?? '');
    return wantsDetail ? CLINICIAN_QUESTIONS_DETAILED_RESPONSE : CLINICIAN_QUESTIONS_RESPONSE;
  }
  if (decisionSupportStrategy === 'prepare_questions' && selectedOption) {
    return primaryIntent === 'request_draft_help' ? DRAFT_HELP_RESPONSE : CLINICIAN_QUESTIONS_RESPONSE;
  }
  if (
    primaryIntent === 'request_draft_review' ||
    primaryGoal === 'review_user_draft' ||
    decisionSupportStrategy === 'review_draft'
  ) {
    return DRAFT_REVIEW_RESPONSE;
  }
  if (selectedOption && /portal/i.test(selectedOption) && decisionSupportStrategy === 'clarify_preferences') {
    return SELECTED_OPTION_RESPONSE;
  }
  if (strategy === 'ask_clarification' && wantsDualChoiceClarification(input)) {
    return DUAL_CHOICE_CLARIFICATION;
  }

  if (asksWhoToContact(input.latestMessage ?? '')) {
    return WHO_TO_CONTACT_FALLBACK;
  }

  if (
    asksRiskExplanation(input.latestMessage ?? '') ||
    primaryIntent === 'explain_risk' ||
    primaryIntent === 'explain_risk_horizon' ||
    strategy === 'clarify_risk'
  ) {
    // Prefer a number-aware local explanation over the generic "not enough grounded info" line.
    return riskExplanationFallback(input.riskResult);
  }

  if (strategy === 'explore_barrier') {
    return BARRIER_RESPONSES[state.barrier] ?? (BARRIER_RESPONSES.other as string);
  }

  if (
    primaryIntent === 'request_next_step' ||
    primaryGoal === 'provide_practical_help' ||
    decisionSupportStrategy === 'clarify_options'
  ) {
    return selectedOption && /portal/i.test(selectedOption) ? SELECTED_OPTION_RESPONSE : NEXT_STEP_RESPONSE;
  }

  if (
    strategy === 'confirm_progress' ||
    primaryIntent === 'confirm_understanding' ||
    primaryGoal === 'confirm_understanding' ||
    /confirm_understanding|already understood/i.test(primaryGoal ?? '')
  ) {
    return understandingNextStepFallback(input.riskResult);
  }

  if (strategy === 'acknowledge_emotion' || /acknowledge_emotion|acknowledge concern/i.test(primaryGoal ?? '')) {
    const latest = input.latestMessage ?? input.requestInterpretation?.explicitRequest ?? '';
    if (fearsCurrentCancer(latest)) {
      return ACKNOWLEDGE_FEAR_OF_CURRENT_CANCER;
    }
    if (previousAskedMostConcerning(input.recentAssistantMessages)) {
      return ACKNOWLEDGE_EMOTION_PROGRESSION_NO_REASK;
    }
    const emotionReply = isGrounded ? ACKNOWLEDGE_EMOTION_WITH_CLAIM : ACKNOWLEDGE_EMOTION_WITHOUT_CLAIM;
    if (isNearDuplicate(emotionReply, input.recentAssistantMessages)) {
      return ACKNOWLEDGE_EMOTION_PROGRESSION_NO_REASK;
    }
    return emotionReply;
  }

  // Memory-aware fallbacks for action/readiness paths only.
  if (
    (draftAccepted || timingKnown) &&
    (strategy === 'action_planning' ||
      strategy === 'explore_readiness' ||
      strategy === 'confirm_progress' ||
      strategy === 'support_self_efficacy')
  ) {
    if (timingKnown) {
      const timing = input.conversationMemory?.plannedTiming ?? input.actionTiming ?? 'tonight';
      return `That is a clear next step. You can send the message ${timing} when you are ready.`;
    }
    return DRAFT_ACCEPTED_RESPONSE;
  }
  if (
    (selectedOption || input.conversationMemory?.selectedCommunicationOption) &&
    (strategy === 'action_planning' || strategy === 'explore_readiness' || strategy === 'support_self_efficacy')
  ) {
    return OPTION_SELECTED_RESPONSE;
  }

  return STATIC_RESPONSES[strategy] ?? FALLBACK_RESPONSE;
}
