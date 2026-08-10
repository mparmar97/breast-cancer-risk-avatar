/**
 * Plan-aware grounded fallbacks composed from ResponsePlan components.
 * Not one fixed sentence per example user message.
 */

import type { ConversationMemory } from '../dialogue/conversationMemory';
import type { ResponsePlan } from '../dialogue/deriveResponsePlan';
import {
  asksMotivationSupport,
  extractChosenActivityLabel,
  namesChosenActivity,
  previousAskedLifestyleActivityChoice,
} from '../dialogue/lifestyleActivitySignals';
import { asksWhoToContact } from '../dialogue/normalizeUserText';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { RetrievedEvidence } from '../rag/types';
import type { RiskResult } from '../types';
import { isGratitudeUtterance } from '../dialogue/closingSignals';
import {
  GRATITUDE_FALLBACK,
  understandingNextStepFallback,
  WHO_TO_CONTACT_FALLBACK,
} from './fallbackCopy';

export interface PlanAwareFallbackInput {
  semanticTurn: SemanticTurn;
  plan: ResponsePlan;
  riskResult: RiskResult;
  calculation?: NaturalFrequencyResult | null;
  conversationMemory?: ConversationMemory | null;
  recentAssistantMessages?: string[];
  retrievedEvidence?: RetrievedEvidence[];
  latestMessage?: string;
}

const LIFESTYLE_MOTIVATION_FALLBACK =
  'Regular physical activity is associated with lower breast cancer risk at a population level, and supporting overall health through habits such as movement, alongside discussing your demonstration estimate with a qualified healthcare professional, can be a constructive first step. This is general education—not a personalized exercise, diet, or treatment plan. What feels like a realistic healthy step you would like to consider?';

const LIFESTYLE_MAINTENANCE_COACH_FALLBACK =
  'I can support you as an educational motivational guide for keeping physical activity in your routine—not as a personal trainer or treatment planner. Regular activity is linked with lower breast cancer risk at a population level, and many people find it easier to maintain when they choose one small, repeatable step that fits their life. A qualified healthcare professional can tailor advice to you. What is one activity you already do—or would like to try—that you could keep this week?';

const MOTIVATION_SUPPORT_FALLBACK =
  'I can offer educational motivational support in this session—not daily coaching or a personalized training plan. Regular physical activity is linked with lower breast cancer risk at a population level, and many people stay motivated by picking one small step they can repeat. A qualified healthcare professional can tailor advice to you. What is one healthy habit or activity you want to focus on right now?';

function lifestyleUserText(turn: SemanticTurn): string {
  return [turn.explicitRequest, ...turn.propositions.map((p) => p.text), ...turn.userQuestions]
    .join(' ')
    .toLowerCase();
}

function lifestyleActivityReinforcementFallback(
  turn: SemanticTurn,
  latestMessage: string,
  evidence?: RetrievedEvidence[],
): string {
  const activity = extractChosenActivityLabel(latestMessage || lifestyleUserText(turn));
  const activityChunk = evidence?.find(
    (item) =>
      item.topic === 'physical_activity' ||
      item.id.includes('physical-activity') ||
      item.id.includes('prevention-exercise'),
  );
  const benefit = activityChunk
    ? activityChunk.text
    : 'Regular physical activity is associated with lower breast cancer risk at a population level.';
  return `${benefit} Choosing ${activity} is a practical way to keep movement in your routine—sticking with something you already like often makes maintenance easier. This is general educational encouragement, not a personalized training or treatment plan. What would help you keep ${activity} consistent this week?`;
}

function lifestyleMotivationFallback(
  turn: SemanticTurn,
  evidence?: RetrievedEvidence[],
  latestMessage?: string,
  recentAssistantMessages?: string[],
): string {
  const userText = `${latestMessage ?? ''} ${lifestyleUserText(turn)}`.toLowerCase();
  const priorAsk = previousAskedLifestyleActivityChoice(recentAssistantMessages?.[0]);
  if (
    namesChosenActivity(latestMessage || userText) &&
    (priorAsk ||
      /chosen activity:/i.test(turn.userConstraints.join(' ')) ||
      /reinforce the user's chosen activity/i.test(turn.explicitRequest))
  ) {
    return lifestyleActivityReinforcementFallback(turn, latestMessage || userText, evidence);
  }

  const wantsMotivationSupport =
    asksMotivationSupport(userText) || /motivation support requested/i.test(turn.userConstraints.join(' '));
  const wantsMaintenanceCoach =
    /\b(motivational guide|maintain|keep .{0,24}(active|activity|exercise)|stay active)\b/.test(
      userText,
    );

  const activityChunk = evidence?.find(
    (item) =>
      item.topic === 'physical_activity' ||
      item.id.includes('physical-activity') ||
      item.id.includes('prevention-exercise'),
  );
  const firstStepsChunk = evidence?.find(
    (item) => item.topic === 'health_first_steps' || item.id.includes('first-steps'),
  );

  if (wantsMotivationSupport) {
    const dailyAsk = /\b(every ?day|daily|each day)\b/.test(userText);
    if (activityChunk) {
      return `${activityChunk.text} I can offer educational motivational support while we talk here${dailyAsk ? '—I cannot send daily reminders outside this session' : ''}. Choosing one small, repeatable step often helps people stay motivated. This is not a personalized training or treatment plan. What is one healthy habit or activity you want to focus on right now?`;
    }
    return dailyAsk
      ? 'I can offer educational motivational support in this conversation, though I cannot send daily check-ins outside the session. Regular physical activity is linked with lower breast cancer risk at a population level, and many people stay motivated by picking one small step they can repeat. What is one healthy habit or activity you want to focus on right now?'
      : MOTIVATION_SUPPORT_FALLBACK;
  }

  if (wantsMaintenanceCoach) {
    if (activityChunk) {
      return `${activityChunk.text} I can stay with you as an educational motivational guide for maintaining activity—not a personalized exercise or treatment plan. Choosing one small step you can repeat often helps people stick with movement. What is one activity you could keep this week?`;
    }
    return LIFESTYLE_MAINTENANCE_COACH_FALLBACK;
  }
  if (activityChunk && firstStepsChunk) {
    return `${activityChunk.text} ${firstStepsChunk.text} What feels like a realistic healthy step you would like to consider?`;
  }
  if (activityChunk) {
    return `${activityChunk.text} Supporting overall health through activity you choose, and talking with a qualified healthcare professional about your demonstration estimate, can be constructive first steps—not a personalized treatment plan. What feels realistic for you?`;
  }
  return LIFESTYLE_MOTIVATION_FALLBACK;
}

function constraintsOf(turn: SemanticTurn): string[] {
  return turn.constraints.length > 0 ? turn.constraints : turn.userConstraints;
}

function barrierEvidenceOf(turn: SemanticTurn): string {
  return turn.evidence?.barrier ?? turn.currentTurnEvidence.barrier;
}

function factualComponent(turn: SemanticTurn, risk: RiskResult, calc?: NaturalFrequencyResult | null): string {
  const percent = calc?.originalRiskPercent ?? turn.entities.riskValue ?? risk.fiveYearRisk;
  const horizonRaw = calc?.timeHorizon ?? turn.entities.timeHorizon ?? risk.riskHorizon;
  const horizon = /five|5\s*year/i.test(String(horizonRaw)) ? 'five years' : String(horizonRaw);
  const frequency = calc?.approximationText ?? `about ${Math.round(percent)} out of 100`;
  const constraints = constraintsOf(turn);

  switch (turn.primaryOperation) {
    case 'convert':
      return `Over ${horizon}, ${frequency} people with similar calculator information may develop breast cancer.`;
    case 'verify_understanding':
      return understandingNextStepFallback(risk);
    case 'correct_misunderstanding':
      return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person and is not a diagnosis.`;
    case 'compare':
      if (turn.secondaryOperations.includes('summarize') || constraints.some((c) => /two short|brief/.test(c))) {
        return `Five-year risk looks at a nearer window, while lifetime risk covers a much longer span. Both are probabilities for groups with similar inputs, not individual predictions.`;
      }
      return `Five-year risk estimates the chance of developing breast cancer within about five years. Lifetime risk estimates that chance over a much longer remaining lifespan. The periods differ, so the numbers are not interchangeable.`;
    case 'list_information':
    case 'answer_factual_question':
      if (turn.topic === 'calculator_inputs') {
        const base =
          'Risk calculators typically use information such as age, reproductive and family-history factors, and related clinical inputs listed by the tool.';
        if (turn.secondaryOperations.includes('identify_limitation')) {
          return `${base} Important factors may still be missing, so the result cannot include every personal detail and remains a population-level estimate.`;
        }
        return `${base} The exact inputs depend on the specific calculator version being demonstrated.`;
      }
      if (turn.topic === 'calculator_validation' || turn.topic === 'calculator_result_source') {
        return 'This demonstration uses example calculator inputs for education. It is not based on a complete personal clinical record from your own medical chart.';
      }
      return `A risk estimate of about ${percent}% over ${horizon} describes probability for people with similar calculator information.`;
    case 'identify_limitation':
      return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person because individual outcomes also depend on factors the tool does not fully capture.`;
    case 'explain':
    case 'simplify':
    case 'elaborate':
      if (turn.topic === 'calculator_limitations') {
        return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person because individual outcomes also depend on factors the tool does not fully capture.`;
      }
      if (turn.topic === 'greeting') {
        return 'Hello — I am an educational demonstration guide for this risk-result conversation. What would you like to discuss about the result?';
      }
      if (turn.topic === 'emotion') {
        return 'Thank you for sharing how this feels. What part of the result would you like to look at next?';
      }
      return `A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer.`;
    case 'address_barrier': {
      if (
        turn.barrier === 'time' &&
        (/\bcall|work\b/i.test(barrierEvidenceOf(turn)) ||
          constraints.some((c) => /call|work/i.test(c)))
      ) {
        return `It sounds like time is the main obstacle — calling during work does not fit your schedule. A written option, such as a patient-portal message when available, may be easier.`;
      }
      if (turn.barrier === 'time') {
        return `It sounds like time is the main obstacle. A written option or saving a question for an existing visit may feel more manageable.`;
      }
      if (turn.barrier === 'access') {
        return WHO_TO_CONTACT_FALLBACK;
      }
      if (turn.barrier === 'cost') {
        return `It sounds like cost may be making follow-up difficult. Identifying a clinic contact who can explain coverage options can be one manageable next step.`;
      }
      return `That barrier is understandable. A more manageable optional next step may help without pressure.`;
    }
    case 'plan':
    case 'provide_options':
    case 'clarify_preference': {
      if (constraints.includes('one simple step')) {
        return `One simple place to start is to open your patient portal and paste a short message asking for help interpreting the demonstration estimate.`;
      }
      return `A general next step many people choose is to share the demonstration estimate with a healthcare professional, for example by a brief portal message or at an existing visit.`;
    }
    case 'draft':
    case 'revise': {
      if (constraints.some((c) => /appointment/.test(c))) {
        return `Here is a revised draft: "Hello, I received a demonstration breast-cancer risk estimate and would like help interpreting it with my family history. Thank you."`;
      }
      if (
        constraints.some((c) => /short|formal/.test(c)) ||
        (turn.topic === 'message_drafting' && !turn.entities.draftText)
      ) {
        return `Here is a short editable draft: "Hi, I got a demo breast-cancer risk estimate and would like help understanding it with my personal and family history. Thanks." You can change any wording before sending.`;
      }
      return `Here is a short editable draft you could adapt: "Hello, I recently received a demonstration breast-cancer risk estimate and would like help interpreting it with my personal and family history."`;
    }
    case 'confirm':
      if (turn.topic === 'message_drafting') {
        return 'The draft is ready to use. When would you like to send it?';
      }
      return `That is a clear next step. You can send the message ${turn.entities.timing ?? 'when you are ready'}.`;
    case 'reject':
    case 'defer':
      return 'That is fine. You do not have to send the draft. We can leave follow-up open without pressure.';
    case 'close':
      return 'You are welcome. I am glad that helped. You can return anytime if another question comes up.';
    case 'set_boundary':
      if (turn.topic === 'screening_guidance') {
        return 'This demonstration estimate cannot determine your personal screening schedule. Screening decisions are individualized and should be discussed with a qualified healthcare professional who can consider your full history.';
      }
      return 'I cannot diagnose conditions or recommend treatment. I can help explain what this demonstration risk estimate means in general terms.';
    case 'request_clarification':
      return 'Could you tell me which part of the result you would like explained or what you would like help doing next?';
    default:
      return `A risk estimate of about ${percent}% over ${horizon} describes probability for people with similar calculator information. It is not a diagnosis.`;
  }
}

function qualificationComponent(turn: SemanticTurn): string {
  if (turn.primaryOperation === 'verify_understanding') {
    return '';
  }
  if (turn.primaryOperation === 'convert') {
    return ' This is an approximate way to picture the probability, not a certainty for one person.';
  }
  if (
    turn.primaryOperation === 'correct_misunderstanding' ||
    turn.primaryOperation === 'identify_limitation' ||
    turn.topic === 'calculator_limitations'
  ) {
    return '';
  }
  if (turn.primaryOperation === 'compare') {
    return ' Both remain population-level probabilities rather than personal predictions.';
  }
  return '';
}

function emotionComponent(turn: SemanticTurn, plan: ResponsePlan): string {
  if (turn.emotion === 'not_expressed') return '';
  if (!plan.mustAddress.some((m) => /concern|emotion|worry/.test(m)) &&
      !plan.secondaryGoals.some((g) => /acknowledge concern/.test(g))) {
    return '';
  }
  if (turn.emotion === 'worry' || turn.emotion === 'fear') {
    return 'It is understandable to feel concerned. ';
  }
  return '';
}

/**
 * Builds a grounded fallback by composing plan components.
 */
function memoryHasPortal(memory?: ConversationMemory | null): boolean {
  if (!memory) return false;
  if (memory.draftStatus !== 'none') return true;
  if (memory.selectedCommunicationOption && /portal|written|message/i.test(memory.selectedCommunicationOption)) {
    return true;
  }
  return memory.selectedOptions.some((o) => /portal|written|message/i.test(o));
}

function memoryHasAppointment(memory?: ConversationMemory | null): boolean {
  if (!memory) return false;
  if (memory.plannedTiming) return true;
  return Boolean(memory.plannedAction && /appointment|visit|schedule/i.test(memory.plannedAction));
}

function fearsCurrentCancerFromTurn(turn: SemanticTurn): boolean {
  const text = `${turn.explicitRequest} ${turn.propositions.map((p) => p.text).join(' ')}`.toLowerCase();
  const normalized = text.replace(/\bbreastcancer\b/g, 'breast cancer');
  return (
    /\b(afraid|scared|worried|fear|terrified).{0,50}\b(have|having|got|get)\b.{0,30}\b(breast cancer|cancer)\b/.test(
      normalized,
    ) || /\bafraid if i have\b.{0,30}\b(breast cancer|cancer)\b/.test(normalized)
  );
}

export function generatePlanAwareFallback(input: PlanAwareFallbackInput): string {
  const { semanticTurn, plan, riskResult, calculation, conversationMemory } = input;
  if (semanticTurn.requiresSafetyBoundary && semanticTurn.topic !== 'screening_guidance') {
    return 'I cannot diagnose conditions or recommend treatment. I can help explain what this demonstration risk estimate means in general terms.';
  }

  if (
    plan.primaryGoal === 'close_supportively' ||
    semanticTurn.topic === 'closing' ||
    semanticTurn.primaryOperation === 'close' ||
    isGratitudeUtterance(input.latestMessage ?? '') ||
    semanticTurn.userConstraints.includes('gratitude')
  ) {
    return GRATITUDE_FALLBACK;
  }

  const requestText = `${semanticTurn.explicitRequest} ${semanticTurn.propositions.map((p) => p.text).join(' ')}`;
  if (semanticTurn.barrier === 'access' || asksWhoToContact(requestText)) {
    return WHO_TO_CONTACT_FALLBACK;
  }

  // Progress emotion / diagnosis-fear turns instead of repeating "what feels most concerning?"
  if (
    fearsCurrentCancerFromTurn(semanticTurn) ||
    semanticTurn.misunderstanding === 'risk_means_diagnosis' ||
    (semanticTurn.emotion === 'fear' &&
      /\b(cancer|diagnosis)\b/i.test(semanticTurn.explicitRequest + semanticTurn.propositions.map((p) => p.text).join(' ')))
  ) {
    return 'Feeling afraid that this means you currently have breast cancer is understandable. A demonstration risk estimate describes chance over time for people with similar calculator information — it is not a diagnosis of current cancer. A qualified healthcare professional can interpret it with your fuller history. Would it help next to look at what the number means, or at questions you could ask a professional?';
  }

  if (
    (plan.primaryGoal === 'acknowledge_emotion' || semanticTurn.topic === 'emotion') &&
    /\bmost concerning\b/i.test(input.recentAssistantMessages?.[0] ?? '')
  ) {
    return 'Thank you for sharing that. Feeling worried about what the result could mean is understandable. A demonstration risk estimate is a probability over time, not a diagnosis. Would it help to clarify the number itself, or to prepare a question for a healthcare professional?';
  }

  if (
    semanticTurn.topic === 'screening_guidance' ||
    /screening|mammogram|mri/i.test(plan.primaryGoal) ||
    /screening question/i.test(plan.explicitRequest ?? '')
  ) {
    return 'This demonstration estimate cannot determine your personal screening schedule. Screening decisions are individualized and should be discussed with a qualified healthcare professional who can consider your full history.';
  }

  if (
    plan.primaryGoal === 'address_practical_barrier' ||
    semanticTurn.primaryOperation === 'address_barrier'
  ) {
    const userText = lifestyleUserText(semanticTurn);
    if (/\b(return to|back to).{0,40}(work|schedule|time|calling|barrier)\b/i.test(userText)) {
      return 'Coming back to the schedule concern: calling during work can be hard. A written option when available, or saving the question for a time that fits better, may be more manageable than trying to phone during busy hours.';
    }
    return factualComponent(semanticTurn, riskResult, calculation);
  }

  if (
    plan.primaryGoal === 'answer_general_lifestyle_question_with_boundary' ||
    semanticTurn.topic === 'lifestyle_risk_information' ||
    semanticTurn.primaryOperation === 'answer_general_health_question' ||
    (/\b(physical activity|exercise|fitness|life[- ]?style|motivational guide)\b/i.test(
      lifestyleUserText(semanticTurn),
    ) &&
      plan.primaryGoal !== 'clarify_short_reply' &&
      plan.primaryGoal !== 'explain_five_year_risk_meaning' &&
      plan.primaryGoal !== 'address_practical_barrier')
  ) {
    return lifestyleMotivationFallback(
      semanticTurn,
      input.retrievedEvidence,
      input.latestMessage,
      input.recentAssistantMessages,
    );
  }

  if (
    plan.primaryGoal === 'list_questions_for_clinician' ||
    (semanticTurn.primaryOperation === 'list_information' &&
      semanticTurn.topic === 'professional_interpretation')
  ) {
    const wantsDetail =
      /detailed/i.test(plan.responseStyle?.requestedFormat ?? '') ||
      /detailed/i.test(semanticTurn.requestedFormat ?? '') ||
      semanticTurn.userConstraints.some((c) => /detailed/i.test(c));
    if (wantsDetail) {
      return 'Here are more detailed general questions people often ask a healthcare professional about a demonstration risk estimate. What does this estimate mean for me personally? — helps translate a population-level number into your individual context. Which parts of my personal or family history matter most here? — clarifies which factors a clinician may weigh most. Are any follow-up discussions or tests appropriate for my situation? — keeps next steps individualized rather than assumed. How should I use this demonstration result alongside screening or other care already in place? — avoids treating the estimate as a diagnosis. What should I watch for or ask about next? — supports ongoing questions without pressure. These are general preparation ideas, not a personalized care plan.';
    }
    return 'Here are some general questions people often ask a healthcare professional about a demonstration risk estimate: What does this estimate mean for me personally? Which parts of my personal or family history matter most here? Are any follow-up discussions or tests appropriate for my situation? What should I watch for or ask about next? These are general preparation ideas, not a personalized care plan.';
  }

  if (
    plan.primaryGoal === 'provide_preparation_information' ||
    semanticTurn.primaryOperation === 'provide_preparation_information'
  ) {
    return 'Before talking with a healthcare professional, it can help to note your demonstration risk estimate, write down questions you want answered, and list relevant personal or family history you want to share. This is general preparation information, not a personalized care plan.';
  }

  if (
    plan.primaryGoal === 'acknowledge_deferral' ||
    plan.primaryGoal === 'respect_decision_deferral' ||
    /defer/i.test(plan.primaryOperation ?? '')
  ) {
    return 'That is fine. You can keep the draft and decide later, with no pressure to send it now.';
  }

  if (
    plan.primaryGoal === 'confirm_understanding' ||
    plan.primaryOperation === 'verify_understanding' ||
    semanticTurn.primaryOperation === 'verify_understanding'
  ) {
    return understandingNextStepFallback(riskResult);
  }

  if (
    plan.primaryGoal === 'provide_next_step_options' ||
    plan.primaryOperation === 'provide_options'
  ) {
    const emotion =
      semanticTurn.emotion === 'worry' || semanticTurn.emotion === 'fear'
        ? 'It is understandable to feel concerned. '
        : '';
    if (memoryHasPortal(conversationMemory) || memoryHasAppointment(conversationMemory)) {
      return `${emotion}A general next step many people choose is to share the demonstration estimate with a healthcare professional, for example by a brief portal message or at an existing visit.`;
    }
    return `${emotion}A general next step many people choose is to share the demonstration estimate with a qualified healthcare professional who can interpret it with a fuller personal history.`;
  }

  if (/list calculator input/i.test(plan.primaryGoal)) {
    const base =
      'Risk calculators typically use information such as age, reproductive and family-history factors, and related clinical inputs listed by the tool.';
    if (/limitation/i.test(plan.primaryGoal) || plan.secondaryOperations?.includes('identify_limitation')) {
      return `${base} Important factors may still be missing, so the result cannot include every personal detail and remains a population-level estimate.`;
    }
    return `${base} The exact inputs depend on the specific calculator version being demonstrated.`;
  }

  if (
    /answer_with_calculator_metadata|explain_calculator_result_source/i.test(plan.primaryGoal) ||
    (/personal information/i.test(plan.mustAddress?.join(' ') ?? '') &&
      /calculator_validation|personal|result_source/i.test(plan.topic ?? ''))
  ) {
    return 'This demonstration uses example calculator inputs for education. It is not based on a complete personal clinical record from your own medical chart.';
  }

  const percent = calculation?.originalRiskPercent ?? semanticTurn.entities.riskValue ?? riskResult.fiveYearRisk;
  const horizonRaw = calculation?.timeHorizon ?? semanticTurn.entities.timeHorizon ?? riskResult.riskHorizon;
  const horizon = /five|5\s*year/i.test(String(horizonRaw)) ? 'five years' : String(horizonRaw);
  const frequency =
    calculation?.approximationText ??
    calculation?.approximationLabel ??
    `about ${Math.round(percent)} out of 100`;

  // Route-specific fallbacks keyed by precise primaryGoal — not one generic risk lecture.
  switch (plan.primaryGoal) {
    case 'answer_general_lifestyle_question_with_boundary':
      return lifestyleMotivationFallback(
        semanticTurn,
        input.retrievedEvidence,
        input.latestMessage,
        input.recentAssistantMessages,
      );
    case 'list_questions_for_clinician':
      return 'Here are some general questions people often ask a healthcare professional about a demonstration risk estimate: What does this estimate mean for me personally? Which parts of my personal or family history matter most here? Are any follow-up discussions or tests appropriate for my situation? What should I watch for or ask about next? These are general preparation ideas, not a personalized care plan.';
    case 'provide_preparation_information':
      return 'Before talking with a healthcare professional, it can help to note your demonstration risk estimate, write down questions you want answered, and list relevant personal or family history you want to share. This is general preparation information, not a personalized care plan.';
    case 'simplify_risk_explanation':
      return `In plain terms, the about ${percent}% figure over ${horizon} is a chance estimate for people with similar calculator information. It is not a diagnosis and does not say what will happen to one person.`;
    case 'explain_elevated_risk_label':
      return `Elevated means the demonstration estimate is higher than the comparison level used by this tool. It does not mean you currently have cancer, and it does not guarantee that cancer will occur.`;
    case 'explain_average_risk_label':
      return `Average means the demonstration estimate is near the comparison level used by this tool. It does not mean zero risk or guaranteed safety.`;
    case 'correct_zero_risk_misunderstanding':
      return `An average-risk label does not mean zero risk or that nothing bad can happen. It still describes a probability for people with similar inputs, not a guarantee of safety.`;
    case 'correct_diagnosis_misunderstanding':
      return `This demonstration result is an estimate of chance over a time period, not a diagnosis of current cancer.`;
    case 'correct_certainty_misunderstanding':
      return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person and is not a diagnosis.`;
    case 'convert_to_natural_frequency':
      return `Over ${horizon}, ${frequency} people with similar calculator information may develop breast cancer. This is an approximate way to picture the probability, not a certainty for one person.`;
    case 'explain_five_year_risk_meaning':
      return `The about ${percent}% five-year demonstration estimate describes chance over about five years for people with similar calculator information. It is a probability estimate, not a diagnosis.`;
    case 'answer_concern_calibration':
      return `This demonstration estimate alone cannot determine how concerned you personally should be or what clinical follow-up is right for you. A qualified healthcare professional can interpret it with your full history.`;
    case 'compare_time_horizons':
      return `Five-year risk looks at a nearer window, while lifetime risk covers a much longer span. Both are probabilities for groups with similar inputs, not individual predictions.`;
    case 'explain_calculator_inputs': {
      const base =
        'Risk calculators typically use information such as age, reproductive and family-history factors, and related clinical inputs listed by the tool.';
      if (
        semanticTurn.secondaryOperations.includes('identify_limitation') ||
        /limitation/i.test(plan.primaryGoal) ||
        (plan.mustAddress ?? []).some((item) => /limitation|missing|not include/i.test(item))
      ) {
        return `${base} Important factors may still be missing, so the result cannot include every personal detail and remains a population-level estimate.`;
      }
      return `${base} The exact inputs depend on the specific calculator version being demonstrated.`;
    }
    case 'explain_calculator_limitations':
      return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person because individual outcomes also depend on factors the tool does not fully capture.`;
    case 'address_practical_barrier':
    case 'address_time_barrier':
      break; // fall through to operation-based barrier wording
    default:
      break;
  }

  if (semanticTurn.topic === 'risk_level' && semanticTurn.primaryOperation === 'explain') {
    if (/elevated/i.test(semanticTurn.explicitRequest)) {
      return `Elevated means the demonstration estimate is higher than the comparison level used by this tool. It does not mean you currently have cancer, and it does not guarantee that cancer will occur.`;
    }
    if (/average/i.test(semanticTurn.explicitRequest)) {
      return `Average means the demonstration estimate is near the comparison level used by this tool. It does not mean zero risk or guaranteed safety.`;
    }
  }

  if (semanticTurn.primaryOperation === 'simplify') {
    return `In plain terms, the about ${percent}% figure over ${horizon} is a chance estimate for people with similar calculator information. It is not a diagnosis and does not say what will happen to one person.`;
  }

  if (semanticTurn.misunderstanding === 'average_means_zero_risk') {
    return `An average-risk label does not mean zero risk or that nothing bad can happen. It still describes a probability for people with similar inputs, not a guarantee of safety.`;
  }

  const emotion = emotionComponent(semanticTurn, plan);
  const factual = factualComponent(semanticTurn, riskResult, calculation);
  const qualification = qualificationComponent(semanticTurn);
  let question = '';
  if (plan.shouldAskQuestion && semanticTurn.primaryOperation === 'address_barrier') {
    question =
      plan.questionPurpose?.includes('written') ||
      /call|work/i.test(barrierEvidenceOf(semanticTurn))
        ? ' Would writing feel more manageable than calling?'
        : ' What would make the next step feel more manageable?';
  }
  return `${emotion}${factual}${qualification}${question}`.replace(/\s+/g, ' ').trim();
}
