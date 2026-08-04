import type { RiskBranch } from '../types';

interface CalculatorScreenProps {
  onSelectScenario: (scenario: RiskBranch) => void;
  loading: boolean;
  error: string | null;
}

export default function CalculatorScreen({
  onSelectScenario,
  loading,
  error,
}: CalculatorScreenProps) {
  return (
    <div className="card card--narrow">
      <h1 className="title">Mock Risk Calculator</h1>

      <p className="body-text">
        Choose a demonstration scenario below. These are fixed sample results used
        to preview how the chat guide responds — they are not real risk
        calculations.
      </p>

      <div className="button-stack">
        <button
          type="button"
          className="btn btn--secondary btn--full"
          disabled={loading}
          onClick={() => onSelectScenario('average')}
        >
          Test average-risk branch
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--full"
          disabled={loading}
          onClick={() => onSelectScenario('elevated')}
        >
          Test elevated-risk branch
        </button>
      </div>

      {loading && (
        <p className="status-meta" role="status">
          Calculating demonstration result…
        </p>
      )}

      {error && (
        <p className="status-meta status-meta--error" role="alert">
          {error}
        </p>
      )}

      <p className="disclaimer-footnote">
        Demonstration result only. This is not a validated medical calculation.
      </p>
    </div>
  );
}
