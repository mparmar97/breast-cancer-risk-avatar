import type { RiskBranch, RiskResult } from './types';

const DEMONSTRATION_DISCLAIMER =
  'Demonstration result only. This is not a validated medical calculation.';

const MOCK_RESULTS: Record<RiskBranch, RiskResult> = {
  average: {
    model: 'Mock Demonstration Calculator',
    fiveYearRisk: 1.1,
    riskHorizon: '5 years',
    riskBranch: 'average',
    disclaimer: DEMONSTRATION_DISCLAIMER,
  },
  elevated: {
    model: 'Mock Demonstration Calculator',
    fiveYearRisk: 3.2,
    riskHorizon: '5 years',
    riskBranch: 'elevated',
    disclaimer: DEMONSTRATION_DISCLAIMER,
  },
};

export function isRiskBranch(value: unknown): value is RiskBranch {
  return value === 'average' || value === 'elevated';
}

export function getMockRiskResult(scenario: RiskBranch): RiskResult {
  return MOCK_RESULTS[scenario];
}
