/**
 * Precise semantic routing tests (A–J).
 * Assert semantic properties only — no exact full-reply equality.
 * Example sentences live here; production uses reusable feature detectors.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveActiveInformationNeed,
  assertMissingInformationConsistency,
} from '../worker/dialogue/activeInformationNeed';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { deriveResponsePlan } from '../worker/dialogue/deriveResponsePlan';
import { resolveContextualReply } from '../worker/dialogue/resolveContextualReply';
import { selectPrimaryGoal } from '../worker/dialogue/responseContracts';
import { interpretSemanticTurnLocal } from '../worker/dialogue/semanticTurn';
import { selectTheoryApplication } from '../worker/dialogue/theoryApplication';
import { getMockRiskResult } from '../worker/mockRisk';
import { buildRetrievalSpec } from '../worker/rag/buildRetrievalSpec';
import { convertRiskToNaturalFrequency } from '../worker/risk/convertRiskToNaturalFrequency';
import { routeDialogueTurn } from '../worker/routing/routeDialogueTurn';

const risk = getMockRiskResult('elevated');

function interpret(message: string) {
  return interpretSemanticTurnLocal({ latestMessage: message, riskResult: risk });
}

function planFor(message: string) {
  const semanticTurn = interpret(message);
  const dialogueRoute = routeDialogueTurn({
    latestMessage: message,
    riskResult: risk,
    semanticTurn,
    conversationMemory: createDefaultConversationMemory(),
  });
  const plan = deriveResponsePlan({
    semanticTurn,
    conversationMemory: createDefaultConversationMemory(),
    riskResult: risk,
    dialogueRoute,
  });
  return { semanticTurn, dialogueRoute, plan };
}

describe('precise semantic routing — Tests A–J', () => {
  it('A: simple language → simplify + risk_meaning + simplify_risk_explanation', () => {
    const message = 'Can you explain the five-year result in plain nontechnical language?';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.topic).toBe('risk_meaning');
    expect(semanticTurn.primaryOperation).toBe('simplify');
    expect(semanticTurn.explicitRequest.toLowerCase()).toMatch(/plain|nontechnical|simple/);
    expect(semanticTurn.requestedOutputFormat ?? semanticTurn.requestedFormat).toMatch(/simple/i);
    expect(semanticTurn.classificationMode).toMatch(/local-semantic-fallback|local-fallback/);
    expect(semanticTurn.currentTurnEvidence.stance).toBeTruthy();
    expect(selectPrimaryGoal(semanticTurn)).toBe('simplify_risk_explanation');
    expect(plan.primaryGoal).toBe('simplify_risk_explanation');
    expect(plan.primaryGoal).not.toBe('answer_question');
  });

  it('B: elevated meaning → risk_level + explain + elevated label goal', () => {
    const message = 'What does an elevated risk label mean compared with average?';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.topic).toBe('risk_level');
    expect(semanticTurn.primaryOperation).toBe('explain');
    expect(semanticTurn.explicitRequest.toLowerCase()).toMatch(/elevated/);
    expect(semanticTurn.explicitRequest.toLowerCase()).toMatch(/comparison|average|compared/);
    expect(semanticTurn.topic).not.toBe('risk_meaning');
    expect(plan.primaryGoal).toBe('explain_elevated_risk_label');
    const theory = selectTheoryApplication(semanticTurn);
    expect(theory.healthBehaviorTheory).toBe('Fuzzy-Trace Theory');
    expect(theory.decisionSupportFramework).toBe('none');
    const spec = buildRetrievalSpec({ semanticTurn, riskResult: risk });
    expect(spec.query.toLowerCase()).toMatch(/elevated/);
    expect(spec.excludeTerms.join(' ')).toMatch(/lifetime|portal|screening|natural frequency/);
  });

  it('C: average means safe → correct_misunderstanding + average_means_zero_risk', () => {
    const message = 'Average means I am safe, right?';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.topic).toBe('risk_level');
    expect(semanticTurn.primaryOperation).toBe('correct_misunderstanding');
    expect(semanticTurn.misunderstanding).toBe('average_means_zero_risk');
    expect(plan.primaryGoal).toBe('correct_zero_risk_misunderstanding');
  });

  it('D: convert people out of 100 → convert + natural frequency format', () => {
    const message = 'How many people out of 100 is that?';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.topic).toBe('risk_representation');
    expect(semanticTurn.primaryOperation).toBe('convert');
    expect(semanticTurn.requestedOutputFormat ?? semanticTurn.requestedFormat).toMatch(
      /natural frequency/i,
    );
    expect(plan.primaryGoal).toBe('convert_to_natural_frequency');
    expect(plan.selectedInformationSources).toContain('deterministic_calculation');
    const calc = convertRiskToNaturalFrequency({
      riskPercent: risk.fiveYearRisk,
      denominator: 100,
      timeHorizon: risk.riskHorizon,
    });
    expect(calc.originalPercent).toBe(calc.originalRiskPercent);
    expect(calc.approximationLabel).toBe(calc.approximationText);
    expect(typeof calc.rounded).toBe('boolean');
    const theory = selectTheoryApplication(semanticTurn);
    expect(theory.decisionSupportFramework).toBe('none');
  });

  it('E: diagnosis vs estimate → correct_misunderstanding + risk_means_diagnosis', () => {
    const message = 'Is this estimate the same as a diagnosis?';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.primaryOperation).toBe('correct_misunderstanding');
    expect(semanticTurn.misunderstanding).toBe('risk_means_diagnosis');
    expect(plan.primaryGoal).toBe('correct_diagnosis_misunderstanding');
  });

  it('F: concern calibration → answer_concern_calibration', () => {
    const message = 'How concerned should I be about this result?';
    const { semanticTurn, plan } = planFor(message);
    expect(['risk_level', 'professional_interpretation']).toContain(semanticTurn.topic);
    expect(plan.primaryGoal).toBe('answer_concern_calibration');
    expect(plan.primaryGoal).not.toBe('answer_question');
  });

  it('G: practical barrier → address_barrier + conversation memory need', () => {
    const message = 'Calling during business hours is difficult for me.';
    const { semanticTurn, plan } = planFor(message);
    expect(semanticTurn.primaryOperation).toBe('address_barrier');
    expect(semanticTurn.barrier).toBe('time');
    expect(plan.primaryGoal).toBe('address_practical_barrier');
    const need = deriveActiveInformationNeed({ semanticTurn, riskResult: risk });
    expect(need.resolved).toBe(true);
    expect(need.unresolvedQuestion).toBe('');
    expect(need.sourceRequired).toBe('none');
    const theory = selectTheoryApplication(semanticTurn);
    expect(theory.healthBehaviorTheory).toBe('Health Belief Model');
  });

  it('H: deferral → respect_decision_deferral + MI, not ODSF-only pressure', () => {
    const message = 'I will save the draft and decide later.';
    const { semanticTurn, dialogueRoute, plan } = planFor(message);
    expect(dialogueRoute.primaryOperation).toBe('defer');
    expect(dialogueRoute.stance).toBe('deferring');
    expect(plan.primaryGoal).toBe('respect_decision_deferral');
    const theory = selectTheoryApplication({
      ...semanticTurn,
      primaryOperation: 'defer',
      stance: 'deferring',
    });
    expect(theory.communicationTheory).toBe('Motivational Interviewing');
  });

  it('I: screening → set_boundary + apply_screening_boundary + safety source', () => {
    const message = 'Does this result mean I need a mammogram?';
    const { semanticTurn, dialogueRoute, plan } = planFor(message);
    expect(semanticTurn.topic).toBe('screening_guidance');
    expect(semanticTurn.primaryOperation).toBe('set_boundary');
    expect(dialogueRoute.safetyBoundaryRequired).toBe(true);
    expect(plan.primaryGoal).toBe('apply_screening_boundary');
    const need = deriveActiveInformationNeed({ semanticTurn, riskResult: risk });
    expect(need.sourceRequired).toBe('safety_policy');
  });

  it('J: contextual yes on source question → calculator metadata path', () => {
    const resolved = resolveContextualReply('Yes', {
      type: 'question',
      text: 'Would you like to know how the number was produced?',
      expectedReplyType: 'affirmation',
    });
    expect(resolved.kind).toBe('information_requested');
    expect(resolved.kind).not.toBe('understanding_confirmed');

    const message = 'Was this number based on my personal information?';
    const { semanticTurn, dialogueRoute, plan } = planFor(message);
    expect(semanticTurn.requiresCalculatorMetadata).toBe(true);
    expect(dialogueRoute.selectedInformationSource).toBe('calculator_metadata');
    expect(plan.primaryGoal).toBe('explain_calculator_result_source');
    const spec = buildRetrievalSpec({
      semanticTurn,
      route: dialogueRoute,
      riskResult: risk,
    });
    expect(spec.implementationMetadataRequired).toBe(true);
    expect(spec.required).toBe(false);
    expect(spec.medicalRagRequired).toBe(false);
  });
});

describe('precise semantic routing — theory and need helpers', () => {
  it('does not apply ODSF to “What does 3.2% mean?”', () => {
    const turn = interpret('What does 3.2% mean?');
    const theory = selectTheoryApplication(turn);
    expect(theory.healthBehaviorTheory).toBe('Fuzzy-Trace Theory');
    expect(theory.decisionSupportFramework).toBe('none');
    expect(selectPrimaryGoal(turn)).toBe('explain_five_year_risk_meaning');
  });

  it('clears missing_information when unresolvedQuestion is empty', () => {
    const turn = interpret('Calling during work is hard.');
    const need = deriveActiveInformationNeed({ semanticTurn: turn, riskResult: risk });
    const cleared = assertMissingInformationConsistency(
      { primaryDecisionalNeed: 'missing_information', unresolvedQuestion: null },
      need,
    );
    expect(cleared.primaryDecisionalNeed).toBe('none');
  });

  it('fills missing_information from active need when present', () => {
    const turn = interpret('What does 3.2% mean?');
    const need = deriveActiveInformationNeed({ semanticTurn: turn, riskResult: risk });
    expect(need.unresolvedQuestion.length).toBeGreaterThan(0);
    const filled = assertMissingInformationConsistency(
      { primaryDecisionalNeed: 'missing_information', unresolvedQuestion: null },
      need,
    );
    expect(filled.unresolvedQuestion).toBe(need.unresolvedQuestion);
  });

  it('syncs userClaims / userQuestions / requestedOutputFormat aliases', () => {
    const turn = interpret('How many people out of 100 is that?');
    expect(turn.userClaims).toEqual(turn.claims);
    expect(turn.userQuestions.length).toBeGreaterThan(0);
    expect(turn.requestedOutputFormat).toBe(turn.requestedFormat);
    expect(turn.currentTurnEvidence.stance).toBe(turn.stance);
  });
});
