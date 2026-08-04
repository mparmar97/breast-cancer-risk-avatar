import type { ChatDiagnostics } from '../types';

interface DeveloperPanelProps {
  diagnostics: ChatDiagnostics | null;
}

/**
 * Developer-only diagnostic panel. Shows the temporary conversational-state
 * estimates and dialogue strategy behind the most recent assistant reply.
 *
 * These are prototype heuristics for testing the dialogue engine, not
 * psychological or clinical assessments, and are never shown inside the
 * normal chat conversation.
 */
export default function DeveloperPanel({ diagnostics }: DeveloperPanelProps) {
  const autoOpen = Boolean(import.meta.env.DEV && diagnostics);

  return (
    <details className="dev-panel" open={autoOpen}>
      <summary className="dev-panel-summary">Developer details</summary>
      <div className="dev-panel-body">
        <p className="dev-panel-note">
          These are temporary conversational-state estimates for prototype testing. They are
          not psychological diagnoses.
        </p>

        {!diagnostics && (
          <p className="dev-panel-empty">Send a message to see diagnostic details here.</p>
        )}

        {diagnostics && (
          <dl className="dev-panel-grid">
            <dt>Understanding</dt>
            <dd>{diagnostics.adaptiveState.understanding}</dd>

            <dt>Emotion</dt>
            <dd>{diagnostics.adaptiveState.emotion}</dd>

            <dt>Barrier</dt>
            <dd>{diagnostics.adaptiveState.barrier}</dd>

            <dt>Self-efficacy</dt>
            <dd>{diagnostics.adaptiveState.selfEfficacy}</dd>

            <dt>Readiness</dt>
            <dd>{diagnostics.adaptiveState.readiness}</dd>

            <dt>Safety flag</dt>
            <dd>{diagnostics.adaptiveState.safetyFlag}</dd>

            <dt>Confidence</dt>
            <dd>{diagnostics.adaptiveState.confidence.toFixed(2)}</dd>

            <dt>Strategy</dt>
            <dd>{diagnostics.strategy}</dd>

            <dt>Theory</dt>
            <dd>{diagnostics.theoryConstruct.theory}</dd>

            <dt>Construct</dt>
            <dd>{diagnostics.theoryConstruct.construct}</dd>

            <dt>Communication technique</dt>
            <dd>{diagnostics.theoryConstruct.communicationTechnique}</dd>

            <dt>Objective</dt>
            <dd>{diagnostics.theoryConstruct.objective}</dd>

            <dt>Response mode</dt>
            <dd>{diagnostics.responseMode}</dd>
          </dl>
        )}
      </div>
    </details>
  );
}
