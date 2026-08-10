import { useState, type FormEvent } from 'react';
import type {
  CalculatorInputs,
  FirstBirthBand,
  MenarcheBand,
  RiskBranch,
  YesNoUnknown,
} from '../types';

interface CalculatorScreenProps {
  onSubmitInputs: (inputs: CalculatorInputs) => void;
  onSelectScenario: (scenario: RiskBranch) => void;
  loading: boolean;
  error: string | null;
}

const DEFAULT_INPUTS: CalculatorInputs = {
  age: 45,
  ageAtMenarche: '12-13',
  ageAtFirstLiveBirth: '20-24',
  firstDegreeRelatives: 0,
  priorBiopsies: 0,
  atypicalHyperplasia: 'no',
};

export default function CalculatorScreen({
  onSubmitInputs,
  onSelectScenario,
  loading,
  error,
}: CalculatorScreenProps) {
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULT_INPUTS);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    onSubmitInputs(inputs);
  }

  return (
    <div className="card card--narrow card--calculator">
      <h1 className="title">Breast cancer risk assessment</h1>

      <p className="body-text">
        Answer a few questions used in Gail-style educational risk tools. You will
        receive a demonstration 5-year estimate and a short conversation about what
        it means. This is not the official NCI calculator and is not a medical
        diagnosis.
      </p>

      <form className="calculator-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Current age (35–85)</span>
          <input
            className="field-input"
            type="number"
            min={35}
            max={85}
            required
            value={inputs.age}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                age: Number.parseInt(e.target.value, 10) || 35,
              }))
            }
          />
        </label>

        <label className="field">
          <span className="field-label">Age at first menstrual period</span>
          <select
            className="field-input"
            value={inputs.ageAtMenarche}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                ageAtMenarche: e.target.value as MenarcheBand,
              }))
            }
          >
            <option value="<12">Under 12</option>
            <option value="12-13">12–13</option>
            <option value=">=14">14 or older</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Age at first live birth</span>
          <select
            className="field-input"
            value={inputs.ageAtFirstLiveBirth}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                ageAtFirstLiveBirth: e.target.value as FirstBirthBand,
              }))
            }
          >
            <option value="never">No live births</option>
            <option value="<20">Under 20</option>
            <option value="20-24">20–24</option>
            <option value="25-29">25–29</option>
            <option value=">=30">30 or older</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">First-degree relatives with breast cancer</span>
          <select
            className="field-input"
            value={inputs.firstDegreeRelatives}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                firstDegreeRelatives: Number(e.target.value) as 0 | 1 | 2,
              }))
            }
          >
            <option value={0}>None</option>
            <option value={1}>One</option>
            <option value={2}>Two or more</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Previous breast biopsies</span>
          <select
            className="field-input"
            value={inputs.priorBiopsies}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                priorBiopsies: Number(e.target.value) as 0 | 1 | 2,
              }))
            }
          >
            <option value={0}>None</option>
            <option value={1}>One</option>
            <option value={2}>Two or more</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Atypical hyperplasia on a biopsy</span>
          <select
            className="field-input"
            value={inputs.atypicalHyperplasia}
            disabled={loading}
            onChange={(e) =>
              setInputs((prev) => ({
                ...prev,
                atypicalHyperplasia: e.target.value as YesNoUnknown,
              }))
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
          Calculate and continue
        </button>
      </form>

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

      <details className="calculator-demo">
        <summary>Quick demo scenarios (testing)</summary>
        <p className="body-text">
          Skip the form and jump straight into an average or elevated conversation
          branch.
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
      </details>

      <p className="disclaimer-footnote">
        Educational demonstration only. Not a validated medical calculation or
        diagnosis.
      </p>
    </div>
  );
}
