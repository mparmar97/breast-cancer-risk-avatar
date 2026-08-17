import type { ChatDiagnostics, ConfigStatus } from '../types';
import type { LiveAvatarDeveloperSnapshot } from '../liveavatar/types';

interface DeveloperPanelProps {
  diagnostics: ChatDiagnostics | null;
  configStatus: ConfigStatus | null;
  liveAvatar?: LiveAvatarDeveloperSnapshot | null;
}

function hasPlaceholderStatus(sources: ChatDiagnostics['sources'], dialogueDesignSources: ChatDiagnostics['dialogueDesignSources']): boolean {
  return (
    sources.some((source) => source.status === 'demo-placeholder') ||
    dialogueDesignSources.some((source) => source.status === 'demo-placeholder')
  );
}

function formatPendingItem(item: ChatDiagnostics['dialogueTurnPlan']['nextPendingItem']): string {
  if (!item || item.type === 'none') return '(none)';
  const label = item.text ?? item.option ?? '(unspecified)';
  return `${item.type}: ${label}`;
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('; ') : '(none)';
}

/**
 * Developer-only diagnostic panel for the general dynamic multi-turn
 * dialogue manager (see docs/GENERAL_DYNAMIC_DIALOGUE_MANAGER.md). Shows
 * Groq configuration status, the current-turn interpretation, the
 * deterministic state transition, dialogue policy/theory mapping, the
 * dialogue-turn plan, retrieved evidence source metadata, and
 * response-control diagnostics (repetition/progression validation) behind
 * the most recent assistant reply.
 *
 * These are prototype heuristics for testing the dialogue engine, not
 * psychological or clinical assessments, and are never shown inside the
 * normal chat conversation. Raw evidence text, prompts, hidden reasoning,
 * and the Groq API key are never rendered here or sent by the API — only
 * non-sensitive metadata (see worker/rag/types.ts and worker/llm/types.ts).
 *
 * Medical RAG evidence (`sources`) and dialogue-design/theory evidence
 * (`dialogueDesignSources`) are always rendered in separate sections and
 * are never merged — dialogue-design sources justify behavioral-theory
 * technique choices only and are never the factual basis for a reply.
 */
export default function DeveloperPanel({
  diagnostics,
  configStatus,
  liveAvatar = null,
}: DeveloperPanelProps) {
  const autoOpen = Boolean(import.meta.env.DEV && diagnostics);
  const sources = diagnostics?.sources ?? [];
  const dialogueDesignSources = diagnostics?.dialogueDesignSources ?? [];
  const usedEvidenceIds = diagnostics?.usedEvidenceIds ?? [];
  const interpretation = diagnostics?.currentTurnInterpretation;
  const currentTurnEvidence = diagnostics?.currentTurnEvidence;
  const resolvedShortReply = diagnostics?.resolvedShortReply;
  const transition = diagnostics?.stateTransition;
  const plan = diagnostics?.dialogueTurnPlan;

  const isDynamic = diagnostics?.responseMode === 'groq-dynamic-rag';
  const isFixedSafety = diagnostics?.responseMode === 'fixed-safety';

  return (
    <details className="dev-panel" open={autoOpen}>
      <summary className="dev-panel-summary">Developer details</summary>
      <div className="dev-panel-body">
        <p className="dev-panel-note">
          These are temporary conversational-state estimates for prototype testing. They are
          not psychological diagnoses, and neither the dynamic nor the local response mode is
          clinically validated.
        </p>

        <h3 className="dev-panel-heading">Configuration</h3>
        <dl className="dev-panel-grid">
          <dt>Groq configured</dt>
          <dd>{configStatus ? (configStatus.groqConfigured ? 'yes' : 'no') : 'unknown'}</dd>

          <dt>Configured model</dt>
          <dd>{configStatus?.groqModel ?? '(unknown)'}</dd>

          <dt>Dynamic mode available</dt>
          <dd>{configStatus ? (configStatus.dynamicModeAvailable ? 'yes' : 'no') : 'unknown'}</dd>
        </dl>

        <h3 className="dev-panel-heading">LIVEAVATAR DELIVERY</h3>
        <dl className="dev-panel-grid">
          <dt>Enabled</dt>
          <dd>
            {liveAvatar
              ? liveAvatar.enabled
                ? 'yes'
                : 'no'
              : configStatus?.liveAvatar
                ? configStatus.liveAvatar.enabled
                  ? 'yes'
                  : 'no'
                : 'unknown'}
          </dd>
          <dt>Configured</dt>
          <dd>
            {liveAvatar
              ? liveAvatar.configured
                ? 'yes'
                : 'no'
              : configStatus?.liveAvatar
                ? configStatus.liveAvatar.configured
                  ? 'yes'
                  : 'no'
                : 'unknown'}
          </dd>
          <dt>Mode</dt>
          <dd>{liveAvatar?.mode ?? (configStatus?.liveAvatar?.sandbox === false ? 'Production' : configStatus?.liveAvatar ? 'Sandbox' : 'unknown')}</dd>
          <dt>Avatar configured</dt>
          <dd>
            {liveAvatar
              ? liveAvatar.avatarConfigured
                ? 'yes'
                : 'no'
              : configStatus?.liveAvatar
                ? configStatus.liveAvatar.avatarConfigured
                  ? 'yes'
                  : 'no'
                : 'unknown'}
          </dd>
          <dt>API key</dt>
          <dd>server-side only</dd>
          <dt>API key exposed to client</dt>
          <dd>false</dd>
          <dt>Status</dt>
          <dd>{liveAvatar?.status ?? '(none)'}</dd>
          <dt>Session ID</dt>
          <dd>{liveAvatar?.sessionIdMasked || '(none)'}</dd>
          <dt>Session duration</dt>
          <dd>
            {liveAvatar
              ? `${String(Math.floor(liveAvatar.sessionDurationSeconds / 60)).padStart(2, '0')}:${String(
                  liveAvatar.sessionDurationSeconds % 60,
                ).padStart(2, '0')}`
              : '00:00'}
          </dd>
          <dt>Reconnect attempts</dt>
          <dd>{liveAvatar ? String(liveAvatar.reconnectAttempts) : '0'}</dd>
          <dt>Assistant turn ID</dt>
          <dd>{liveAvatar?.delivery?.assistantTurnId ?? '(none)'}</dd>
          <dt>Speech requested</dt>
          <dd>{liveAvatar?.delivery?.requested ? 'yes' : 'no'}</dd>
          <dt>TTS provider</dt>
          <dd>{liveAvatar?.ttsProvider ?? '(none)'}</dd>
          <dt>Browser TTS backup</dt>
          <dd>
            {liveAvatar?.browserTtsFallback?.active
              ? `active (${liveAvatar.browserTtsFallback.reason ?? 'other'}; voice=${liveAvatar.browserTtsFallback.voicePreference ?? 'unknown'})`
              : 'inactive'}
          </dd>
          <dt>Audio format</dt>
          <dd>{liveAvatar?.audioFormat ?? '(none)'}</dd>
          <dt>Speech started</dt>
          <dd>{liveAvatar?.delivery?.speechStarted ? 'yes' : 'no'}</dd>
          <dt>Speech completed</dt>
          <dd>{liveAvatar?.delivery?.speechCompleted ? 'yes' : 'no'}</dd>
          <dt>Interrupted</dt>
          <dd>{liveAvatar?.delivery?.interrupted ? 'yes' : 'no'}</dd>
          <dt>Adaptive state used</dt>
          <dd>{liveAvatar?.embodiment ? 'yes' : 'no'}</dd>
          <dt>Delivery tone</dt>
          <dd>{liveAvatar?.embodiment?.deliveryTone ?? '(none)'}</dd>
          <dt>Avatar expression cue</dt>
          <dd>{liveAvatar?.embodiment?.avatarExpression ?? '(none)'}</dd>
          <dt>Speaking pace</dt>
          <dd>{liveAvatar?.embodiment?.speakingPace ?? '(none)'}</dd>
          <dt>Applied voice speed</dt>
          <dd>
            {typeof liveAvatar?.appliedVoice?.speed === 'number'
              ? liveAvatar.appliedVoice.speed.toFixed(2)
              : liveAvatar?.embodiment?.speakingPace === 'slightly_slow'
                ? '0.80'
                : liveAvatar?.embodiment
                  ? '1.00'
                  : '(none)'}
          </dd>
          <dt>Applied voice style / stability</dt>
          <dd>
            {liveAvatar?.appliedVoice
              ? `${liveAvatar.appliedVoice.style.toFixed(2)} / ${liveAvatar.appliedVoice.stability.toFixed(2)}`
              : '(none)'}
          </dd>
          <dt>Facial-expression morph API</dt>
          <dd>{liveAvatar?.embodiment?.explicitFacialExpressionControlSupported ? 'yes' : 'no'}</dd>
          <dt>Gesture control supported</dt>
          <dd>{liveAvatar?.embodiment?.explicitGestureControlSupported ? 'yes' : 'no'}</dd>
          <dt>Prosody control supported</dt>
          <dd>
            {configStatus?.liveAvatar
              ? 'no'
              : liveAvatar
                ? 'no'
                : 'no'}
          </dd>
          <dt>Static avatar active</dt>
          <dd>{liveAvatar?.staticAvatarActive === false ? 'no' : 'yes'}</dd>
          <dt>Fallback reason</dt>
          <dd>{liveAvatar?.fallbackReason ?? configStatus?.liveAvatar?.missingReason ?? '(none)'}</dd>
          <dt>Permanent LiveAvatar API key sent to browser</dt>
          <dd>false</dd>
          <dt>Secret found in frontend bundle</dt>
          <dd>false</dd>
        </dl>

        {diagnostics && (
          <p className={isDynamic ? 'dev-panel-info' : 'dev-panel-note'}>
            {isFixedSafety
              ? 'Fixed safety response active — Groq was not called for this reply.'
              : isDynamic
                ? 'Dynamic Groq dialogue active — this reply came from Groq.'
                : `Local grounded fallback active — this reply did not use Groq${
                    diagnostics.fallbackReason
                      ? ` (reason: ${diagnostics.fallbackReason}${
                          diagnostics.providerExecution?.generationErrorCategory
                            ? ` / ${diagnostics.providerExecution.generationErrorCategory}`
                            : diagnostics.providerExecution?.generationValidationReason
                              ? ` / ${diagnostics.providerExecution.generationValidationReason}`
                              : ''
                        })`
                      : ''
                  }.`}
          </p>
        )}

        {!diagnostics && (
          <p className="dev-panel-empty">Send a message to see diagnostic details here.</p>
        )}

        {diagnostics && interpretation && resolvedShortReply && transition && plan && (
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

            <details className="dev-panel-subsection" open>
              <summary className="dev-panel-heading">Adaptive orchestration</summary>
              <p className="dev-panel-note">
                This panel shows temporary prototype estimates and orchestration decisions. It does
                not display psychological diagnoses or validated decisional-conflict scores.
              </p>
              <h4 className="dev-panel-subheading">Conversation interpretation</h4>
              <dl className="dev-panel-grid">
                <dt>Primary intent</dt>
                <dd>{interpretation.primaryIntent}</dd>
                <dt>Secondary intents</dt>
                <dd>
                  {interpretation.secondaryIntents.length > 0
                    ? interpretation.secondaryIntents.join(', ')
                    : '(none)'}
                </dd>
                <dt>Supporting phrases</dt>
                <dd>
                  intent: {currentTurnEvidence?.intent || '(none)'}; emotion:{' '}
                  {currentTurnEvidence?.emotion || '(none)'}; barrier:{' '}
                  {currentTurnEvidence?.barrier || '(none)'}
                </dd>
                <dt>Confidence</dt>
                <dd>{interpretation.confidence.toFixed(2)}</dd>
              </dl>

              <h4 className="dev-panel-subheading">Adaptive state</h4>
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
              </dl>

              <h4 className="dev-panel-subheading">Decision support</h4>
              <dl className="dev-panel-grid">
                <dt>Decision topic</dt>
                <dd>{diagnostics.decisionState?.decisionTopic ?? '(none)'}</dd>
                <dt>Decision stage</dt>
                <dd>{diagnostics.decisionState?.decisionStage ?? '(none)'}</dd>
                <dt>Primary decisional need</dt>
                <dd>{diagnostics.decisionState?.primaryDecisionalNeed ?? '(none)'}</dd>
                <dt>Secondary needs</dt>
                <dd>
                  {diagnostics.decisionState?.secondaryDecisionalNeeds?.length
                    ? diagnostics.decisionState.secondaryDecisionalNeeds.join(', ')
                    : '(none)'}
                </dd>
                <dt>Preferences</dt>
                <dd>
                  {diagnostics.decisionState?.expressedPreferences?.length
                    ? diagnostics.decisionState.expressedPreferences.join('; ')
                    : '(none)'}
                </dd>
                <dt>Selected option</dt>
                <dd>{diagnostics.decisionState?.selectedOption ?? '(none)'}</dd>
                <dt>Unresolved question</dt>
                <dd>{diagnostics.decisionState?.unresolvedQuestion ?? '(none)'}</dd>
              </dl>

              <h4 className="dev-panel-subheading">Theory</h4>
              <dl className="dev-panel-grid">
                <dt>Health-behavior / dialogue theory</dt>
                <dd>
                  {diagnostics.routingDiagnostics?.theoryApplication?.healthBehaviorTheory &&
                  diagnostics.routingDiagnostics.theoryApplication.healthBehaviorTheory !== 'none'
                    ? diagnostics.routingDiagnostics.theoryApplication.healthBehaviorTheory
                    : diagnostics.theoryConstruct.theory}
                </dd>
                <dt>Decision-support theory</dt>
                <dd>{diagnostics.decisionSupportTheoryConstruct?.theory ?? '(none)'}</dd>
                <dt>Construct</dt>
                <dd>
                  {diagnostics.routingDiagnostics?.theoryApplication?.construct &&
                  diagnostics.routingDiagnostics.theoryApplication.construct !== 'none'
                    ? diagnostics.routingDiagnostics.theoryApplication.construct
                    : diagnostics.theoryConstruct.construct}
                </dd>
                <dt>Communication objective</dt>
                <dd>
                  {diagnostics.routingDiagnostics?.theoryApplication?.communicationObjective ||
                    diagnostics.theoryConstruct.objective}
                </dd>
              </dl>

              <h4 className="dev-panel-subheading">Dialogue planning</h4>
              <dl className="dev-panel-grid">
                <dt>Primary dialogue goal</dt>
                <dd>{plan.primaryGoal}</dd>
                <dt>Decision-support goal</dt>
                <dd>{diagnostics.decisionSupportTurnPlan?.primaryGoal ?? '(none)'}</dd>
                <dt>Dialogue act</dt>
                <dd>{plan.dialogueAct}</dd>
                <dt>Must address</dt>
                <dd>{formatList(plan.mustAddress)}</dd>
                <dt>Must not assume</dt>
                <dd>{formatList(plan.mustNotAssume)}</dd>
              </dl>

              <h4 className="dev-panel-subheading">Evidence</h4>
              <dl className="dev-panel-grid">
                <dt>Retrieval query</dt>
                <dd>{diagnostics.retrievalQuery || '(none)'}</dd>
                <dt>Retrieved sources</dt>
                <dd>{sources.length > 0 ? sources.map((s) => s.id).join(', ') : '(none)'}</dd>
                <dt>Used evidence IDs</dt>
                <dd>{usedEvidenceIds.length > 0 ? usedEvidenceIds.join(', ') : '(none)'}</dd>
              </dl>

              <h4 className="dev-panel-subheading">Controls</h4>
              <dl className="dev-panel-grid">
                <dt>Safety override</dt>
                <dd>{diagnostics.safetyOverrideApplied ? 'yes' : 'no'}</dd>
                <dt>Answer-first / primary goal</dt>
                <dd>{diagnostics.primaryGoalSatisfied ? 'satisfied' : 'not satisfied'}</dd>
                <dt>Unsupported assumption</dt>
                <dd>{diagnostics.unsupportedAssumptionDetected ? 'detected' : 'none'}</dd>
                <dt>Repetition detected</dt>
                <dd>{diagnostics.repetitionDetected ? 'yes' : 'no'}</dd>
                <dt>Regeneration used</dt>
                <dd>{diagnostics.regenerationUsed ? 'yes' : 'no'}</dd>
                <dt>Local fallback</dt>
                <dd>{diagnostics.fallbackUsed || diagnostics.responseMode === 'local-rag-fallback' ? 'yes' : 'no'}</dd>
                <dt>Dialogue advanced</dt>
                <dd>{diagnostics.dialogueAdvanced ? 'yes' : 'no'}</dd>
                <dt>Decision need addressed</dt>
                <dd>{diagnostics.decisionNeedAddressed ? 'yes' : 'no'}</dd>
              </dl>
            </details>

            <h3 className="dev-panel-heading">Request propagation</h3>
            <dl className="dev-panel-grid">
              <dt>Turn ID</dt>
              <dd>{diagnostics.pipelineTrace?.turnId ?? diagnostics.turnRequest?.turnId ?? '(none)'}</dd>
              <dt>Latest message received</dt>
              <dd>
                {diagnostics.routingDiagnostics?.latestMessage ??
                  diagnostics.turnRequest?.latestMessage ??
                  diagnostics.semanticTurn?.explicitRequest ??
                  '(none)'}
              </dd>
              <dt>Present at safety</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtSafety ? 'yes' : 'no'}</dd>
              <dt>Present at classification</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtClassification ? 'yes' : 'no'}</dd>
              <dt>Present at routing</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtRouting ? 'yes' : 'no'}</dd>
              <dt>Present at planning</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtPlanning ? 'yes' : 'no'}</dd>
              <dt>Present at generation</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtGeneration ? 'yes' : 'no'}</dd>
              <dt>Present at validation</dt>
              <dd>{diagnostics.pipelineTrace?.latestMessagePresentAtValidation ? 'yes' : 'no'}</dd>
              <dt>Failed stage</dt>
              <dd>{diagnostics.pipelineTrace?.failedStage ?? '(none)'}</dd>
              <dt>Pipeline stages</dt>
              <dd>
                {(diagnostics.pipelineTrace?.stages ?? [])
                  .map((s) => `${s.stage}:${s.latestMessagePresent ? 'msg' : 'empty'}`)
                  .join(' → ') || '(none)'}
              </dd>
              <dt>Metadata consistency</dt>
              <dd>
                {diagnostics.metadataConsistency
                  ? diagnostics.metadataConsistency.valid
                    ? 'passed'
                    : `failed: ${(diagnostics.metadataConsistency.failures ?? []).join('; ')}`
                  : '(none)'}
              </dd>
            </dl>

            <h3 className="dev-panel-heading">Provider execution</h3>
            <dl className="dev-panel-grid">
              <dt>Classification attempted</dt>
              <dd>{diagnostics.pipelineTrace?.classificationProviderAttempted ? 'yes' : 'no'}</dd>
              <dt>Classification succeeded</dt>
              <dd>{diagnostics.pipelineTrace?.classificationProviderSucceeded ? 'yes' : 'no'}</dd>
              <dt>Classification error category</dt>
              <dd>
                {diagnostics.providerExecution?.classificationErrorCategory ??
                  diagnostics.pipelineTrace?.providerErrorCategory ??
                  '(none)'}
              </dd>
              <dt>Classification retry</dt>
              <dd>
                {typeof diagnostics.providerExecution?.retriesUsed === 'number'
                  ? String(diagnostics.providerExecution.retriesUsed)
                  : '(none)'}
              </dd>
              <dt>Generation attempted</dt>
              <dd>{diagnostics.pipelineTrace?.generationProviderAttempted ? 'yes' : 'no'}</dd>
              <dt>Generation succeeded</dt>
              <dd>{diagnostics.pipelineTrace?.generationProviderSucceeded ? 'yes' : 'no'}</dd>
              <dt>Generation error category</dt>
              <dd>{diagnostics.providerExecution?.generationErrorCategory ?? '(none)'}</dd>
              <dt>Provider failure stage</dt>
              <dd>{diagnostics.providerExecution?.providerFailureStage ?? '(none)'}</dd>
              <dt>Provider error category</dt>
              <dd>{diagnostics.providerExecution?.providerErrorCategory ?? '(none)'}</dd>
              <dt>Fallback selected</dt>
              <dd>
                {diagnostics.pipelineTrace?.generationFallbackUsed ||
                diagnostics.responseMode === 'local-rag-fallback'
                  ? 'yes'
                  : 'no'}
              </dd>
              <dt>Fallback route</dt>
              <dd>
                {diagnostics.dialogueRoute?.topic ??
                  diagnostics.routingDiagnostics?.topic ??
                  '(none)'}{' '}
                /{' '}
                {diagnostics.dialogueRoute?.primaryOperation ??
                  diagnostics.routingDiagnostics?.primaryOperation ??
                  '(none)'}
              </dd>
              <dt>Fallback reason</dt>
              <dd>{diagnostics.fallbackReason ?? diagnostics.routingDiagnostics?.fallbackReason ?? '(none)'}</dd>
              <dt>Generation validation reason</dt>
              <dd>{diagnostics.providerExecution?.generationValidationReason ?? '(none)'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Fallback validation</h3>
            <dl className="dev-panel-grid">
              <dt>Fallback response</dt>
              <dd>
                {diagnostics.responseMode === 'local-rag-fallback'
                  ? 'route-specific local fallback'
                  : diagnostics.responseMode ?? '(none)'}
              </dd>
              <dt>Explicit request answered</dt>
              <dd>{diagnostics.directQuestionAnswered ? 'yes' : 'no'}</dd>
              <dt>Assumptions detected</dt>
              <dd>
                {diagnostics.assumptionValidation
                  ? diagnostics.assumptionValidation.valid
                    ? 'none'
                    : (diagnostics.assumptionValidation.failedAssumptions ?? []).join('; ')
                  : '(none)'}
              </dd>
              <dt>Portal assumed</dt>
              <dd>
                {diagnostics.assumptionValidation?.patientPortalAssumed ||
                diagnostics.assumptionValidation?.portalAssumedWithoutMemory
                  ? 'yes'
                  : 'no'}
              </dd>
              <dt>Appointment assumed</dt>
              <dd>
                {diagnostics.assumptionValidation?.appointmentAssumed ||
                diagnostics.assumptionValidation?.appointmentAssumedWithoutMemory
                  ? 'yes'
                  : 'no'}
              </dd>
              <dt>Route fulfilled</dt>
              <dd>{diagnostics.primaryGoalSatisfied ? 'yes' : 'no'}</dd>
              <dt>Metadata consistent</dt>
              <dd>
                {diagnostics.metadataConsistency
                  ? diagnostics.metadataConsistency.valid
                    ? 'passed'
                    : 'failed'
                  : '(none)'}
              </dd>
              <dt>Assumption repair attempted</dt>
              <dd>{diagnostics.assumptionValidation?.repairAttempted ? 'yes' : 'no'}</dd>
              <dt>Direct question answered</dt>
              <dd>{diagnostics.directQuestionAnswered ? 'yes' : 'no'}</dd>
              <dt>Primary goal satisfied</dt>
              <dd>{diagnostics.primaryGoalSatisfied ? 'yes' : 'no'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Semantic turn</h3>
            <dl className="dev-panel-grid">
              <dt>Latest message</dt>
              <dd>
                {diagnostics.routingDiagnostics?.latestMessage ??
                  diagnostics.semanticTurn?.explicitRequest ??
                  '(none)'}
              </dd>
              <dt>Semantic topic</dt>
              <dd>{diagnostics.semanticTurn?.topic ?? diagnostics.requestInterpretation?.topic ?? '(none)'}</dd>
              <dt>Primary operation</dt>
              <dd>
                {diagnostics.semanticTurn?.primaryOperation ??
                  diagnostics.requestInterpretation?.operation ??
                  '(none)'}
              </dd>
              <dt>Secondary operations</dt>
              <dd>
                {(diagnostics.semanticTurn?.secondaryOperations ??
                  diagnostics.requestInterpretation?.secondaryOperations ??
                  []
                ).join(', ') || '(none)'}
              </dd>
              <dt>Stance</dt>
              <dd>{diagnostics.semanticTurn?.stance ?? '(none)'}</dd>
              <dt>Explicit request</dt>
              <dd>
                {diagnostics.semanticTurn?.explicitRequest ??
                  diagnostics.requestInterpretation?.explicitRequest ??
                  '(none)'}
              </dd>
              <dt>Requested output format</dt>
              <dd>
                {diagnostics.semanticTurn?.requestedOutputFormat ??
                  diagnostics.semanticTurn?.requestedFormat ??
                  diagnostics.requestInterpretation?.requestedOutputFormat ??
                  '(none)'}
              </dd>
              <dt>Understanding</dt>
              <dd>{diagnostics.semanticTurn?.understanding ?? '(none)'}</dd>
              <dt>Misunderstanding</dt>
              <dd>{diagnostics.semanticTurn?.misunderstanding ?? 'none'}</dd>
              <dt>Emotion / evidence</dt>
              <dd>
                {diagnostics.semanticTurn?.emotion ?? '(none)'} —{' '}
                {diagnostics.semanticTurn?.currentTurnEvidence?.emotion ??
                  diagnostics.semanticTurn?.evidence?.emotion ??
                  'not expressed'}
              </dd>
              <dt>Barrier / evidence</dt>
              <dd>
                {diagnostics.semanticTurn?.barrier ?? '(none)'} —{' '}
                {diagnostics.semanticTurn?.currentTurnEvidence?.barrier ??
                  diagnostics.semanticTurn?.evidence?.barrier ??
                  'not expressed'}
              </dd>
              <dt>Confidence</dt>
              <dd>{diagnostics.semanticTurn?.confidence ?? diagnostics.requestInterpretation?.confidence ?? '(none)'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Active information need</h3>
            <dl className="dev-panel-grid">
              <dt>Unresolved question</dt>
              <dd>
                {diagnostics.routingDiagnostics?.activeInformationNeed?.unresolvedQuestion || '(none)'}
              </dd>
              <dt>Requested information</dt>
              <dd>
                {(diagnostics.routingDiagnostics?.activeInformationNeed?.requestedInformation ?? []).join('; ') ||
                  '(none)'}
              </dd>
              <dt>Source required</dt>
              <dd>
                {diagnostics.routingDiagnostics?.activeInformationNeed?.sourceRequired ?? '(none)'}
              </dd>
              <dt>Resolved</dt>
              <dd>
                {diagnostics.routingDiagnostics?.activeInformationNeed
                  ? diagnostics.routingDiagnostics.activeInformationNeed.resolved
                    ? 'yes'
                    : 'no'
                  : '(none)'}
              </dd>
              <dt>Priority</dt>
              <dd>
                {diagnostics.routingDiagnostics?.activeInformationNeed?.currentTurnPriority ?? '(none)'}
              </dd>
            </dl>

            <h3 className="dev-panel-heading">Routing</h3>
            <dl className="dev-panel-grid">
              <dt>Latest message</dt>
              <dd>{diagnostics.routingDiagnostics?.latestMessage ?? '(none)'}</dd>
              <dt>Topic</dt>
              <dd>{diagnostics.routingDiagnostics?.topic ?? diagnostics.dialogueRoute?.topic ?? '(none)'}</dd>
              <dt>Primary operation</dt>
              <dd>
                {diagnostics.routingDiagnostics?.primaryOperation ??
                  diagnostics.dialogueRoute?.primaryOperation ??
                  '(none)'}
              </dd>
              <dt>Secondary operations</dt>
              <dd>
                {(diagnostics.routingDiagnostics?.secondaryOperations ??
                  diagnostics.dialogueRoute?.secondaryOperations ??
                  []
                ).join(', ') || '(none)'}
              </dd>
              <dt>Stance</dt>
              <dd>{diagnostics.routingDiagnostics?.stance ?? diagnostics.dialogueRoute?.stance ?? '(none)'}</dd>
              <dt>Explicit request</dt>
              <dd>
                {diagnostics.routingDiagnostics?.explicitRequest ??
                  diagnostics.dialogueRoute?.explicitRequest ??
                  '(none)'}
              </dd>
              <dt>Direct answer required</dt>
              <dd>
                {(diagnostics.routingDiagnostics?.directAnswerRequired ??
                  diagnostics.dialogueRoute?.directAnswerRequired)
                  ? 'yes'
                  : 'no'}
              </dd>
              <dt>Emotion evidence</dt>
              <dd>
                {diagnostics.routingDiagnostics?.emotion ?? '(none)'} —{' '}
                {diagnostics.routingDiagnostics?.emotionEvidence ?? 'not expressed'}
              </dd>
              <dt>Barrier evidence</dt>
              <dd>
                {diagnostics.routingDiagnostics?.barrier ?? '(none)'} —{' '}
                {diagnostics.routingDiagnostics?.barrierEvidence ?? 'not expressed'}
              </dd>
              <dt>Previous plan compatible</dt>
              <dd>{diagnostics.routingDiagnostics?.previousPlanCompatible ? 'yes' : 'no'}</dd>
              <dt>Previous plan discarded</dt>
              <dd>{diagnostics.routingDiagnostics?.previousPlanDiscarded ? 'yes' : 'no'}</dd>
              <dt>Discard reason</dt>
              <dd>{diagnostics.routingDiagnostics?.previousPlanDiscardReason ?? '(none)'}</dd>
              <dt>Selected information sources</dt>
              <dd>
                {(
                  diagnostics.routingDiagnostics?.selectedInformationSources ??
                  (diagnostics.routingDiagnostics?.selectedInformationSource
                    ? [diagnostics.routingDiagnostics.selectedInformationSource]
                    : [])
                ).join(', ') ||
                  diagnostics.dialogueRoute?.selectedInformationSource ||
                  '(none)'}
              </dd>
              <dt>Active response goal</dt>
              <dd>{diagnostics.routingDiagnostics?.activeResponseGoal ?? '(none)'}</dd>
              <dt>Route validation</dt>
              <dd>
                {diagnostics.routingDiagnostics?.routeValidation
                  ? JSON.stringify(diagnostics.routingDiagnostics.routeValidation)
                  : '(none)'}
              </dd>
              <dt>Response-route validation</dt>
              <dd>
                {diagnostics.routingDiagnostics?.responseRouteValidation
                  ? JSON.stringify(diagnostics.routingDiagnostics.responseRouteValidation)
                  : '(none)'}
              </dd>
              <dt>Repair attempted</dt>
              <dd>{diagnostics.routingDiagnostics?.repairAttempted ? 'yes' : 'no'}</dd>
              <dt>Fallback reason</dt>
              <dd>{diagnostics.routingDiagnostics?.fallbackReason ?? '(none)'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Theory application</h3>
            <dl className="dev-panel-grid">
              <dt>Health-behavior theory</dt>
              <dd>
                {diagnostics.routingDiagnostics?.theoryApplication?.healthBehaviorTheory ?? '(none)'}
              </dd>
              <dt>Communication theory</dt>
              <dd>
                {diagnostics.routingDiagnostics?.theoryApplication?.communicationTheory ?? '(none)'}
              </dd>
              <dt>Decision-support framework</dt>
              <dd>
                {diagnostics.routingDiagnostics?.theoryApplication?.decisionSupportFramework ?? '(none)'}
              </dd>
              <dt>Construct</dt>
              <dd>{diagnostics.routingDiagnostics?.theoryApplication?.construct ?? '(none)'}</dd>
              <dt>Communication objective</dt>
              <dd>
                {diagnostics.routingDiagnostics?.theoryApplication?.communicationObjective ?? '(none)'}
              </dd>
              <dt>Activation reason</dt>
              <dd>
                {diagnostics.routingDiagnostics?.theoryApplication?.activationReason ?? '(none)'}
              </dd>
            </dl>

            <h3 className="dev-panel-heading">Request interpretation</h3>
            <dl className="dev-panel-grid">
              <dt>Semantic topic</dt>
              <dd>{diagnostics.semanticTurn?.topic ?? diagnostics.requestInterpretation?.topic ?? '(none)'}</dd>
              <dt>Requested operation</dt>
              <dd>
                {diagnostics.semanticTurn?.primaryOperation ??
                  diagnostics.requestInterpretation?.operation ??
                  '(none)'}
              </dd>
              <dt>Explicit request</dt>
              <dd>
                {diagnostics.semanticTurn?.explicitRequest ??
                  diagnostics.requestInterpretation?.explicitRequest ??
                  '(none)'}
              </dd>
              <dt>User claims</dt>
              <dd>
                {diagnostics.semanticTurn?.propositions
                  ?.filter((p) => p.status === 'user_claim')
                  .map((p) => p.text)
                  .join('; ') || '(none)'}
              </dd>
              <dt>User constraints</dt>
              <dd>{diagnostics.semanticTurn?.userConstraints?.join('; ') || '(none)'}</dd>
              <dt>Understanding</dt>
              <dd>{diagnostics.semanticTurn?.understanding ?? '(none)'}</dd>
              <dt>Emotion evidence</dt>
              <dd>
                {diagnostics.semanticTurn?.emotion ?? '(none)'} —{' '}
                {diagnostics.semanticTurn?.currentTurnEvidence?.emotion ?? 'not expressed'}
              </dd>
              <dt>Barrier evidence</dt>
              <dd>
                {diagnostics.semanticTurn?.barrier ?? '(none)'} —{' '}
                {diagnostics.semanticTurn?.currentTurnEvidence?.barrier ?? 'not expressed'}
              </dd>
              <dt>Requires calculation</dt>
              <dd>{diagnostics.requestInterpretation?.requiresCalculation ? 'yes' : 'no'}</dd>
              <dt>Requires medical evidence</dt>
              <dd>{diagnostics.requestInterpretation?.requiresMedicalEvidence ? 'yes' : 'no'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Response execution</h3>
            <dl className="dev-panel-grid">
              <dt>Response goal</dt>
              <dd>{diagnostics.responsePlan?.primaryGoal ?? plan.primaryGoal}</dd>
              <dt>Direct-answer required</dt>
              <dd>{diagnostics.responsePlan?.directAnswerRequired ? 'yes' : 'no'}</dd>
              <dt>Required facts</dt>
              <dd>{formatList(diagnostics.responsePlan?.factsNeeded ?? [])}</dd>
              <dt>Deterministic calculation result</dt>
              <dd>
                {diagnostics.calculationResult
                  ? diagnostics.calculationResult.approximationText
                  : '(none)'}
              </dd>
              <dt>Retrieval query</dt>
              <dd>{diagnostics.retrievalQuery || '(none)'}</dd>
              <dt>Retrieved evidence</dt>
              <dd>{sources.length > 0 ? sources.map((s) => s.id).join(', ') : '(none)'}</dd>
              <dt>Initial generated response</dt>
              <dd>{diagnostics.initialGeneratedResponse ?? '(none / local path)'}</dd>
              <dt>Semantic validation failures</dt>
              <dd>
                {diagnostics.operationValidation
                  ? diagnostics.operationValidation.valid === false
                    ? [
                        diagnostics.operationValidation.reason,
                        ...(diagnostics.operationValidation.missingElements ?? []),
                      ]
                        .filter(Boolean)
                        .join('; ') || 'failed'
                    : 'none'
                  : '(none)'}
              </dd>
              <dt>Repair status</dt>
              <dd>{diagnostics.operationRepairAttempted ? 'attempted' : 'not needed'}</dd>
              <dt>Repaired response</dt>
              <dd>{diagnostics.repairedResponse ?? '(none)'}</dd>
              <dt>Generation mode</dt>
              <dd>{diagnostics.responseMode}</dd>
              <dt>Fallback status</dt>
              <dd>
                {diagnostics.fallbackUsed || diagnostics.responseMode === 'local-rag-fallback'
                  ? diagnostics.fallbackReason ?? 'local fallback'
                  : 'not used'}
              </dd>
            </dl>

            <h3 className="dev-panel-heading">Current turn</h3>
            <dl className="dev-panel-grid">
              <dt>Primary intent</dt>
              <dd>{interpretation.primaryIntent}</dd>

              <dt>Secondary intents</dt>
              <dd>{interpretation.secondaryIntents.length > 0 ? interpretation.secondaryIntents.join(', ') : '(none)'}</dd>

              <dt>Short-reply type</dt>
              <dd>{interpretation.shortReplyType}</dd>

              <dt>Resolved short-reply meaning</dt>
              <dd>{resolvedShortReply.resolvedMeaning ?? '(none)'}</dd>

              <dt>Requires clarification</dt>
              <dd>{resolvedShortReply.requiresClarification ? 'yes' : 'no'}</dd>

              <dt>Classification confidence</dt>
              <dd>{interpretation.confidence.toFixed(2)}</dd>

              <dt>Classification consistency</dt>
              <dd>{diagnostics.classificationConsistency}</dd>

              <dt>Classification repair used</dt>
              <dd>{diagnostics.classificationRepairUsed ? 'yes' : 'no'}</dd>

              <dt>Classification mode</dt>
              <dd>{diagnostics.classificationMode}</dd>
            </dl>

            {currentTurnEvidence && (
              <>
                <p className="dev-panel-query-label">Supporting phrases (rationale, not a label):</p>
                <dl className="dev-panel-grid">
                  <dt>Intent</dt>
                  <dd>{currentTurnEvidence.intent || '(not expressed)'}</dd>

                  <dt>Understanding</dt>
                  <dd>{currentTurnEvidence.understanding || '(not expressed)'}</dd>

                  <dt>Emotion</dt>
                  <dd>{currentTurnEvidence.emotion || '(not expressed)'}</dd>

                  <dt>Barrier</dt>
                  <dd>{currentTurnEvidence.barrier || '(not expressed)'}</dd>

                  <dt>Self-efficacy</dt>
                  <dd>{currentTurnEvidence.selfEfficacy || '(not expressed)'}</dd>

                  <dt>Readiness</dt>
                  <dd>{currentTurnEvidence.readiness || '(not expressed)'}</dd>

                  <dt>Safety flag</dt>
                  <dd>{currentTurnEvidence.safetyFlag || '(not expressed)'}</dd>
                </dl>
              </>
            )}

            <h3 className="dev-panel-heading">State transition</h3>
            <dl className="dev-panel-grid">
              <dt>Understanding (prev → current)</dt>
              <dd>{transition.previousUnderstanding} → {transition.currentUnderstanding}</dd>

              <dt>Emotion (prev → current)</dt>
              <dd>{transition.previousEmotion} → {transition.currentEmotion}</dd>

              <dt>Barrier (prev → current)</dt>
              <dd>{transition.previousBarrier} → {transition.currentBarrier}</dd>

              <dt>Barrier cleared</dt>
              <dd>{transition.barrierCleared ? 'yes' : 'no'}</dd>

              <dt>Understanding changed</dt>
              <dd>{transition.understandingChanged ? 'yes' : 'no'}</dd>

              <dt>Self-efficacy (prev → current)</dt>
              <dd>{transition.previousSelfEfficacy} → {transition.currentSelfEfficacy}</dd>

              <dt>Readiness (prev → current)</dt>
              <dd>{transition.previousReadiness} → {transition.currentReadiness}</dd>

              <dt>State changed</dt>
              <dd>{transition.stateChanged ? 'yes' : 'no'}</dd>

              <dt>Changed fields</dt>
              <dd>{formatList(transition.changedFields)}</dd>

              <dt>Overall confidence</dt>
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

              <dt>Communication objective</dt>
              <dd>{diagnostics.theoryConstruct.objective}</dd>

              <dt>Strategy repeated</dt>
              <dd>{diagnostics.strategyRepeated ? 'yes' : 'no'}</dd>

              <dt>Progression applied</dt>
              <dd>{diagnostics.strategyProgressionApplied ? 'yes' : 'no'}</dd>
            </dl>

            <h3 className="dev-panel-heading">Dialogue plan</h3>
            <dl className="dev-panel-grid">
              <dt>Primary goal</dt>
              <dd>{plan.primaryGoal}</dd>

              <dt>Secondary goal</dt>
              <dd>{plan.secondaryGoal ?? '(none)'}</dd>

              <dt>Assistant dialogue act</dt>
              <dd>{plan.dialogueAct}</dd>

              <dt>Must address</dt>
              <dd>{formatList(plan.mustAddress)}</dd>

              <dt>Must not assume</dt>
              <dd>{formatList(plan.mustNotAssume)}</dd>

              <dt>Should ask question</dt>
              <dd>{plan.shouldAskQuestion ? 'yes' : 'no'}</dd>

              <dt>Question purpose</dt>
              <dd>{plan.questionPurpose ?? 'none'}</dd>

              <dt>Pending conversational item</dt>
              <dd>{formatPendingItem(plan.nextPendingItem)}</dd>
            </dl>

            <h3 className="dev-panel-heading">RAG — medical evidence</h3>
            <p className="dev-panel-query">
              <span className="dev-panel-query-label">Retrieval query:</span>{' '}
              {diagnostics.retrievalQuery || '(none)'}
            </p>
            <p className="dev-panel-query">
              <span className="dev-panel-query-label">Used evidence IDs:</span>{' '}
              {usedEvidenceIds.length > 0 ? usedEvidenceIds.join(', ') : '(none)'}
            </p>

            {sources.length === 0 && (
              <p className="dev-panel-empty">No relevant medical evidence was retrieved for this reply.</p>
            )}

            {sources.length > 0 && (
              <ul className="dev-panel-sources">
                {sources.map((source) => (
                  <li key={source.id} className="dev-panel-source">
                    <p className="dev-panel-source-title">
                      {source.title}
                      {usedEvidenceIds.includes(source.id) ? ' (used)' : ''}
                    </p>
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

            <h3 className="dev-panel-heading">Response control</h3>
            <dl className="dev-panel-grid">
              <dt>Response mode</dt>
              <dd>{diagnostics.responseMode}</dd>

              <dt>Groq model</dt>
              <dd>{diagnostics.groqModel || '(none)'}</dd>

              <dt>Repetition detected</dt>
              <dd>{diagnostics.repetitionDetected ? 'yes' : 'no'}</dd>

              <dt>Similarity score</dt>
              <dd>{diagnostics.similarityScore.toFixed(3)}</dd>

              <dt>Repeated dialogue move</dt>
              <dd>{diagnostics.repeatedDialogueMove ?? '(none)'}</dd>

              <dt>Regeneration used</dt>
              <dd>{diagnostics.regenerationUsed ? 'yes' : 'no'}</dd>

              <dt>Dialogue advanced</dt>
              <dd>{diagnostics.dialogueAdvanced ? 'yes' : 'no'}</dd>

              <dt>Primary goal satisfied</dt>
              <dd>{diagnostics.primaryGoalSatisfied ? 'yes' : 'no'}</dd>

              <dt>Unsupported assumption detected</dt>
              <dd>{diagnostics.unsupportedAssumptionDetected ? 'yes' : 'no'}</dd>

              <dt>Resolved issue repeated</dt>
              <dd>{diagnostics.resolvedIssueRepeated ? 'yes' : 'no'}</dd>

              <dt>Short reply resolved</dt>
              <dd>{diagnostics.shortReplyResolved ? 'yes' : 'no'}</dd>

              <dt>Resolved meaning</dt>
              <dd>{diagnostics.resolvedMeaning ?? '(none)'}</dd>

              <dt>Understanding changed</dt>
              <dd>{diagnostics.understandingChanged ? 'yes' : 'no'}</dd>

              <dt>Repeated explanation detected</dt>
              <dd>{diagnostics.repeatedExplanationDetected ? 'yes' : 'no'}</dd>

              <dt>Practical request fulfilled</dt>
              <dd>{diagnostics.practicalRequestFulfilled ? 'yes' : 'no'}</dd>

              <dt>User correction handled</dt>
              <dd>{diagnostics.userCorrectionHandled ? 'yes' : 'no'}</dd>

              <dt>Direct question answered</dt>
              <dd>{diagnostics.directQuestionAnswered ? 'yes' : 'no'}</dd>

              <dt>Local fallback used</dt>
              <dd>{diagnostics.responseMode === 'local-rag-fallback' ? 'yes' : 'no'}</dd>

              <dt>Fallback reason</dt>
              <dd>{diagnostics.fallbackReason ?? '(none)'}</dd>
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
