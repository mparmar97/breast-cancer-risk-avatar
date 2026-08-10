/**
 * Schema-driven semantic interpretation of the latest user turn.
 * Uses reusable semantic features (not sentence-specific production rules).
 * Exact example sentences belong in tests only.
 */

import type { RiskResult } from '../types';
import {
  ACCESS_SYNONYM_PATTERN,
  COST_SYNONYM_PATTERN,
  DELAY_SYNONYM_PATTERN,
  MISTRUST_SYNONYM_PATTERN,
  TIME_SYNONYM_PATTERN,
  UNCERTAINTY_SYNONYM_PATTERN,
  WORRY_SYNONYM_PATTERN,
  inferEmotionFromFeelingPhrase,
} from '../behavioral/adaptiveSignalLexicon';
import { isClosingUtterance, isGratitudeUtterance } from './closingSignals';
import {
  asksMotivationSupport,
  extractChosenActivityLabel,
  isLifestyleActivityChoiceTurn,
} from './lifestyleActivitySignals';
import { assertsUnderstandingUtterance } from './understandingSignals';
import { asksWhoToContact, asksRiskExplanation, normalizeUserText } from './normalizeUserText';
import type { PendingConversationItem } from './types';

export type SemanticTopic =
  | 'risk_meaning'
  | 'risk_representation'
  | 'risk_level'
  | 'risk_uncertainty'
  | 'time_horizon'
  | 'calculator_inputs'
  | 'calculator_result_source'
  | 'calculator_limitations'
  | 'calculator_validation'
  | 'calculator_applicability'
  | 'evidence_source'
  | 'screening_guidance'
  | 'symptom_guidance'
  | 'professional_interpretation'
  | 'lifestyle_risk_information'
  | 'communication_support'
  | 'message_drafting'
  | 'action_planning'
  | 'conversation_summary'
  | 'emotion'
  | 'greeting'
  | 'closing'
  | 'safety'
  | 'out_of_scope'
  | 'unclear';

export type SemanticOperation =
  | 'explain'
  | 'simplify'
  | 'convert'
  | 'compare'
  | 'correct_misunderstanding'
  | 'verify_understanding'
  | 'answer_factual_question'
  | 'answer_general_health_question'
  | 'explain_lifestyle_relationship'
  | 'set_personalized_advice_boundary'
  | 'provide_preparation_information'
  | 'list_information'
  | 'identify_limitation'
  | 'elaborate'
  | 'address_barrier'
  | 'clarify_preference'
  | 'provide_options'
  | 'draft'
  | 'revise'
  | 'review'
  | 'confirm'
  | 'reject'
  | 'defer'
  | 'plan'
  | 'summarize'
  | 'close'
  | 'set_boundary'
  | 'request_clarification';

export type SemanticStance =
  | 'asking'
  | 'asserting'
  | 'confirming'
  | 'correcting'
  | 'accepting'
  | 'rejecting'
  | 'deferring'
  | 'planning'
  | 'completed'
  | 'uncertain'
  | 'neutral';

/** @deprecated Prefer SemanticTopic — kept for gradual migration. */
export type DomainTopic = SemanticTopic;
/** @deprecated Prefer SemanticOperation — kept for gradual migration. */
export type UserOperation = SemanticOperation;
/** @deprecated Prefer SemanticStance — kept for gradual migration. */
export type UserStance = SemanticStance;

export type SemanticUnderstanding =
  | 'correct'
  | 'partial'
  | 'incorrect'
  | 'not_assessable';

export type SemanticMisunderstanding =
  | 'risk_means_diagnosis'
  | 'risk_means_certainty'
  | 'average_means_zero_risk'
  | 'elevated_means_diagnosis'
  | 'elevated_means_certainty'
  | 'annualized_five_year_risk'
  | 'incorrect_frequency'
  | 'incorrect_time_horizon'
  | 'none'
  | 'not_expressed';

/** Alias used by risk-dialogue consumers. */
export type RiskMisunderstanding = SemanticMisunderstanding;

export type SemanticEmotion =
  | 'fear'
  | 'worry'
  | 'frustration'
  | 'confusion'
  | 'relief'
  | 'none'
  | 'not_expressed';

export type SemanticBarrier =
  | 'time'
  | 'cost'
  | 'access'
  | 'mistrust'
  | 'delay'
  | 'uncertainty'
  | 'none'
  | 'not_expressed';

export interface SemanticProposition {
  text: string;
  status: 'question' | 'user_claim' | 'preference' | 'constraint' | 'correction' | 'commitment';
}

export interface SemanticTurnEvidence {
  topic: string;
  operation: string;
  stance?: string;
  understanding: string;
  misunderstanding: string;
  emotion: string;
  barrier: string;
}

export type SemanticClassificationMode =
  | 'groq-structured'
  | 'local-semantic-fallback'
  | 'local-fallback';

export interface SemanticTurn {
  topic: SemanticTopic;
  primaryOperation: SemanticOperation;
  secondaryOperations: SemanticOperation[];
  stance: SemanticStance;

  explicitRequest: string;
  requestedFormat?: string;
  /** Alias of requestedFormat. */
  requestedOutputFormat?: string;

  /** Proposition texts derived for the turn. */
  claims: string[];
  /** Alias of claims. */
  userClaims: string[];
  /** Explicit question texts when the user is information-seeking. */
  userQuestions: string[];
  /** Alias of userConstraints content. */
  constraints: string[];

  /** Compat: structured propositions (synced with claims). */
  propositions: SemanticProposition[];
  /** Compat: same content as constraints. */
  userConstraints: string[];

  entities: {
    riskValue?: number;
    denominator?: number;
    timeHorizon?: string;
    referencedObject?: string;
    calculatorName?: string;
    selectedOption?: string;
    timing?: string;
    draftText?: string;
  };

  understanding: SemanticUnderstanding;
  misunderstanding?: SemanticMisunderstanding;
  emotion: SemanticEmotion;
  barrier: SemanticBarrier;

  evidence: SemanticTurnEvidence;

  /** Compat: evidence plus explicitRequest and stance. */
  currentTurnEvidence: SemanticTurnEvidence & {
    explicitRequest: string;
    stance: string;
  };

  directAnswerRequired: boolean;
  requiresCalculatorMetadata: boolean;
  requiresCalculation: boolean;
  /** Compat alias of requiresCalculation. */
  requiresDeterministicCalculation: boolean;
  requiresMedicalEvidence: boolean;
  requiresSafetyBoundary: boolean;
  requiresConversationContext: boolean;
  requiresClarification: boolean;

  confidence: number;
  /** Prefer writing local-semantic-fallback; local-fallback accepted for compat. */
  classificationMode: SemanticClassificationMode;
}

export interface InterpretSemanticTurnInput {
  latestMessage: string;
  riskResult?: RiskResult;
  pendingItem?: PendingConversationItem;
  previousAssistantReply?: string;
  previousDraftPending?: boolean;
  resolvedShortReplyMeaning?: string;
}

function normalize(message: string): string {
  return normalizeUserText(message);
}

function uniqueOps(ops: SemanticOperation[]): SemanticOperation[] {
  return Array.from(new Set(ops));
}

function extractRiskValue(message: string, riskResult?: RiskResult): number | undefined {
  const match = message.match(/\b(\d+(?:\.\d+)?)\s*%/);
  if (match) return Number(match[1]);
  if (/\b(the )?(number|result|estimate|percentage|risk|score)\b/.test(message) && riskResult) {
    return riskResult.fiveYearRisk;
  }
  return undefined;
}

function extractDenominator(message: string): number | undefined {
  const thousand =
    message.match(/\b(?:out of|per)\s+1(?:[,\s]?000)\b/) || message.match(/\b1(?:[,\s]?000)\b/);
  if (thousand || /\bthousand\b/.test(message)) return 1000;
  const match =
    message.match(/\b(?:out of|per)\s+(\d{2,4})\b/) || message.match(/\b(\d{2,4})\s+people\b/);
  if (match) return Number(match[1]);
  if (/\b100\b/.test(message)) return 100;
  return undefined;
}

function extractTiming(message: string): string | undefined {
  const match = message.match(/\b(tonight|today|tomorrow|after work|this weekend|later this week)\b/);
  return match?.[0];
}

function snippet(message: string, pattern: RegExp, fallback: string): string {
  const match = message.match(pattern);
  return match?.[0]?.trim() || fallback;
}

/** Reusable semantic features — category detectors, not full-sentence lists. */
export interface SemanticFeatures {
  asksQuestion: boolean;
  wantsConversion: boolean;
  teachesBackFrequency: boolean;
  assertsIndividualPrediction: boolean;
  asksCertainty: boolean;
  asksLimitation: boolean;
  asksInputs: boolean;
  asksTimeHorizonCompare: boolean;
  asksRiskMeaning: boolean;
  asksRiskLevel: boolean;
  asksElevatedMeaning: boolean;
  asksConcernCalibration: boolean;
  assertsRiskMeansDiagnosis: boolean;
  averageMeansZero: boolean;
  elevatedMeansDiagnosis: boolean;
  asksSimpleLanguage: boolean;
  wantsElaborate: boolean;
  asksScreeningGuidance: boolean;
  asksCalculatorResultSource: boolean;
  asksNextStep: boolean;
  asksDraftHelp: boolean;
  asksDraftRevision: boolean;
  acceptsDraft: boolean;
  rejectsDraft: boolean;
  commitsTiming: boolean;
  expressesEmotion: SemanticEmotion;
  expressesBarrier: SemanticBarrier;
  assertsUnderstanding: boolean;
  greeting: boolean;
  closing: boolean;
  safetyTrigger: boolean;
  wantsBrief: boolean;
  wantsDetailed: boolean;
  wantsInformal: boolean;
  wantsSingleStep: boolean;
  /** Category: exercise / physical activity / lifestyle / diet focus questions. */
  asksLifestyleFocus: boolean;
  /** Category: preparation before talking with a healthcare professional. */
  asksPreparationInfo: boolean;
  /** Category: wants sample questions to ask a clinician (not a message draft). */
  asksClinicianQuestions: boolean;
}

export function detectSemanticFeatures(rawMessage: string): SemanticFeatures {
  const message = normalize(rawMessage);

  const inferredEmotion = inferEmotionFromFeelingPhrase(message);
  const strongFear =
    /\b(terrified|afraid|scared|fear|dread|panicky|freaks?(ed|ing)?( me)? out)\b/.test(message);
  const emotion: SemanticEmotion = strongFear
    ? 'fear'
    : inferredEmotion === 'worried' ||
        WORRY_SYNONYM_PATTERN.test(message) ||
        /\b(tense|tensed|tension|stressed|uneasy|on edge)\b/.test(message)
      ? 'worry'
      : /\b(frustrated|annoyed|irritated)\b/.test(message)
        ? 'frustration'
        : /\b(confused|unclear|lost)\b/.test(message)
          ? 'confusion'
          : /\b(relieved|relief|better now)\b/.test(message)
            ? 'relief'
            : 'not_expressed';

  const barrier: SemanticBarrier = DELAY_SYNONYM_PATTERN.test(message)
    ? 'delay'
    : TIME_SYNONYM_PATTERN.test(message)
      ? 'time'
      : asksWhoToContact(message) || ACCESS_SYNONYM_PATTERN.test(message)
        ? 'access'
        : COST_SYNONYM_PATTERN.test(message)
          ? 'cost'
          : MISTRUST_SYNONYM_PATTERN.test(message)
            ? 'mistrust'
            : UNCERTAINTY_SYNONYM_PATTERN.test(message) && /\b(contact|send|next)\b/.test(message)
              ? 'uncertainty'
              : 'not_expressed';

  const asksElevatedMeaning =
    /\b(what (does|is)|explain|mean(s|ing)?).{0,40}\belevated\b/.test(message) ||
    /\belevated.{0,40}(mean|means|meaning|compared|versus|vs\.?|higher than|above)\b/.test(message) ||
    (/\belevated (risk|result|score|estimate|label)\b/.test(message) &&
      (/\?/.test(rawMessage) || /^(what|does|is|how|explain)\b/.test(message)) &&
      !/\b(i have|diagnos|cancer|certain|definitely)\b/.test(message));

  const asksConcernCalibration =
    /\bhow (concerned|worried|afraid|anxious) should i (be|feel)\b/.test(message) ||
    /\b(should i (be|feel) (concerned|worried)|how (much|worried|concerned) .{0,20}(should|ought))\b/.test(
      message,
    ) ||
    /\b(how (serious|bad) (is|does) (this|my|the) (risk|result|number|estimate))\b/.test(message);

  const assertsRiskMeansDiagnosis =
    (/\b(is (this|that|it|the (number|result|estimate|score)) (a )?diagnos)\b/.test(message) ||
      /\b(does (this|that|it|the (number|result|estimate)) mean i (have|got))\b/.test(message) ||
      /\b(risk|estimate|percentage|number|result|score).{0,40}(is|equals?|means?) (a )?diagnos\b/.test(
        message,
      ) ||
      /\b(probability|estimate).{0,30}(same as|equals?) (having|a diagnosis)\b/.test(message) ||
      /\bsame as (a )?diagnos\b/.test(message)) &&
    !/\belevated\b/.test(message);

  return {
    asksQuestion: /\?/.test(rawMessage) || /^(can|what|why|how|does|is|should|would|will)\b/.test(message),
    wantsConversion:
      /\bwithout (using )?percentages?\b/.test(message) ||
      /\bas (people|persons) out of\b/.test(message) ||
      /\bnatural frequency\b/.test(message) ||
      (/\bexplain\b/.test(message) && /\bout of\s+\d+/.test(message)) ||
      /\bexplain it again.{0,40}out of\b/.test(message) ||
      /\b(group of (people|persons)|into a frequency|translate .{0,24}(number|percent|percentage|estimate))\b/.test(
        message,
      ) ||
      /\bhow many (people|persons).{0,30}out of\b/.test(message) ||
      /\bput .{0,40}(group|out of|people)\b/.test(message) ||
      /\b(people|persons) out of (100|a hundred|one hundred)\b/.test(message) ||
      /\bconvert .{0,40}(people|persons|frequency|out of)\b/.test(message),
    teachesBackFrequency:
      /\b(so )?(about )?\d+(\.\d+)?\s*(people|persons)?\s*out of\s*\d+/.test(message) ||
      /\bout of\s*\d+.{0,50}(may|might|could) develop\b/.test(message),
    assertsIndividualPrediction:
      (/\b(knows? what will happen|knows? my (future|outcome|diagnosis)|predicts? my|predict(s|ing)? (my |the )?future|foresee|tells? exactly what|telling my future|personal outcome|eventual diagnosis|certain about what will happen|function like a prediction|can tell whether i will|tell whether i will get)\b/.test(
        message,
      ) ||
        /\b(this|the) (number|score|result|estimate).{0,40}(predict|future|tell exactly)\b/.test(message) ||
        (/\b(calculator|model).{0,40}\b(knows?|predicts?|certain|foresee)\b/.test(message) &&
          !/\bcannot\b|\bcan'?t\b/.test(message)) ||
        /\bit can tell whether\b/.test(message)) &&
      !/\bwant to know what\b/.test(message) &&
      !/\b(do not|don't|dont) know what to (write|do)\b/.test(message) &&
      !/\b(cannot|can'?t|why).{0,40}predict\b/.test(message),
    asksCertainty:
      /\b(is .{0,20}certain|how certain|cannot know for sure|can'?t know for sure)\b/.test(message),
    asksLimitation:
      /\b(cannot|can'?t|not) (predict|tell).{0,40}(exactly|individual|what will happen|me)\b/.test(
        message,
      ) ||
      /\bwhy .{0,40}(cannot|can'?t|not).{0,40}(predict|individual)\b/.test(message) ||
      /\bnot a diagnosis\b/.test(message) ||
      /\b(might it not include|does not include|important factors)\b/.test(message),
    asksInputs:
      /\b(what information|what (inputs?|factors?)|calculator use|input (factors?|information))\b/.test(
        message,
      ),
    asksTimeHorizonCompare:
      /\b(difference|compare|versus|vs\.?|between).{0,40}(five[- ]?year|5[- ]?year|lifetime)\b/.test(
        message,
      ) ||
      /\b(five[- ]?year|5[- ]?year).{0,40}(lifetime|versus|vs)\b/.test(message) ||
      /\blifetime.{0,40}(five[- ]?year|5[- ]?year)\b/.test(message),
    asksRiskMeaning:
      /\bwhat does .{0,20}(%|percent|number|result|estimate|risk|score) mean\b/.test(message) ||
      /\bexplain .{0,40}(risk|percent|percentage|result|number|score|estimate)\b/.test(message) ||
      asksRiskExplanation(message),
    asksRiskLevel:
      /\b(is (this|my|the) (risk|result|score|estimate|number) (high|low|average|elevated|normal))\b/.test(
        message,
      ) ||
      /\b(am i (at )?(high|low|average|elevated) risk)\b/.test(message) ||
      /\b(what (is|does) .{0,24}(risk )?level)\b/.test(message) ||
      (/\b(high|low|average|elevated|normal) risk\b/.test(message) &&
        (/\?/.test(rawMessage) || /^(is|am|does|what)\b/.test(message))),
    asksElevatedMeaning,
    asksConcernCalibration,
    assertsRiskMeansDiagnosis,
    averageMeansZero:
      /\b(average|normal|low).{0,48}(mean|means|so|therefore|label).{0,48}(zero|no risk|nothing (bad|to worry|wrong)|fine|safe|not (at )?risk|cannot happen|can'?t happen)\b/.test(
        message,
      ) ||
      /\b(average|normal).{0,40}(label|score|result|estimate).{0,40}(nothing bad|no risk|zero|safe|fine)\b/.test(
        message,
      ) ||
      /\b(zero risk|no risk|nothing to worry|nothing bad can happen|i('m| am) (safe|fine|ok)).{0,40}(average|normal|low)\b/.test(
        message,
      ) ||
      /\b(average|normal).{0,30}(so )?(i('m| am) )?(safe|fine|ok|good)\b/.test(message) ||
      /\bsince .{0,24}(average|normal|low).{0,30}(zero|no |safe|fine)\b/.test(message) ||
      /\b(average|normal).{0,20}(means?|so).{0,20}(safe|fine|ok|zero|no risk)\b/.test(message),
    elevatedMeansDiagnosis:
      /\b(elevated|high).{0,48}(mean|means|so|therefore|equals?).{0,40}(i have|cancer|diagnos|disease)\b/.test(
        message,
      ) ||
      /\b(so i (have|got) (breast )?cancer)\b/.test(message) ||
      /\b(elevated|high) (risk|result|score|estimate).{0,30}(is|equals?) (cancer|a diagnosis)\b/.test(
        message,
      ) ||
      (/\b(elevated|high) risk\b/.test(message) &&
        /\b(i have cancer|means cancer|means i have|diagnos)\b/.test(message)),
    asksSimpleLanguage:
      /\b(simple(r)? (words|language|terms)|plain (english|language|nontechnical|non-technical)|like i('m| am) five|eli5|less jargon|easier (words|terms)|in simple terms|nontechnical|non-technical|without (the )?jargon)\b/.test(
        message,
      ),
    wantsElaborate:
      /\b(tell me more|more detail|more details|elaborate|go deeper|expand on|in more depth|explain (more|further)|can you say more)\b/.test(
        message,
      ),
    asksScreeningGuidance:
      /\b(mammogram|mri|ultrasound|screening schedule|screening (test|interval)|how often (should|do) i (get|have|screen)|need (a |an )?(mammogram|mri|ultrasound|screening))\b/.test(
        message,
      ) ||
      /\b(determine|decide|set).{0,40}(screening|mammogram|mri)\b/.test(message) ||
      /\b(based on (this|the) (number|result|score|estimate)).{0,40}(mammogram|mri|screening)\b/.test(
        message,
      ) ||
      /\b(mammogram|mri|screening).{0,40}(based on|from) (this|the) (number|result|score)\b/.test(
        message,
      ),
    asksCalculatorResultSource:
      /\b(personal information|based on my|my (own )?information|my (medical|clinical) (record|chart|data)|prototype inputs?|which (inputs?|data) (was|were) used|where (did|does) (this|the) (number|result|score) come from)\b/.test(
        message,
      ),
    asksNextStep:
      /\b(what (should|can|do) i do next|what i should do next|what to do next|do not know what to do next|next step)\b/.test(
        message,
      ),
    asksDraftHelp:
      /\b(do not|don't|dont) know what to write\b/.test(message) ||
      /\bhelp (me )?(draft|write)\b/.test(message) ||
      (/\bportal\b/.test(message) && /\b(write|draft|message)\b/.test(message)),
    asksDraftRevision:
      /\b(make it shorter|shorter|less formal|not too formal|remove the|revise|reword|edit)\b/.test(
        message,
      ) && /\b(draft|message|wording|appointment|family history)\b/.test(message),
    acceptsDraft:
      /\b(sounds? clear|looks good|can use this|no changes|will use that|i('ll| will) use|wording is clear|clear as written)\b/.test(
        message,
      ),
    rejectsDraft:
      /\b(do not|don't|dont) want to (send|use)\b/.test(message) ||
      /\breject .{0,20}(draft|message)\b/.test(message) ||
      /\bnot going to send\b/.test(message),
    commitsTiming:
      /\b(i('ll| will) send|send it)\b/.test(message) &&
      /\b(tonight|today|tomorrow|after work|this weekend)\b/.test(message),
    expressesEmotion: emotion,
    expressesBarrier: barrier,
    assertsUnderstanding: assertsUnderstandingUtterance(message),
    greeting: /^(hi|hello|hey)\b/.test(message),
    closing: isClosingUtterance(message),
    safetyTrigger: (() => {
      // Asking a clinician about diagnosis/tests — or requesting sample questions
      // for that conversation — is preparation, not an avatar diagnosis request.
      const clinicianDirectedDiagnosisTalk =
        /\b(ask|asking|tell|talk(?:ing)? (to|with)|speak(?:ing)? (to|with)|discuss(?:ing)?(?: with)?)\b.{0,80}\b(doctor|clinician|physician|provider|healthcare professional|health[- ]?care professional)\b/.test(
          message,
        ) ||
        /\b(doctor|clinician|physician|provider|healthcare professional|health[- ]?care professional).{0,80}\b(ask|what test|tests?( are| is)? needed|for diagnosis)\b/.test(
          message,
        ) ||
        (/\bquestions?\b/.test(message) &&
          /\b(doctor|clinician|physician|provider|healthcare professional|health[- ]?care professional)\b/.test(
            message,
          ) &&
          /\b(diagnos|test)\b/.test(message)) ||
        (/\b(which|what).{0,40}\b(diagnos\w*|tests?)\b/.test(message) &&
          /\b(doctor|clinician|physician|provider|with doctor|with (a |the )?clinician)\b/.test(
            message,
          )) ||
        /\b(diagnos\w*|tests?).{0,50}\b(with|for|ask).{0,20}\b(doctor|clinician|physician|provider)\b/.test(
          message,
        );
      if (clinicianDirectedDiagnosisTalk) return false;
      const treatmentOrCareRequest =
        /\b(prescribe|medication|treatment plan|what treatment|chemotherapy|radiation|treat(ment|ing) (for )?(breast )?cancer)\b/.test(
          message,
        );
      return (
        treatmentOrCareRequest ||
        /\b(do i have cancer|am i diagnosed)\b/.test(message) ||
        (/\b(diagnose|diagnosis)\b/.test(message) &&
          !/\bnot a diagnosis\b/.test(message) &&
          !/\b(eventual diagnosis|know .{0,20}diagnosis)\b/.test(message) &&
          !/\b(elevated|high).{0,40}(mean|means|diagnos)\b/.test(message) &&
          !assertsRiskMeansDiagnosis)
      );
    })(),
    wantsBrief: /\b(two short sentences|keep .{0,20}short|brief|in two sentences)\b/.test(message),
    wantsDetailed:
      /\b(in detail|indetail|more detail|detailed|elaborate|explain each|with (more )?explanation|go deeper)\b/.test(
        message,
      ),
    wantsInformal: /\b(less formal|not too formal|conversational|casual)\b/.test(message),
    wantsSingleStep: /\b(one simple|do not give me a list|don'?t give me a list|single step)\b/.test(
      message,
    ),
    asksLifestyleFocus: (() => {
      // Direct motivation requests ("motivate me", "motivate me every day").
      if (asksMotivationSupport(rawMessage) || asksMotivationSupport(message)) {
        return true;
      }
      const lifestyleCue =
        /\b(exercise|physical activity|workout|fitness|life[- ]?style|diet|nutrition|healthy (habits|living)|wellness|prevention|modifiable|lower (my )?risk|stay healthy|be healthy|take care of (my )?health|initial care|self[- ]?care|what can i do|motivational guide|stay active|keep active|maintain .{0,40}(activity|exercise|fitness))\b/.test(
          message,
        );
      if (!lifestyleCue) return false;
      // Medication/treatment protocols stay on the safety path.
      if (/\b(medication|chemotherapy|radiation|treatment plan|prescribe)\b/.test(message)) {
        return false;
      }
      return (
        /\?/.test(rawMessage) ||
        /^(should|can|what|how|does|is|would|will|provide|i want|i need)\b/.test(message) ||
        /\b(focus|help|affect|relate|matter|important|reduce|lower|information|motivate|maintain|guide)\b/.test(
          message,
        ) ||
        /\b(exercise|physical activity|life[- ]?style|diet|fitness).{0,40}(risk|health|cancer)\b/.test(
          message,
        ) ||
        /\b(initial care|self[- ]?care|take care).{0,40}(breast cancer|health|risk)\b/.test(message) ||
        /\b(motivational guide|maintain .{0,40}(activity|exercise)|keep .{0,20}(active|activity))\b/.test(
          message,
        )
      );
    })(),
    asksPreparationInfo: (() => {
      const professionalRef =
        /\b(doctor|clinician|physician|provider|healthcare professional|health[- ]?care professional|clinic|appointment|visit)\b/.test(
          message,
        );
      if (!professionalRef) return false;
      // Category: prep steps / first actions before professional contact (not exact phrases).
      const prepIntent =
        /\b(prepar(e|ing|ation)|what (to|should i) (bring|ask|prepare|write down)|ready for (a |my )?(visit|appointment|consultation)|do first|first step|before (i )?(go(?:ing)?|see|talk|meet|speak|discuss))\b/.test(
          message,
        ) ||
        /\bbefore\b.{0,100}\b(healthcare professional|health[- ]?care professional|doctor|clinician|physician|provider)\b/.test(
          message,
        ) ||
        /\b(what|should).{0,50}(do first|prepare|bring|ask).{0,80}\b(healthcare professional|health[- ]?care professional|doctor|clinician)\b/.test(
          message,
        ) ||
        /\b(healthcare professional|health[- ]?care professional|doctor|clinician).{0,80}\b(what|should).{0,40}(do first|prepare)\b/.test(
          message,
        ) ||
        // Category: user wants to ask a clinician about diagnosis/tests (not ask the avatar to diagnose).
        /\b(want to ask|ask(?:ing)?)\b.{0,60}\b(doctor|clinician|physician|provider|healthcare professional)\b.{0,60}\b(diagnos|test)\b/.test(
          message,
        ) ||
        /\b(doctor|clinician|physician|provider|healthcare professional).{0,60}\b(what test|tests?( are| is)? needed|for diagnosis)\b/.test(
          message,
        ) ||
        (/\bquestions?\b/.test(message) &&
          /\b(diagnos|test)\b/.test(message) &&
          /\b(doctor|clinician|physician|provider)\b/.test(message)) ||
        /\b(which|what).{0,40}\b(diagnos\w*|tests?).{0,40}\b(with|for).{0,20}\b(doctor|clinician)\b/.test(
          message,
        );
      // Avoid lifestyle/exercise questions that merely mention a professional.
      if (
        /\b(exercise|physical activity|lifestyle|diet|nutrition)\b/.test(message) &&
        !/\b(prepar|before|do first|first step)\b/.test(message)
      ) {
        return false;
      }
      return prepIntent;
    })(),
    asksClinicianQuestions:
      // Want/need questions to ask a doctor/clinician — not "help me draft a message".
      !/\b(draft|portal message|write (a |the )?message|wording)\b/.test(message) &&
      ((/\b(questions?|what to ask|tips)\b/.test(message) &&
        /\b(ask|doctor|clinician|physician|provider|healthcare professional|call|appointment|visit)\b/.test(
          message,
        )) ||
        /\b(would like|want|need|give me|some|a few|list).{0,40}\bquestions?\b/.test(message) ||
        /\bquestions?\s+(i (need|should|can|could)|to) ask\b/.test(message) ||
        /\b(question|questions) i need to ask\b/.test(message)),
  };
}

type BuildTurnPartial = {
  topic: SemanticTopic;
  primaryOperation: SemanticOperation;
  secondaryOperations?: SemanticOperation[];
  stance: SemanticStance;
  explicitRequest: string;
  requestedFormat?: string;
  propositions?: SemanticProposition[];
  claims?: string[];
  userConstraints?: string[];
  constraints?: string[];
  entities: SemanticTurn['entities'];
  understanding: SemanticUnderstanding;
  misunderstanding?: SemanticMisunderstanding;
  emotion: SemanticEmotion;
  barrier: SemanticBarrier;
  evidenceUnderstanding?: string;
  evidenceMisunderstanding?: string;
  evidenceEmotion?: string;
  evidenceBarrier?: string;
  requiresMedicalEvidence: boolean;
  requiresCalculatorMetadata: boolean;
  requiresCalculation?: boolean;
  requiresDeterministicCalculation?: boolean;
  requiresSafetyBoundary: boolean;
  requiresConversationContext?: boolean;
  requiresClarification: boolean;
  directAnswerRequired?: boolean;
  confidence: number;
};

function buildTurn(partial: BuildTurnPartial): SemanticTurn {
  const secondaryOperations = partial.secondaryOperations ?? [];
  const propositions =
    partial.propositions ??
    (partial.claims ?? []).map((text) => ({ text, status: 'question' as const }));
  const claims = partial.claims ?? propositions.map((p) => p.text);
  const userClaims = claims;
  const userQuestions = propositions
    .filter((p) => p.status === 'question')
    .map((p) => p.text)
    .concat(
      partial.stance === 'asking' && partial.explicitRequest ? [partial.explicitRequest] : [],
    )
    .filter((text, index, arr) => Boolean(text) && arr.indexOf(text) === index);
  const constraints = partial.constraints ?? partial.userConstraints ?? [];
  const userConstraints = constraints;
  const requiresCalculation =
    partial.requiresCalculation ?? partial.requiresDeterministicCalculation ?? false;
  const requiresClarification = partial.requiresClarification;
  const directAnswerRequired = partial.directAnswerRequired ?? !requiresClarification;
  const requiresConversationContext =
    partial.requiresConversationContext ??
    (partial.barrier !== 'not_expressed' ||
      partial.primaryOperation === 'draft' ||
      partial.primaryOperation === 'revise' ||
      partial.primaryOperation === 'review' ||
      partial.primaryOperation === 'confirm' ||
      partial.primaryOperation === 'defer' ||
      partial.primaryOperation === 'address_barrier' ||
      partial.topic === 'message_drafting' ||
      partial.topic === 'action_planning' ||
      partial.topic === 'emotion' ||
      partial.stance === 'asserting');

  const evidence: SemanticTurnEvidence = {
    topic: partial.topic,
    operation: partial.primaryOperation,
    stance: partial.stance,
    understanding: partial.evidenceUnderstanding ?? 'not expressed',
    misunderstanding:
      partial.evidenceMisunderstanding ??
      (partial.misunderstanding &&
      partial.misunderstanding !== 'none' &&
      partial.misunderstanding !== 'not_expressed'
        ? partial.misunderstanding
        : 'not expressed'),
    emotion: partial.evidenceEmotion ?? 'not expressed',
    barrier: partial.evidenceBarrier ?? 'not expressed',
  };

  const requestedFormat = partial.requestedFormat;

  return {
    topic: partial.topic,
    primaryOperation: partial.primaryOperation,
    secondaryOperations,
    stance: partial.stance,
    explicitRequest: partial.explicitRequest,
    requestedFormat,
    requestedOutputFormat: requestedFormat,
    claims,
    userClaims,
    userQuestions,
    constraints,
    propositions,
    userConstraints,
    entities: partial.entities,
    understanding: partial.understanding,
    misunderstanding: partial.misunderstanding,
    emotion: partial.emotion,
    barrier: partial.barrier,
    evidence,
    currentTurnEvidence: {
      ...evidence,
      stance: partial.stance,
      explicitRequest: partial.explicitRequest,
    },
    directAnswerRequired,
    requiresCalculatorMetadata: partial.requiresCalculatorMetadata,
    requiresCalculation,
    requiresDeterministicCalculation: requiresCalculation,
    requiresMedicalEvidence: partial.requiresMedicalEvidence,
    requiresSafetyBoundary: partial.requiresSafetyBoundary,
    requiresConversationContext,
    requiresClarification,
    confidence: partial.confidence,
    classificationMode: 'local-semantic-fallback',
  };
}

/**
 * Local schema-driven semantic interpretation using reusable features.
 * Prefer Groq structured output when available; this is the grounded fallback.
 */
export function interpretSemanticTurnLocal(input: InterpretSemanticTurnInput): SemanticTurn {
  const raw = input.latestMessage.trim();
  const message = normalize(raw);
  const features = detectSemanticFeatures(raw);
  const riskValue = extractRiskValue(message, input.riskResult);
  const denominator = extractDenominator(message) ?? 100;
  const fiveYear = input.riskResult?.fiveYearRisk ?? riskValue ?? 3.2;
  const horizon = input.riskResult?.riskHorizon ?? '5 years';
  const draftPending =
    input.previousDraftPending ||
    input.pendingItem?.type === 'proposed_draft' ||
    Boolean(input.pendingItem?.draftText);

  const baseEntities = {
    riskValue: riskValue ?? fiveYear,
    denominator,
    timeHorizon: /\blifetime\b/.test(message)
      ? 'lifetime'
      : /\bfive[- ]?year|5[- ]?year\b/.test(message)
        ? 'five-year'
        : horizon,
    calculatorName: input.riskResult?.model,
    timing: extractTiming(message),
    draftText: input.pendingItem?.draftText,
  };

  // Clinician-directed "diagnosis/test" questions are preparation, not avatar diagnosis.
  // Lifestyle / fitness / initial healthy-step asks stay off the treatment safety path.
  if (
    features.safetyTrigger &&
    !features.elevatedMeansDiagnosis &&
    !features.asksClinicianQuestions &&
    !features.asksPreparationInfo &&
    !features.asksLifestyleFocus
  ) {
    return buildTurn({
      topic: 'safety',
      primaryOperation: 'set_boundary',
      stance: 'asking',
      explicitRequest: 'Set a safety boundary for diagnosis or treatment requests.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: true,
      requiresClarification: false,
      confidence: 0.95,
    });
  }

  if (features.asksScreeningGuidance) {
    return buildTurn({
      topic: 'screening_guidance',
      primaryOperation: 'set_boundary',
      stance: 'asking',
      explicitRequest:
        'Answer the screening question with an individualized-advice boundary; do not give a personal screening recommendation.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      // Router marks safetyBoundaryRequired; keep false here so deriveResponsePlan
      // can use the screening-specific route plan instead of generic safety.
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.93,
    });
  }

  // Sample questions for a clinician — must not become a portal/message draft.
  if (features.asksClinicianQuestions) {
    const detailed = features.wantsDetailed;
    return buildTurn({
      topic: 'professional_interpretation',
      primaryOperation: 'list_information',
      secondaryOperations: ['provide_preparation_information', 'set_personalized_advice_boundary'],
      stance: 'asking',
      explicitRequest: detailed
        ? 'Provide a detailed list of general questions the user could ask a healthcare professional about a demonstration risk estimate. For each question, add one short sentence explaining why it can be useful. Do not draft a portal message unless they explicitly ask for a draft. Keep wording dynamic and avoid assuming portal access or an existing appointment.'
        : 'List a few general questions the user could ask a healthcare professional about a demonstration risk estimate. Do not draft a portal message unless they explicitly ask for a draft. Keep wording dynamic and avoid assuming portal access or an existing appointment.',
      requestedFormat: detailed ? 'detailed list with brief explanations' : 'short list',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [
        'questions for clinician',
        'not a message draft',
        ...(detailed ? ['detailed explanations for each question'] : []),
      ],
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.92,
      directAnswerRequired: true,
    });
  }

  // User named a concrete activity after a lifestyle-motivation ask (or as a preference).
  if (
    isLifestyleActivityChoiceTurn(raw, input.previousAssistantReply) ||
    isLifestyleActivityChoiceTurn(message, input.previousAssistantReply)
  ) {
    const activity = extractChosenActivityLabel(raw);
    return buildTurn({
      topic: 'lifestyle_risk_information',
      primaryOperation: 'answer_general_health_question',
      secondaryOperations: [
        'explain_lifestyle_relationship',
        'set_personalized_advice_boundary',
        'clarify_preference',
      ],
      stance: 'accepting',
      explicitRequest: `Reinforce the user's chosen activity (${activity}) with population-level physical-activity benefits and autonomy-supportive maintenance encouragement, without prescribing a training plan.`,
      propositions: [{ text: raw, status: 'preference' }],
      entities: baseEntities,
      userConstraints: [`chosen activity: ${activity}`],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      directAnswerRequired: true,
      confidence: 0.92,
    });
  }

  // Preparation-before-professional outranks generic next-step / lifestyle when both appear.
  if (features.asksPreparationInfo) {
    return buildTurn({
      topic: 'professional_interpretation',
      primaryOperation: 'provide_preparation_information',
      secondaryOperations: ['set_personalized_advice_boundary'],
      stance: 'asking',
      explicitRequest:
        'Provide general preparation information before talking with a healthcare professional, without assuming portal access or an existing appointment.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      directAnswerRequired: true,
      confidence: 0.9,
    });
  }

  if (features.asksLifestyleFocus) {
    const motivationAsk = asksMotivationSupport(raw) || asksMotivationSupport(message);
    return buildTurn({
      topic: 'lifestyle_risk_information',
      primaryOperation: 'answer_general_health_question',
      secondaryOperations: ['explain_lifestyle_relationship', 'set_personalized_advice_boundary'],
      stance: 'asking',
      explicitRequest: motivationAsk
        ? 'Provide educational motivational support for healthy habits and physical activity using population-level benefits, without promising daily coaching or a personalized treatment plan.'
        : 'Answer the general lifestyle/exercise/health question with population-level information and a personalized-advice boundary.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: motivationAsk ? ['motivation support requested'] : [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      directAnswerRequired: true,
      confidence: 0.9,
    });
  }

  if (features.closing || isGratitudeUtterance(raw) || isGratitudeUtterance(message)) {
    return buildTurn({
      topic: 'closing',
      primaryOperation: 'close',
      stance: 'completed',
      explicitRequest: isGratitudeUtterance(raw) || isGratitudeUtterance(message)
        ? 'Acknowledge the user thanks briefly and close supportively without restarting the menu.'
        : 'Close the conversation supportively.',
      propositions: [{ text: raw, status: 'preference' }],
      entities: baseEntities,
      userConstraints: isGratitudeUtterance(raw) || isGratitudeUtterance(message) ? ['gratitude'] : [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      directAnswerRequired: true,
      confidence: 0.95,
    });
  }

  if (features.greeting) {
    return buildTurn({
      topic: 'greeting',
      primaryOperation: 'explain',
      stance: 'neutral',
      explicitRequest: 'Greet the user and invite a topic.',
      propositions: [],
      entities: {},
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.95,
    });
  }

  if (features.averageMeansZero) {
    return buildTurn({
      topic: 'risk_level',
      primaryOperation: 'correct_misunderstanding',
      stance: 'correcting',
      explicitRequest:
        'Correct the misunderstanding that an average or low risk estimate means zero risk.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'incorrect',
      misunderstanding: 'average_means_zero_risk',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: 'average or low risk treated as zero risk',
      evidenceMisunderstanding: snippet(
        message,
        /\b(average|normal|low|zero|no risk|safe|fine)\b/,
        'average_means_zero_risk',
      ),
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.elevatedMeansDiagnosis) {
    return buildTurn({
      topic: 'risk_level',
      primaryOperation: 'correct_misunderstanding',
      stance: 'correcting',
      explicitRequest:
        'Correct the misunderstanding that an elevated risk estimate means a current cancer diagnosis.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'incorrect',
      misunderstanding: 'elevated_means_diagnosis',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: 'elevated risk treated as diagnosis',
      evidenceMisunderstanding: snippet(
        message,
        /\b(elevated|high|cancer|diagnos|i have)\b/,
        'elevated_means_diagnosis',
      ),
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.assertsRiskMeansDiagnosis) {
    return buildTurn({
      topic: 'risk_meaning',
      primaryOperation: 'correct_misunderstanding',
      stance: 'correcting',
      explicitRequest:
        'Correct the misunderstanding that a risk estimate is the same as a current diagnosis.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'incorrect',
      misunderstanding: 'risk_means_diagnosis',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: 'estimate treated as diagnosis',
      evidenceMisunderstanding: snippet(
        message,
        /\b(diagnos|mean i have|have cancer)\b/,
        'risk_means_diagnosis',
      ),
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.asksConcernCalibration) {
    return buildTurn({
      topic: 'risk_level',
      primaryOperation: 'explain',
      stance: 'asking',
      explicitRequest:
        'Answer how concerned to be by calibrating the demonstration risk level without giving personalized medical advice.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      evidenceEmotion:
        features.expressesEmotion !== 'not_expressed'
          ? snippet(message, /\b(worried|anxious|concerned|afraid)\b/, features.expressesEmotion)
          : 'not expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.88,
    });
  }

  if (features.asksElevatedMeaning) {
    return buildTurn({
      topic: 'risk_level',
      primaryOperation: 'explain',
      stance: 'asking',
      explicitRequest:
        'Explain what an elevated risk label means relative to the comparison/average level, without treating it as a diagnosis.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.teachesBackFrequency) {
    return buildTurn({
      topic: 'risk_representation',
      primaryOperation: 'verify_understanding',
      stance: 'asserting',
      explicitRequest:
        'Verify that the user correctly restated the risk as a natural frequency and acknowledge understanding.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: {
        ...baseEntities,
        riskValue: fiveYear,
        denominator: extractDenominator(message) ?? 100,
        timeHorizon: /\bfive|5/.test(message) ? 'five-year' : horizon,
      },
      userConstraints: [],
      understanding: 'correct',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: snippet(
        message,
        /\babout\s+\d+\s*(people|persons)?\s*out of\s*\d+/,
        'natural frequency restatement',
      ),
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.wantsConversion) {
    const denom = extractDenominator(message) ?? 100;
    const constraints = ['avoid percentage language', `use people out of ${denom}`, 'natural frequency'];
    if (features.wantsBrief) constraints.push('keep answer brief');
    return buildTurn({
      topic: 'risk_representation',
      primaryOperation: 'convert',
      secondaryOperations: features.wantsBrief ? ['summarize'] : [],
      stance: 'asking',
      explicitRequest: `Convert the ${fiveYear}% ${horizon} risk estimate into an approximate number of people out of ${denom} without relying on percentage language.`,
      requestedFormat: 'natural frequency',
      propositions: [{ text: raw, status: 'question' }],
      entities: { ...baseEntities, riskValue: fiveYear, denominator: denom, timeHorizon: horizon },
      userConstraints: constraints,
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      evidenceEmotion:
        features.expressesEmotion !== 'not_expressed'
          ? snippet(message, /\b(worried|anxious|scared|afraid|confused)\b/, features.expressesEmotion)
          : 'not expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: true,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.92,
    });
  }

  if (features.assertsIndividualPrediction) {
    return buildTurn({
      topic: 'risk_meaning',
      primaryOperation: 'correct_misunderstanding',
      stance: 'correcting',
      explicitRequest:
        'Correct the misunderstanding that a population risk estimate predicts an individual outcome.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'incorrect',
      misunderstanding: 'risk_means_certainty',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: snippet(
        message,
        /\b(knows? what will happen|predict|foresee|telling my future|personal outcome|certain about what will happen|like a prediction)\b/,
        'individual prediction claim',
      ),
      evidenceMisunderstanding: 'risk_means_certainty',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  // Latest practical barrier outranks a resolved understanding assertion.
  // Do not reopen risk explanation when understanding is already asserted.
  if (features.expressesBarrier !== 'not_expressed' && features.assertsUnderstanding) {
    const barrier = features.expressesBarrier;
    const callingTime =
      barrier === 'time' &&
      /\b(call|calling|phone)\b/.test(message);
    const barrierEvidence = snippet(
      message,
      /\b((difficult|hard) to call|cannot call|can'?t call|cannot make calls|calling.{0,40}(work|business|day|schedule)|phone calls?|during work|business hours|work schedule|at work|while .{0,12}working)\b/,
      callingTime ? 'difficult to call during work' : barrier,
    );
    return buildTurn({
      topic: callingTime || barrier === 'time' ? 'communication_support' : 'action_planning',
      primaryOperation: 'address_barrier',
      secondaryOperations: [],
      stance: 'uncertain',
      explicitRequest: callingTime
        ? 'Address the difficulty of calling during work without reopening the risk explanation.'
        : `Address the expressed ${barrier} barrier without reopening the risk explanation.`,
      propositions: [
        { text: 'user understands the prior risk explanation', status: 'user_claim' },
        {
          text: barrierEvidence,
          status: 'constraint',
        },
      ],
      entities: baseEntities,
      userConstraints: callingTime ? ['calling during work is difficult'] : [],
      understanding: 'correct',
      emotion: 'not_expressed',
      barrier,
      evidenceUnderstanding: snippet(
        message,
        /\b(i understand|makes sense|i get (it|the)|got it|understand the)\b/,
        'understanding asserted',
      ),
      evidenceBarrier: barrierEvidence,
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.92,
    });
  }

  if (features.assertsUnderstanding && features.asksNextStep) {
    const emotion = features.expressesEmotion;
    return buildTurn({
      topic: 'professional_interpretation',
      primaryOperation: 'provide_options',
      secondaryOperations: emotion !== 'not_expressed' ? (['elaborate'] as SemanticOperation[]) : [],
      stance: emotion !== 'not_expressed' ? 'uncertain' : 'asking',
      explicitRequest:
        emotion !== 'not_expressed'
          ? 'Briefly acknowledge concern and provide neutral general next-step options.'
          : 'Provide neutral general next-step options for discussing the demonstration result.',
      propositions: [
        { text: 'user understands prior explanation', status: 'user_claim' },
        { text: 'asks what to do next', status: 'question' },
      ],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'correct',
      emotion,
      barrier: 'not_expressed',
      evidenceUnderstanding: snippet(message, /\bi understand|that makes sense/, 'understanding asserted'),
      evidenceEmotion:
        emotion !== 'not_expressed'
          ? snippet(message, /\b(worried|anxious|scared|afraid|concerned)\b/, emotion)
          : 'not expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.88,
    });
  }

  if (features.assertsUnderstanding && features.expressesEmotion !== 'not_expressed' && !features.asksNextStep) {
    return buildTurn({
      topic: 'emotion',
      primaryOperation: 'elaborate',
      stance: 'uncertain',
      explicitRequest:
        'Acknowledge the emotion currently expressed after the user confirmed understanding.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'correct',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      evidenceUnderstanding: 'understanding asserted',
      evidenceEmotion: snippet(
        message,
        /\b(worried|anxious|scared|afraid|concerned|still feel)\b/,
        features.expressesEmotion,
      ),
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.85,
    });
  }

  if (features.assertsUnderstanding) {
    return buildTurn({
      topic: 'risk_meaning',
      primaryOperation: 'verify_understanding',
      stance: 'asserting',
      explicitRequest: 'Acknowledge that the previous risk explanation was understood.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'correct',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      evidenceUnderstanding: snippet(message, /\b(makes sense|understand|clearer|got it)\b/, 'understanding'),
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.asksCalculatorResultSource) {
    return buildTurn({
      topic: 'calculator_validation',
      primaryOperation: 'answer_factual_question',
      stance: 'asking',
      explicitRequest:
        'Answer whether the demonstration estimate is based on personal clinical information.',
      propositions: [{ text: raw, status: 'question' }],
      entities: { ...baseEntities, referencedObject: 'calculator result source' },
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: true,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.asksTimeHorizonCompare) {
    return buildTurn({
      topic: 'time_horizon',
      primaryOperation: 'compare',
      secondaryOperations: features.wantsBrief ? ['summarize'] : [],
      stance: 'asking',
      explicitRequest: features.wantsBrief
        ? 'Compare five-year risk with lifetime risk in two short sentences.'
        : 'Compare the meaning of five-year risk with lifetime risk.',
      requestedFormat: features.wantsBrief ? 'two short sentences' : undefined,
      propositions: [{ text: raw, status: 'question' }],
      entities: {
        ...baseEntities,
        timeHorizon: 'five-year and lifetime',
      },
      userConstraints: features.wantsBrief ? ['two short sentences'] : [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.91,
    });
  }

  if (features.asksInputs) {
    const alsoLimits = features.asksLimitation;
    return buildTurn({
      topic: 'calculator_inputs',
      primaryOperation: 'list_information',
      secondaryOperations: alsoLimits ? ['identify_limitation'] : [],
      stance: 'asking',
      explicitRequest: alsoLimits
        ? 'Explain the input information used by the calculator and identify important factors it might not include.'
        : 'Explain the input information used by the calculator.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: true,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.asksLimitation || features.asksCertainty) {
    return buildTurn({
      topic: 'calculator_limitations',
      primaryOperation: 'identify_limitation',
      stance: 'asking',
      explicitRequest:
        'Explain why a population-level probability cannot predict an individual outcome with certainty.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (features.asksRiskLevel) {
    return buildTurn({
      topic: 'risk_level',
      primaryOperation: 'answer_factual_question',
      stance: 'asking',
      explicitRequest: 'Explain what the demonstration risk level means without overstating certainty.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.86,
    });
  }

  if (features.asksDraftHelp && !features.asksDraftRevision && !draftPending) {
    const secondary: SemanticOperation[] = [];
    if (/\bshort\b/.test(message)) secondary.push('summarize');
    if (features.wantsInformal) secondary.push('revise');
    const constraints: string[] = ['editable draft'];
    if (/\bshort\b/.test(message)) constraints.push('short length');
    if (features.wantsInformal) constraints.push('less formal tone');
    return buildTurn({
      topic: 'message_drafting',
      primaryOperation: 'draft',
      secondaryOperations: uniqueOps(secondary),
      stance: 'asking',
      explicitRequest:
        'Create a short editable portal-message draft the user can adapt.',
      propositions: [{ text: raw, status: 'preference' }],
      entities: { ...baseEntities, selectedOption: 'written clinic message' },
      userConstraints: constraints,
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.9,
    });
  }

  if (features.asksDraftRevision || (features.asksDraftHelp && draftPending)) {
    const constraints: string[] = [];
    if (/\bshort(er)?\b/.test(message)) constraints.push('shorter length');
    if (features.wantsInformal) constraints.push('less formal tone');
    if (/\bremove .{0,20}appointment\b/.test(message)) constraints.push('remove appointment sentence');
    if (/\bfamily history\b/.test(message)) constraints.push('keep family-history question');
    return buildTurn({
      topic: 'message_drafting',
      primaryOperation: 'revise',
      secondaryOperations: constraints.length > 1 ? ['summarize'] : [],
      stance: 'asking',
      explicitRequest:
        constraints.length > 0
          ? `Revise the draft according to: ${constraints.join('; ')}.`
          : 'Revise the current portal-message draft.',
      propositions: [{ text: raw, status: 'constraint' }],
      entities: {
        ...baseEntities,
        draftText: input.pendingItem?.draftText,
        selectedOption: 'written clinic message',
      },
      userConstraints: constraints,
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.9,
    });
  }

  if (features.acceptsDraft && draftPending) {
    return buildTurn({
      topic: 'message_drafting',
      primaryOperation: 'confirm',
      stance: 'accepting',
      explicitRequest: 'Acknowledge that the proposed draft was accepted and advance to timing or closure.',
      propositions: [{ text: raw, status: 'preference' }],
      entities: { ...baseEntities, selectedOption: 'written clinic message' },
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.93,
    });
  }

  if (features.rejectsDraft && draftPending) {
    return buildTurn({
      topic: 'message_drafting',
      primaryOperation: 'reject',
      stance: 'rejecting',
      explicitRequest: 'Acknowledge draft rejection without pressure and leave next steps open.',
      propositions: [{ text: raw, status: 'preference' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.9,
    });
  }

  if (features.commitsTiming) {
    return buildTurn({
      topic: 'action_planning',
      primaryOperation: 'confirm',
      stance: 'planning',
      explicitRequest: 'Acknowledge the specific planned timing for sending the message.',
      propositions: [{ text: raw, status: 'commitment' }],
      entities: { ...baseEntities, timing: extractTiming(message) },
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: 'not_expressed',
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.9,
    });
  }

  if (features.expressesBarrier === 'delay' || features.wantsSingleStep) {
    return buildTurn({
      topic: 'action_planning',
      primaryOperation: 'plan',
      stance: 'planning',
      explicitRequest: features.wantsSingleStep
        ? 'Give one simple place to start without providing a multi-item list.'
        : 'Help address the expressed delay barrier with one manageable step.',
      requestedFormat: features.wantsSingleStep ? 'one simple step' : undefined,
      propositions: [{ text: raw, status: 'preference' }],
      entities: baseEntities,
      userConstraints: features.wantsSingleStep ? ['one simple step', 'no multi-item list'] : [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier: features.expressesBarrier === 'not_expressed' ? 'delay' : features.expressesBarrier,
      evidenceBarrier: snippet(message, /\b(put(ting)? it off|keep(s)? putting|one simple)\b/, 'delay'),
      requiresMedicalEvidence: false,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.88,
    });
  }

  if (features.expressesBarrier !== 'not_expressed') {
    const barrier = features.expressesBarrier;
    const callingTime =
      barrier === 'time' && /\b(call|calling|phone)\b/.test(message);
    const whoToContact = barrier === 'access' && asksWhoToContact(message);
    const barrierEvidence = snippet(
      message,
      /\b((difficult|hard) to call|cannot call|can'?t call|during work|business hours|work schedule|at work|who to contact|which doctor|what (kind|type) of doctor|cost|expensive|do not trust|uncertain|calling.{0,20}hard|phone calls?)\b/,
      callingTime ? 'difficult to call during work' : whoToContact ? 'which clinician to contact' : barrier,
    );
    return buildTurn({
      topic: callingTime || barrier === 'time' ? 'communication_support' : 'action_planning',
      primaryOperation: 'address_barrier',
      stance: 'uncertain',
      explicitRequest: callingTime
        ? 'Address the difficulty of calling during work without reopening the risk explanation.'
        : whoToContact
          ? 'Explain which general type of clinician to contact about a demonstration risk estimate, without naming a specific doctor.'
          : `Acknowledge the ${barrier} barrier and offer a more manageable optional next step.`,
      propositions: [{ text: raw, status: whoToContact ? 'question' : 'constraint' }],
      entities: baseEntities,
      userConstraints: callingTime
        ? ['calling during work is difficult']
        : whoToContact
          ? ['do not name a specific doctor']
          : [],
      understanding: 'not_assessable',
      emotion: 'not_expressed',
      barrier,
      evidenceBarrier: barrierEvidence,
      requiresMedicalEvidence: barrier === 'access',
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      directAnswerRequired: whoToContact,
      confidence: 0.88,
    });
  }

  if (features.asksNextStep) {
    const emotion = features.expressesEmotion;
    return buildTurn({
      topic: 'professional_interpretation',
      primaryOperation: 'provide_options',
      secondaryOperations: emotion !== 'not_expressed' ? ['elaborate'] : [],
      stance: 'asking',
      explicitRequest:
        emotion !== 'not_expressed'
          ? 'Briefly acknowledge concern and provide neutral general next-step options.'
          : 'Provide neutral general next-step options for discussing the demonstration result.',
      propositions: [{ text: raw, status: 'question' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion,
      barrier: 'not_expressed',
      evidenceEmotion:
        emotion !== 'not_expressed'
          ? snippet(message, /\b(worried|anxious|scared|afraid|concerned)\b/, emotion)
          : 'not expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.88,
    });
  }

  if (features.asksSimpleLanguage) {
    return buildTurn({
      topic: 'risk_meaning',
      primaryOperation: 'simplify',
      secondaryOperations: features.expressesEmotion !== 'not_expressed' ? ['elaborate'] : [],
      stance: 'asking',
      explicitRequest: `Explain the ${fiveYear}% five-year demonstration risk estimate in plain, nontechnical language.`,
      requestedFormat: 'simple language',
      propositions: [{ text: raw, status: 'question' }],
      entities: { ...baseEntities, riskValue: fiveYear, timeHorizon: horizon },
      userConstraints: ['simple language', 'plain nontechnical language'],
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.9,
    });
  }

  if (
    features.asksRiskMeaning ||
    features.wantsElaborate ||
    (features.expressesEmotion !== 'not_expressed' && features.asksQuestion)
  ) {
    const emotion = features.expressesEmotion;
    const primaryOperation: SemanticOperation = features.wantsElaborate ? 'elaborate' : 'explain';
    return buildTurn({
      topic: 'risk_meaning',
      primaryOperation,
      secondaryOperations: emotion !== 'not_expressed' ? ['elaborate'] : [],
      stance: 'asking',
      explicitRequest:
        emotion !== 'not_expressed'
          ? `Explain what the ${fiveYear}% ${horizon} demonstration risk estimate means, with brief acknowledgment of concern.`
          : `Explain what the ${fiveYear}% ${horizon} demonstration risk estimate means in probabilistic terms.`,
      propositions: [{ text: raw, status: 'question' }],
      entities: { ...baseEntities, riskValue: fiveYear, timeHorizon: horizon },
      userConstraints: [],
      understanding: 'not_assessable',
      emotion,
      barrier: 'not_expressed',
      evidenceEmotion:
        emotion !== 'not_expressed'
          ? snippet(message, /\b(worried|anxious|scared|afraid|concerned)\b/, emotion)
          : 'not expressed',
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      confidence: 0.85,
    });
  }

  if (features.expressesEmotion !== 'not_expressed' && !features.asksQuestion) {
    return buildTurn({
      topic: 'emotion',
      primaryOperation: 'elaborate',
      stance: 'uncertain',
      explicitRequest: 'Acknowledge the emotion currently expressed without replacing another request.',
      propositions: [{ text: raw, status: 'user_claim' }],
      entities: baseEntities,
      userConstraints: [],
      understanding: 'not_assessable',
      emotion: features.expressesEmotion,
      barrier: 'not_expressed',
      evidenceEmotion: snippet(
        message,
        /\b(worried|anxious|scared|afraid|overwhelmed|frustrated|confused)\b/,
        features.expressesEmotion,
      ),
      requiresMedicalEvidence: true,
      requiresCalculatorMetadata: false,
      requiresDeterministicCalculation: false,
      requiresSafetyBoundary: false,
      requiresClarification: false,
      requiresConversationContext: true,
      confidence: 0.8,
    });
  }

  return buildTurn({
    topic: 'unclear',
    primaryOperation: 'request_clarification',
    stance: 'uncertain',
    explicitRequest: 'Ask one clarifying question about what the user wants explained or done.',
    propositions: [{ text: raw, status: 'question' }],
    entities: baseEntities,
    userConstraints: [],
    understanding: 'not_assessable',
    emotion: 'not_expressed',
    barrier: 'not_expressed',
    requiresMedicalEvidence: false,
    requiresCalculatorMetadata: false,
    requiresDeterministicCalculation: false,
    requiresSafetyBoundary: false,
    requiresClarification: true,
    directAnswerRequired: false,
    confidence: 0.4,
  });
}

export function shouldSkipMedicalRagForSemantic(turn: SemanticTurn): boolean {
  if (turn.requiresSafetyBoundary) return false;
  if (turn.primaryOperation === 'confirm' || turn.primaryOperation === 'close') return true;
  if (turn.primaryOperation === 'defer' && turn.topic === 'message_drafting') return true;
  // Skip medical RAG only for schedule/calling barriers — cost/access still need retrieval.
  if (
    turn.primaryOperation === 'address_barrier' &&
    !turn.requiresMedicalEvidence &&
    turn.barrier === 'time'
  ) {
    return true;
  }
  if (turn.topic === 'greeting' || turn.topic === 'closing') return true;
  if (turn.topic === 'screening_guidance') return false;
  if (turn.topic === 'message_drafting' && !turn.requiresMedicalEvidence) return true;
  return false;
}

export function shouldUseSemanticFallback(turn: SemanticTurn): boolean {
  if (turn.confidence < 0.75) return false;
  if (turn.topic === 'unclear' || turn.requiresClarification) return false;
  if (turn.topic === 'emotion') return false;
  if (turn.primaryOperation === 'address_barrier') return true;
  if (turn.primaryOperation === 'set_boundary') return true;
  if (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'provide_preparation_information'
  ) {
    return true;
  }
  if (turn.topic === 'action_planning') {
    // Only the constrained single-step delay plan uses a composed fallback.
    return turn.userConstraints.includes('one simple step') || turn.constraints.includes('one simple step');
  }
  return true;
}
