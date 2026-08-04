import type { ChangeEvent } from 'react';
import HealthStatus from './HealthStatus';

interface ConsentScreenProps {
  consentGiven: boolean;
  onConsentChange: (value: boolean) => void;
  onContinue: () => void;
}

export default function ConsentScreen({
  consentGiven,
  onConsentChange,
  onContinue,
}: ConsentScreenProps) {
  function handleCheckboxChange(event: ChangeEvent<HTMLInputElement>) {
    onConsentChange(event.target.checked);
  }

  return (
    <div className="card card--narrow">
      <h1 className="title">VARE Breast-Cancer Risk Avatar Prototype</h1>

      <p className="body-text">
        This is a research prototype that demonstrates how a conversational guide
        could help explain a breast-cancer risk estimate using a demonstration
        calculator and a scripted chat assistant.
      </p>

      <div className="disclaimer" role="note" aria-label="Medical disclaimer">
        <p className="disclaimer-title">Medical disclaimer</p>
        <ul className="disclaimer-list">
          <li>This assistant is <strong>not a clinician</strong>.</li>
          <li>It <strong>cannot diagnose</strong> breast cancer or any other condition.</li>
          <li>It <strong>cannot recommend treatment</strong> of any kind.</li>
          <li>All risk results shown are demonstration data, not validated medical calculations.</li>
        </ul>
      </div>

      <div className="consent-control">
        <input
          type="checkbox"
          id="consent-checkbox"
          className="checkbox"
          checked={consentGiven}
          onChange={handleCheckboxChange}
        />
        <label htmlFor="consent-checkbox" className="consent-label">
          I understand this is a demonstration prototype, not medical advice, and I
          consent to continue.
        </label>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--full"
        disabled={!consentGiven}
        onClick={onContinue}
      >
        Continue
      </button>

      <HealthStatus />
    </div>
  );
}
