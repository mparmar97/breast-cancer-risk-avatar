import type {
  ChatDiagnostics,
  CurrentTurnInterpretation,
  DialogueTurnPlan,
  ResolvedShortReply,
  SessionData,
  StateTransitionMetadata,
} from '../types';

const STORAGE_KEY = 'vare.session.v1';

const EMPTY_CURRENT_TURN_EVIDENCE = {
  intent: '',
  understanding: '',
  emotion: '',
  barrier: '',
  selfEfficacy: '',
  readiness: '',
  safetyFlag: '',
};

function normalizeCurrentTurnInterpretation(value: unknown, adaptiveState: ChatDiagnostics['adaptiveState']): CurrentTurnInterpretation {
  const candidate = (value ?? {}) as Partial<CurrentTurnInterpretation>;
  return {
    primaryIntent: candidate.primaryIntent ?? 'unclear',
    secondaryIntents: Array.isArray(candidate.secondaryIntents) ? candidate.secondaryIntents : [],
    understanding: candidate.understanding ?? adaptiveState.understanding,
    emotion: candidate.emotion ?? adaptiveState.emotion,
    barrier: candidate.barrier ?? adaptiveState.barrier,
    selfEfficacy: candidate.selfEfficacy ?? adaptiveState.selfEfficacy,
    readiness: candidate.readiness ?? adaptiveState.readiness,
    safetyFlag: candidate.safetyFlag ?? adaptiveState.safetyFlag,
    currentTurnEvidence: candidate.currentTurnEvidence ?? EMPTY_CURRENT_TURN_EVIDENCE,
    refersToPreviousAssistantTurn: candidate.refersToPreviousAssistantTurn ?? false,
    shortReplyType: candidate.shortReplyType ?? 'not_short_reply',
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : adaptiveState.confidence,
  };
}

function normalizeResolvedShortReply(value: unknown): ResolvedShortReply {
  const candidate = (value ?? {}) as Partial<ResolvedShortReply>;
  return {
    isShortReply: candidate.isShortReply ?? false,
    shortReplyType: candidate.shortReplyType ?? 'not_short_reply',
    resolvedMeaning: candidate.resolvedMeaning,
    overridePrimaryIntent: candidate.overridePrimaryIntent,
    overrideSelfEfficacy: candidate.overrideSelfEfficacy,
    overrideReadiness: candidate.overrideReadiness,
    overrideBarrier: candidate.overrideBarrier,
    requiresClarification: candidate.requiresClarification ?? false,
  };
}

function normalizeStateTransition(value: unknown, adaptiveState: ChatDiagnostics['adaptiveState']): StateTransitionMetadata {
  const candidate = (value ?? {}) as Partial<StateTransitionMetadata>;
  return {
    previousUnderstanding: candidate.previousUnderstanding ?? adaptiveState.understanding,
    currentUnderstanding: candidate.currentUnderstanding ?? adaptiveState.understanding,
    understandingChanged: candidate.understandingChanged ?? false,
    previousEmotion: candidate.previousEmotion ?? adaptiveState.emotion,
    currentEmotion: candidate.currentEmotion ?? adaptiveState.emotion,
    previousBarrier: candidate.previousBarrier ?? adaptiveState.barrier,
    currentBarrier: candidate.currentBarrier ?? adaptiveState.barrier,
    barrierCleared: candidate.barrierCleared ?? false,
    previousSelfEfficacy: candidate.previousSelfEfficacy ?? adaptiveState.selfEfficacy,
    currentSelfEfficacy: candidate.currentSelfEfficacy ?? adaptiveState.selfEfficacy,
    previousReadiness: candidate.previousReadiness ?? adaptiveState.readiness,
    currentReadiness: candidate.currentReadiness ?? adaptiveState.readiness,
    stateChanged: candidate.stateChanged ?? false,
    changedFields: Array.isArray(candidate.changedFields) ? candidate.changedFields : [],
    barrierUnmentionedTurns: typeof candidate.barrierUnmentionedTurns === 'number' ? candidate.barrierUnmentionedTurns : 0,
  };
}

function normalizeDialogueTurnPlan(value: unknown): DialogueTurnPlan {
  const candidate = (value ?? {}) as Partial<DialogueTurnPlan>;
  return {
    primaryGoal: candidate.primaryGoal ?? 'answer_question',
    secondaryGoal: candidate.secondaryGoal,
    dialogueAct: candidate.dialogueAct ?? 'none',
    mustAddress: Array.isArray(candidate.mustAddress) ? candidate.mustAddress : [],
    mustNotRepeat: Array.isArray(candidate.mustNotRepeat) ? candidate.mustNotRepeat : [],
    mustNotAssume: Array.isArray(candidate.mustNotAssume) ? candidate.mustNotAssume : [],
    alreadyResolved: Array.isArray(candidate.alreadyResolved) ? candidate.alreadyResolved : [],
    selectedOption: candidate.selectedOption,
    acceptedDraft: candidate.acceptedDraft,
    unresolvedNeed: candidate.unresolvedNeed,
    resolvedUserDevelopment: candidate.resolvedUserDevelopment,
    shouldAskQuestion: candidate.shouldAskQuestion ?? false,
    questionPurpose: candidate.questionPurpose,
    nextPendingItem: candidate.nextPendingItem,
  };
}

/**
 * Normalizes a stored `latestDiagnostics` value, filling in defaults for
 * fields introduced after the value may have been written (e.g. Phase 3
 * sessions predate `retrievalQuery`/`sources`, added in Phase 4; pre-general-
 * dialogue-manager sessions predate `currentTurnInterpretation`/
 * `stateTransition`/`dialogueTurnPlan`, added afterward). Returns null for
 * anything that isn't at least a recognizable diagnostics object.
 */
function normalizeDiagnostics(value: unknown): ChatDiagnostics | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ChatDiagnostics>;
  if (!candidate.adaptiveState || !candidate.strategy || !candidate.theoryConstruct) {
    return null;
  }

  return {
    adaptiveState: candidate.adaptiveState,
    previousAdaptiveState: candidate.previousAdaptiveState ?? null,
    decisionState: candidate.decisionState ?? null,
    previousDecisionState: candidate.previousDecisionState ?? null,
    conversationMemory: candidate.conversationMemory ?? null,
    previousConversationMemory: candidate.previousConversationMemory ?? null,
    decisionTransition: candidate.decisionTransition ?? null,
    decisionSupportStrategy: candidate.decisionSupportStrategy ?? null,
    decisionSupportTheoryConstruct: candidate.decisionSupportTheoryConstruct ?? null,
    decisionSupportTurnPlan: candidate.decisionSupportTurnPlan ?? null,
    currentTurnEvidence: candidate.currentTurnEvidence ?? EMPTY_CURRENT_TURN_EVIDENCE,
    currentTurnInterpretation: normalizeCurrentTurnInterpretation(candidate.currentTurnInterpretation, candidate.adaptiveState),
    requestInterpretation: candidate.requestInterpretation ?? null,
    resolvedShortReply: normalizeResolvedShortReply(candidate.resolvedShortReply),
    stateTransition: normalizeStateTransition(candidate.stateTransition, candidate.adaptiveState),
    strategy: candidate.strategy,
    theoryConstruct: candidate.theoryConstruct,
    dialogueTurnPlan: normalizeDialogueTurnPlan(candidate.dialogueTurnPlan),
    retrievalQuery: typeof candidate.retrievalQuery === 'string' ? candidate.retrievalQuery : '',
    calculationResult: candidate.calculationResult ?? null,
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    dialogueDesignSources: Array.isArray(candidate.dialogueDesignSources) ? candidate.dialogueDesignSources : [],
    usedEvidenceIds: Array.isArray(candidate.usedEvidenceIds) ? candidate.usedEvidenceIds : [],
    initialGeneratedResponse: candidate.initialGeneratedResponse ?? null,
    repairedResponse: candidate.repairedResponse ?? null,
    operationValidation: candidate.operationValidation ?? null,
    operationRepairAttempted: candidate.operationRepairAttempted ?? false,
    classificationMode: candidate.classificationMode ?? 'local-fallback',
    responseMode: candidate.responseMode ?? 'local-rag-fallback',
    groqModel: typeof candidate.groqModel === 'string' ? candidate.groqModel : '',
    classificationConsistency: candidate.classificationConsistency ?? 'fallback',
    classificationRepairUsed: candidate.classificationRepairUsed ?? false,
    strategyRepeated: candidate.strategyRepeated ?? false,
    strategyProgressionApplied: candidate.strategyProgressionApplied ?? false,
    repetitionDetected: candidate.repetitionDetected ?? false,
    regenerationUsed: candidate.regenerationUsed ?? false,
    similarityScore: typeof candidate.similarityScore === 'number' ? candidate.similarityScore : 0,
    repeatedDialogueMove: candidate.repeatedDialogueMove ?? null,
    dialogueAdvanced: candidate.dialogueAdvanced ?? true,
    primaryGoalSatisfied: candidate.primaryGoalSatisfied ?? true,
    decisionNeedAddressed: candidate.decisionNeedAddressed ?? true,
    unsupportedAssumptionDetected: candidate.unsupportedAssumptionDetected ?? false,
    resolvedIssueRepeated: candidate.resolvedIssueRepeated ?? false,
    directQuestionAnswered: candidate.directQuestionAnswered ?? true,
    shortReplyResolved: candidate.shortReplyResolved ?? false,
    resolvedMeaning: typeof candidate.resolvedMeaning === 'string' ? candidate.resolvedMeaning : null,
    understandingChanged: candidate.understandingChanged ?? candidate.stateTransition?.understandingChanged ?? false,
    repeatedExplanationDetected: candidate.repeatedExplanationDetected ?? false,
    practicalRequestFulfilled: candidate.practicalRequestFulfilled ?? true,
    userCorrectionHandled: candidate.userCorrectionHandled ?? true,
    recentStrategies: Array.isArray(candidate.recentStrategies) ? candidate.recentStrategies : [],
    safetyOverrideApplied: candidate.safetyOverrideApplied ?? false,
    fallbackUsed: candidate.fallbackUsed ?? candidate.responseMode === 'local-rag-fallback',
    orchestrationValidation: candidate.orchestrationValidation ?? null,
    innovationMetadata: candidate.innovationMetadata ?? null,
    fallbackReason: candidate.fallbackReason,
    routingDiagnostics: candidate.routingDiagnostics ?? null,
    dialogueRoute: candidate.dialogueRoute ?? null,
    turnRequest: candidate.turnRequest ?? null,
    pipelineTrace: candidate.pipelineTrace ?? null,
    providerExecution: candidate.providerExecution ?? null,
    assumptionValidation: candidate.assumptionValidation ?? null,
    metadataConsistency: candidate.metadataConsistency ?? null,
  };
}

export function createEmptySession(): SessionData {
  const now = new Date().toISOString();
  return {
    consentGiven: false,
    screen: 'consent',
    riskResult: null,
    messages: [],
    latestDiagnostics: null,
    createdAt: now,
    updatedAt: now,
    conversationStartedAt: null,
  };
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadSession(): SessionData {
  if (!hasLocalStorage()) {
    return createEmptySession();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptySession();
    }
    const parsed = JSON.parse(raw) as Partial<SessionData> | null;
    if (!parsed || typeof parsed !== 'object') {
      return createEmptySession();
    }

    // Defensive merge: older or corrupted sessions may be missing newer
    // fields (e.g. latestDiagnostics, added in Phase 3) or have malformed
    // values for existing ones. Any field absent or invalid falls back to
    // the empty-session default rather than crashing the app.
    const base = createEmptySession();
    return {
      ...base,
      ...parsed,
      messages: Array.isArray(parsed.messages) ? parsed.messages : base.messages,
      latestDiagnostics: normalizeDiagnostics(parsed.latestDiagnostics),
    };
  } catch {
    return createEmptySession();
  }
}

export function saveSession(session: SessionData): void {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, etc.);
    // the app should keep working in-memory even if persistence fails.
  }
}

export function clearSession(): void {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
