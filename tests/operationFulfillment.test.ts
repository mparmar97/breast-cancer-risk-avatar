import { describe, expect, it } from 'vitest';
import { interpretCurrentTurnRequest } from '../worker/dialogue/currentTurnInterpretation';
import {
  buildOperationRepairInstruction,
  validateOperationFulfillment,
} from '../worker/dialogue/validateOperationFulfillment';
import { convertRiskToNaturalFrequency } from '../worker/risk/convertRiskToNaturalFrequency';
import { getMockRiskResult } from '../worker/mockRisk';

const risk = getMockRiskResult('elevated');

describe('operationFulfillment validation', () => {
  it('fails generic substitution for a convert request and builds repair JSON', () => {
    const interpretation = interpretCurrentTurnRequest({
      latestMessage: 'Can you explain 3.2% without using percentages?',
      riskResult: risk,
    });
    const calculation = convertRiskToNaturalFrequency({
      riskPercent: 3.2,
      denominator: 100,
      timeHorizon: '5 years',
    });

    const bad = validateOperationFulfillment({
      reply: 'A risk estimate is a probability and not a diagnosis.',
      interpretation,
      calculation,
      shouldAskQuestion: false,
    });

    expect(bad.genericSubstitutionDetected).toBe(true);
    expect(bad.primaryOperationCompleted).toBe(false);
    expect(bad.valid).toBe(false);

    const repair = JSON.parse(buildOperationRepairInstruction(bad, interpretation));
    expect(repair.required_operation).toBe('convert');
    expect(repair.explicit_request).toMatch(/Convert/i);
    expect(repair.missing_elements.join(' ')).toMatch(/natural frequency|five-year/i);

    const good = validateOperationFulfillment({
      reply:
        'Over five years, about 3 out of 100 people with similar calculator information may develop breast cancer.',
      interpretation,
      calculation,
      shouldAskQuestion: false,
    });
    expect(good.valid).toBe(true);
    expect(good.primaryOperationCompleted).toBe(true);
    expect(good.genericSubstitutionDetected).toBe(false);
  });

  it('requires acknowledgment for verify_understanding', () => {
    const interpretation = interpretCurrentTurnRequest({
      latestMessage: 'So about 3 people out of 100 may develop it during five years?',
      riskResult: risk,
    });
    const fail = validateOperationFulfillment({
      reply: 'A risk estimate is a probability and not a diagnosis.',
      interpretation,
      shouldAskQuestion: false,
    });
    expect(fail.primaryOperationCompleted).toBe(false);

    const pass = validateOperationFulfillment({
      reply: 'Yes — that is a clear understanding of the five-year estimate.',
      interpretation,
      shouldAskQuestion: false,
    });
    expect(pass.valid).toBe(true);
  });

  it('requires both horizons for compare', () => {
    const interpretation = interpretCurrentTurnRequest({
      latestMessage: 'What is the difference between five-year and lifetime risk?',
      riskResult: risk,
    });
    const fail = validateOperationFulfillment({
      reply: 'Five-year risk looks at a nearer window of chance.',
      interpretation,
      shouldAskQuestion: false,
    });
    expect(fail.primaryOperationCompleted).toBe(false);

    const pass = validateOperationFulfillment({
      reply:
        'Five-year risk covers a nearer window, while lifetime risk covers a much longer span. Both are group probabilities.',
      interpretation,
      shouldAskQuestion: false,
    });
    expect(pass.valid).toBe(true);
  });
});
