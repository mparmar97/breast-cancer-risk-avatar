import { describe, expect, it } from 'vitest';
import { interpretCurrentTurnRequest } from '../worker/dialogue/currentTurnInterpretation';
import { convertRiskToNaturalFrequency } from '../worker/risk/convertRiskToNaturalFrequency';
import { getMockRiskResult } from '../worker/mockRisk';

const risk = getMockRiskResult('elevated');

describe('currentTurnOperation interpretation', () => {
  it('classifies natural-frequency conversion without collapsing to generic risk explanation', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage: 'Can you explain 3.2% without using percentages?',
      riskResult: risk,
    });

    expect(result.topic).toBe('natural_frequency');
    expect(result.operation).toBe('convert');
    expect(result.requestedOutputFormat).toMatch(/natural frequency/i);
    expect(result.explicitRequest).toMatch(/Convert.*3\.2%.*out of 100/i);
    expect(result.explicitRequest).not.toMatch(/^request_risk_explanation$/i);
    expect(result.requiresCalculation).toBe(true);

    const calc = convertRiskToNaturalFrequency({
      riskPercent: result.entities.riskValue ?? risk.fiveYearRisk,
      denominator: result.entities.denominator ?? 100,
      timeHorizon: result.entities.timeHorizon ?? risk.riskHorizon,
    });
    expect(calc.numerator).toBe(3);
    expect(calc.denominator).toBe(100);
    expect(calc.approximationText).toBe('about 3 out of 100');
  });

  it('classifies teach-back as verify_understanding', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage: 'So about 3 people out of 100 may develop it during five years?',
      riskResult: risk,
    });
    expect(result.topic).toBe('natural_frequency');
    expect(result.operation).toBe('verify_understanding');
  });

  it('classifies time-horizon comparison', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage: 'What is the difference between five-year and lifetime risk?',
      riskResult: risk,
    });
    expect(result.topic).toBe('time_horizon');
    expect(result.operation).toBe('compare');
    expect(result.explicitRequest).toMatch(/Compare.*five-year.*lifetime/i);
  });

  it('supports compound list_information + identify_limitation', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage:
        'What information did the calculator use, and what important factors might it not include?',
      riskResult: risk,
    });
    expect(result.topic).toBe('calculator_inputs');
    expect(result.operation).toBe('list_information');
    expect(result.secondaryOperations).toContain('identify_limitation');
  });

  it('supports compare + summarize with format', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage: 'Compare five-year and lifetime risk in two short sentences.',
      riskResult: risk,
    });
    expect(result.operation).toBe('compare');
    expect(result.secondaryOperations).toContain('summarize');
    expect(result.requestedOutputFormat).toMatch(/two short sentences/i);
  });

  it('keeps next-step as provide_options with emotion secondary intent', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage:
        'I understand the number, but I am worried and want to know what I should do next.',
      riskResult: risk,
    });
    expect(result.operation).toBe('provide_options');
    expect(result.secondaryIntents).toContain('express_emotion');
  });

  it('classifies draft with shorten + change_tone', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage:
        'I can use the portal, but I do not know what to write. Please make it short and not too formal.',
      riskResult: risk,
    });
    expect(result.operation).toBe('draft');
    expect(result.secondaryOperations).toEqual(expect.arrayContaining(['shorten', 'change_tone']));
  });

  it('classifies constrained draft revision', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage:
        'Here is my draft. Make it shorter, remove the appointment sentence, and keep the question about family history.',
      riskResult: risk,
      previousDraftPending: true,
    });
    expect(result.operation).toBe('revise');
    expect(result.explicitRequest).toMatch(/shorter|appointment|family history/i);
  });

  it('classifies one-step barrier planning', () => {
    const result = interpretCurrentTurnRequest({
      latestMessage:
        'I know who to contact, but I keep putting it off. Give me one simple place to start and do not give me a list.',
      riskResult: risk,
    });
    expect(result.topic).toBe('barrier');
    expect(result.operation).toBe('plan_action');
    expect(result.requestedOutputFormat).toBe('one simple step');
  });

  it('converts 1.1% to about 1 out of 100', () => {
    const calc = convertRiskToNaturalFrequency({ riskPercent: 1.1, denominator: 100 });
    expect(calc.numerator).toBe(1);
    expect(calc.approximationText).toBe('about 1 out of 100');
  });
});
