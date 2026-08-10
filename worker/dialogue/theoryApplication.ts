/**
 * Theory relevance gating: apply FTT / HBM / MI / ODSF only when warranted.
 * Simple factual explain/convert/list questions must not activate ODSF.
 */

import type { AdaptiveState } from '../behavioral/state';
import type { ActiveInformationNeed } from './activeInformationNeed';
import type { SemanticTurn } from './semanticTurn';

export interface TheoryApplication {
  healthBehaviorTheory: 'Fuzzy-Trace Theory' | 'Health Belief Model' | 'none';
  communicationTheory: 'Motivational Interviewing' | 'none';
  decisionSupportFramework: 'Ottawa Decision Support Framework' | 'none';
  construct: string;
  communicationObjective: string;
  activationReason: string;
}

export interface SelectTheoryApplicationInput {
  semanticTurn: SemanticTurn;
  activeNeed?: ActiveInformationNeed;
  adaptiveState?: AdaptiveState;
}

function isDirectInformationalQuestion(turn: SemanticTurn): boolean {
  if (!turn.directAnswerRequired) return false;
  if (turn.topic === 'lifestyle_risk_information') return true;
  if (
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'provide_preparation_information' ||
    turn.primaryOperation === 'explain' ||
    turn.primaryOperation === 'convert' ||
    turn.primaryOperation === 'simplify' ||
    turn.primaryOperation === 'answer_factual_question' ||
    turn.primaryOperation === 'list_information' ||
    turn.primaryOperation === 'identify_limitation' ||
    turn.primaryOperation === 'compare' ||
    turn.primaryOperation === 'explain_lifestyle_relationship'
  ) {
    return true;
  }
  if (turn.topic === 'risk_meaning' || turn.topic === 'risk_representation' || turn.topic === 'risk_level') {
    return turn.primaryOperation !== 'address_barrier';
  }
  return false;
}

function wantsFtt(turn: SemanticTurn): boolean {
  // Lifestyle factual questions: no FTT activation.
  if (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'provide_preparation_information'
  ) {
    return false;
  }
  if (
    turn.primaryOperation === 'simplify' ||
    turn.primaryOperation === 'convert' ||
    turn.primaryOperation === 'verify_understanding' ||
    turn.primaryOperation === 'correct_misunderstanding'
  ) {
    return true;
  }
  if (turn.topic === 'time_horizon' || turn.topic === 'risk_meaning') return true;
  if (turn.topic === 'risk_level' && turn.primaryOperation === 'explain') return true;
  if (turn.primaryOperation === 'explain' || turn.primaryOperation === 'elaborate') return true;
  return false;
}

function isLifestyleMotivationTurn(turn: SemanticTurn): boolean {
  return (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'explain_lifestyle_relationship'
  );
}

function wantsHbm(turn: SemanticTurn, adaptive?: AdaptiveState): boolean {
  // Lifestyle / fitness / initial healthy-step questions: HBM perceived benefits + cue to action.
  if (isLifestyleMotivationTurn(turn)) {
    return true;
  }

  // Only activate HBM when barrier / self-efficacy difficulty is evidenced THIS turn.
  // Do not activate from carried adaptive barrier/self-efficacy alone on a new
  // direct informational question (risk_meaning explain, convert, etc.).
  const barrierThisTurn = turn.barrier !== 'not_expressed' && turn.barrier !== 'none';
  const barrierEvidence =
    typeof turn.evidence?.barrier === 'string' &&
    turn.evidence.barrier.trim().length > 0 &&
    turn.evidence.barrier.trim().toLowerCase() !== 'not expressed' &&
    turn.evidence.barrier.trim().toLowerCase() !== 'none';

  if (barrierThisTurn || barrierEvidence || turn.primaryOperation === 'address_barrier') {
    return true;
  }

  if (isDirectInformationalQuestion(turn)) {
    return false;
  }

  // Non-informational turns may still use carried adaptive cues.
  if (adaptive?.barrier && adaptive.barrier !== 'none') return true;
  if (adaptive?.selfEfficacy === 'low') return true;
  return false;
}

function wantsMi(turn: SemanticTurn, adaptive?: AdaptiveState): boolean {
  // Lifestyle motivation uses MI autonomy support (no pressure, choice-preserving ask).
  if (isLifestyleMotivationTurn(turn)) {
    return true;
  }
  if (turn.stance === 'deferring' || turn.primaryOperation === 'defer' || turn.primaryOperation === 'reject') {
    return true;
  }
  if (
    (adaptive?.readiness === 'not_considering' || adaptive?.readiness === 'considering') &&
    (turn.stance === 'rejecting' ||
      /\b(not sure|maybe later|ambivalent|conflicted)\b/i.test(turn.explicitRequest))
  ) {
    return true;
  }
  return false;
}

function wantsOdsf(turn: SemanticTurn, adaptive?: AdaptiveState): boolean {
  // Never for simple factual explain / convert / list / meaning / lifestyle questions.
  if (
    turn.topic === 'lifestyle_risk_information' ||
    turn.primaryOperation === 'answer_general_health_question' ||
    turn.primaryOperation === 'provide_preparation_information' ||
    turn.primaryOperation === 'explain_lifestyle_relationship' ||
    turn.primaryOperation === 'convert' ||
    turn.primaryOperation === 'list_information' ||
    turn.primaryOperation === 'answer_factual_question' ||
    turn.primaryOperation === 'identify_limitation' ||
    turn.primaryOperation === 'simplify' ||
    turn.primaryOperation === 'correct_misunderstanding' ||
    turn.primaryOperation === 'verify_understanding' ||
    turn.primaryOperation === 'compare'
  ) {
    return false;
  }
  if (turn.topic === 'risk_meaning' || turn.topic === 'risk_level') {
    if (turn.primaryOperation === 'explain' || turn.primaryOperation === 'elaborate') return false;
  }

  if (
    turn.primaryOperation === 'provide_options' ||
    turn.primaryOperation === 'plan' ||
    turn.primaryOperation === 'clarify_preference'
  ) {
    return true;
  }
  if (adaptive?.selfEfficacy === 'low' && turn.topic === 'professional_interpretation') return true;
  if (
    (turn.topic === 'professional_interpretation' ||
      turn.topic === 'action_planning' ||
      turn.topic === 'risk_uncertainty') &&
    turn.stance === 'uncertain'
  ) {
    return true;
  }
  return false;
}

/**
 * Selects which theories are relevant for the current semantic request.
 */
export function selectTheoryApplication(
  semanticTurn: SemanticTurn,
  activeNeed?: ActiveInformationNeed,
  adaptiveState?: AdaptiveState,
): TheoryApplication;
export function selectTheoryApplication(input: SelectTheoryApplicationInput): TheoryApplication;
export function selectTheoryApplication(
  turnOrInput: SemanticTurn | SelectTheoryApplicationInput,
  activeNeed?: ActiveInformationNeed,
  adaptiveState?: AdaptiveState,
): TheoryApplication {
  const turn =
    'semanticTurn' in (turnOrInput as SelectTheoryApplicationInput)
      ? (turnOrInput as SelectTheoryApplicationInput).semanticTurn
      : (turnOrInput as SemanticTurn);
  const need =
    'semanticTurn' in (turnOrInput as SelectTheoryApplicationInput)
      ? (turnOrInput as SelectTheoryApplicationInput).activeNeed
      : activeNeed;
  const adaptive =
    'semanticTurn' in (turnOrInput as SelectTheoryApplicationInput)
      ? (turnOrInput as SelectTheoryApplicationInput).adaptiveState
      : adaptiveState;

  void need;

  const ftt = wantsFtt(turn);
  const hbm = wantsHbm(turn, adaptive);
  const mi = wantsMi(turn, adaptive);
  const odsf = wantsOdsf(turn, adaptive);

  const lifestyleMotivation = isLifestyleMotivationTurn(turn);
  const reasons: string[] = [];
  if (ftt) reasons.push('gist/probability communication');
  if (hbm) {
    reasons.push(
      lifestyleMotivation
        ? 'lifestyle motivation: perceived benefits and cue to action'
        : 'expressed barrier or self-efficacy difficulty',
    );
  }
  if (mi) {
    reasons.push(
      lifestyleMotivation ? 'autonomy-supportive lifestyle motivation' : 'ambivalence, resistance, or deferral',
    );
  }
  if (odsf) reasons.push('option/preference decisional conflict');

  let construct = 'none';
  let objective = 'Answer the latest semantic request directly.';
  if (ftt) {
    construct = 'gist representation';
    objective = 'Convey the bottom-line meaning of the estimate without overstating certainty.';
  }
  if (hbm) {
    construct = lifestyleMotivation
      ? 'perceived benefits / cue to action'
      : 'perceived barriers / self-efficacy';
    objective = lifestyleMotivation
      ? 'Motivate with population-level lifestyle benefits and a choice-preserving next step, without prescribing treatment.'
      : 'Acknowledge the expressed barrier and support a manageable next step.';
  }
  if (mi && !lifestyleMotivation) {
    construct = 'autonomy support';
    objective = 'Preserve autonomy and avoid pressuring action.';
  }
  if (odsf) {
    construct = 'decisional needs / options';
    objective = 'Clarify options or preferences when decisional conflict is present.';
  }

  return {
    healthBehaviorTheory: hbm ? 'Health Belief Model' : ftt ? 'Fuzzy-Trace Theory' : 'none',
    communicationTheory: mi ? 'Motivational Interviewing' : 'none',
    decisionSupportFramework: odsf ? 'Ottawa Decision Support Framework' : 'none',
    construct,
    communicationObjective: objective,
    activationReason: reasons.length > 0 ? reasons.join('; ') : 'no theory activation required',
  };
}
