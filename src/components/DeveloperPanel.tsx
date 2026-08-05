import type { ChatDiagnostics } from '../types';

interface DeveloperPanelProps {
  diagnostics: ChatDiagnostics | null;
}

function hasPlaceholderStatus(sources: ChatDiagnostics['sources'], dialogueDesignSources: ChatDiagnostics['dialogueDesignSources']): boolean {
  return (
    sources.some((source) => source.status === 'demo-placeholder') ||
    dialogueDesignSources.some((source) => source.status === 'demo-placeholder')
  );
}

/**
 * Developer-only diagnostic panel. Shows the temporary conversational-state
 * estimates, dialogue strategy, and retrieved evidence source metadata
 * behind the most recent assistant reply.
 *
 * These are prototype heuristics for testing the dialogue engine, not
 * psychological or clinical assessments, and are never shown inside the
 * normal chat conversation. Raw evidence text is never rendered here or
 * sent by the API — only non-sensitive source metadata (see
 * worker/rag/types.ts and docs/EVIDENCE_REGISTER.md).
 *
 * Medical RAG evidence (`sources`) and dialogue-design/theory evidence
 * (`dialogueDesignSources`) are always rendered in separate sections and
 * are never merged — dialogue-design sources justify behavioral-theory
 * technique choices only and are never the factual basis for a reply.
 */
export default function DeveloperPanel({ diagnostics }: DeveloperPanelProps) {
  const autoOpen = Boolean(import.meta.env.DEV && diagnostics);
  const sources = diagnostics?.sources ?? [];
  const dialogueDesignSources = diagnostics?.dialogueDesignSources ?? [];

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
          <>
            {hasPlaceholderStatus(sources, dialogueDesignSources) ? (
              <p className="dev-panel-warning">
                Current evidence includes prototype placeholders. Replace them with vetted sources
                before final submission.
              </p>
            ) : (
              <p className="dev-panel-info">
                Evidence collection: all active entries are marked as vetted and include source
                metadata. Human review is still required before clinical use.
              </p>
            )}

            <h3 className="dev-panel-heading">Adaptive state</h3>
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
            </dl>

            <h3 className="dev-panel-heading">Dialogue policy</h3>
            <dl className="dev-panel-grid">
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
            </dl>

            <h3 className="dev-panel-heading">Retrieval (RAG) — medical evidence</h3>
            <p className="dev-panel-query">
              <span className="dev-panel-query-label">Retrieval query:</span>{' '}
              {diagnostics.retrievalQuery || '(none)'}
            </p>

            {sources.length === 0 && (
              <p className="dev-panel-empty">No relevant medical evidence was retrieved for this reply.</p>
            )}

            {sources.length > 0 && (
              <ul className="dev-panel-sources">
                {sources.map((source) => (
                  <li key={source.id} className="dev-panel-source">
                    <p className="dev-panel-source-title">{source.title}</p>
                    <dl className="dev-panel-grid">
                      <dt>Organization</dt>
                      <dd>{source.organization}</dd>

                      <dt>Section</dt>
                      <dd>{source.section}</dd>

                      <dt>Topic</dt>
                      <dd>{source.topic}</dd>

                      <dt>Similarity score</dt>
                      <dd>{source.score.toFixed(3)}</dd>

                      <dt>Status</dt>
                      <dd>{source.status}</dd>

                      <dt>Source type</dt>
                      <dd>{source.sourceType}</dd>

                      <dt>Source URL</dt>
                      <dd>
                        <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                          {source.sourceUrl}
                        </a>
                      </dd>

                      <dt>Citation</dt>
                      <dd>{source.citation}</dd>
                    </dl>
                    {source.clinicalUseRestriction && (
                      <p className="dev-panel-restriction">
                        <strong>Clinical-use restriction:</strong> {source.clinicalUseRestriction}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="dev-panel-heading">Dialogue-design evidence (theory support)</h3>
            <p className="dev-panel-note">
              These sources justify the behavioral-theory and communication-technique choices
              above. They are design rationale only and are never used as medical support for a
              reply.
            </p>

            {dialogueDesignSources.length === 0 && (
              <p className="dev-panel-empty">No dialogue-design evidence is linked to this strategy.</p>
            )}

            {dialogueDesignSources.length > 0 && (
              <ul className="dev-panel-sources">
                {dialogueDesignSources.map((source) => (
                  <li key={source.id} className="dev-panel-source dev-panel-source-theory">
                    <p className="dev-panel-source-title">{source.title}</p>
                    <dl className="dev-panel-grid">
                      <dt>Source ID</dt>
                      <dd>{source.sourceId}</dd>

                      <dt>Theory/communication role</dt>
                      <dd>{source.topic}</dd>

                      <dt>Organization</dt>
                      <dd>{source.organization}</dd>

                      <dt>Status</dt>
                      <dd>{source.status}</dd>

                      <dt>Citation</dt>
                      <dd>{source.citation}</dd>
                    </dl>
                    {source.researchLimitation && (
                      <p className="dev-panel-restriction">
                        <strong>Research limitation:</strong> {source.researchLimitation}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="dev-panel-heading">Response</h3>
            <dl className="dev-panel-grid">
              <dt>Response mode</dt>
              <dd>{diagnostics.responseMode}</dd>
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
