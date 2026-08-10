import { describe, expect, it } from 'vitest';
import {
  computeEducationalRisk,
  ELEVATED_FIVE_YEAR_THRESHOLD,
} from '../../worker/risk/simplifiedGail';

describe('computeEducationalRisk', () => {
  it('returns average branch for low-risk inputs', () => {
    const result = computeEducationalRisk({
      age: 40,
      ageAtMenarche: '>=14',
      ageAtFirstLiveBirth: '<20',
      firstDegreeRelatives: 0,
      priorBiopsies: 0,
      atypicalHyperplasia: 'no',
    });
    expect(result.riskBranch).toBe('average');
    expect(result.fiveYearRisk).toBeLessThan(ELEVATED_FIVE_YEAR_THRESHOLD);
    expect(result.calculatorInputs?.age).toBe(40);
  });

  it('returns elevated branch for high-risk inputs', () => {
    const result = computeEducationalRisk({
      age: 62,
      ageAtMenarche: '<12',
      ageAtFirstLiveBirth: 'never',
      firstDegreeRelatives: 2,
      priorBiopsies: 2,
      atypicalHyperplasia: 'yes',
    });
    expect(result.riskBranch).toBe('elevated');
    expect(result.fiveYearRisk).toBeGreaterThanOrEqual(ELEVATED_FIVE_YEAR_THRESHOLD);
  });
});
