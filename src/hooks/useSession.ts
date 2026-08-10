import { useCallback, useEffect, useState } from 'react';
import {
  fetchCalculatedRisk,
  fetchConfigStatus,
  fetchMockRisk,
  sendChatMessage,
} from '../services/api';
import { buildSessionCsv, buildSessionExport, downloadJson, downloadText } from '../services/download';
import { clearSession, createEmptySession, loadSession, saveSession } from '../services/session';
import type {
  CalculatorInputs,
  ChatMessage,
  ConfigStatus,
  RiskBranch,
  Screen,
  SessionData,
} from '../types';

interface AsyncStatus {
  loading: boolean;
  error: string | null;
}

const IDLE_STATUS: AsyncStatus = { loading: false, error: null };

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSession() {
  const [session, setSession] = useState<SessionData>(() => loadSession());
  const [calculatorStatus, setCalculatorStatus] = useState<AsyncStatus>(IDLE_STATUS);
  const [chatStatus, setChatStatus] = useState<AsyncStatus>(IDLE_STATUS);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  // Fetched once on mount so the developer panel can show whether dynamic
  // (Groq) dialogue is available without exposing the API key itself.
  useEffect(() => {
    let cancelled = false;
    fetchConfigStatus()
      .then((status) => {
        if (!cancelled) setConfigStatus(status);
      })
      .catch(() => {
        // Non-fatal — the developer panel simply shows "unknown" configuration.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Defensive guard: a corrupted or partially-cleared localStorage entry
  // could otherwise land the user on the chat screen with no risk result.
  useEffect(() => {
    if (session.screen === 'chat' && !session.riskResult) {
      setSession((prev) => ({ ...prev, screen: 'calculator' }));
    }
  }, [session.screen, session.riskResult]);

  const setConsentGiven = useCallback((value: boolean) => {
    setSession((prev) => ({
      ...prev,
      consentGiven: value,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const goToScreen = useCallback((screen: Screen) => {
    setSession((prev) => ({ ...prev, screen, updatedAt: new Date().toISOString() }));
  }, []);

  const enterChatWithRisk = useCallback((result: Awaited<ReturnType<typeof fetchMockRisk>>) => {
    const now = new Date().toISOString();
    setSession((prev) => ({
      ...prev,
      riskResult: result,
      screen: 'chat',
      conversationStartedAt: prev.conversationStartedAt ?? now,
      updatedAt: now,
    }));
    setCalculatorStatus(IDLE_STATUS);
  }, []);

  const runMockRisk = useCallback(
    async (scenario: RiskBranch) => {
      setCalculatorStatus({ loading: true, error: null });
      try {
        const result = await fetchMockRisk(scenario);
        enterChatWithRisk(result);
      } catch (error) {
        setCalculatorStatus({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to calculate the demonstration result.',
        });
      }
    },
    [enterChatWithRisk],
  );

  const runCalculatedRisk = useCallback(
    async (inputs: CalculatorInputs) => {
      setCalculatorStatus({ loading: true, error: null });
      try {
        const result = await fetchCalculatedRisk(inputs);
        enterChatWithRisk(result);
      } catch (error) {
        setCalculatorStatus({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to calculate the demonstration result.',
        });
      }
    },
    [enterChatWithRisk],
  );

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    let historySnapshot: ChatMessage[] = [];
    setSession((prev) => {
      historySnapshot = prev.messages;
      return {
        ...prev,
        messages: [...prev.messages, userMessage],
        updatedAt: new Date().toISOString(),
      };
    });

    setChatStatus({ loading: true, error: null });
    try {
      const previousDiagnostics = session.latestDiagnostics;
      const apiResponse = await sendChatMessage(trimmed, historySnapshot, session.riskResult, {
        previousState: previousDiagnostics?.adaptiveState ?? null,
        previousDecisionState: previousDiagnostics?.decisionState ?? null,
        previousConversationMemory: previousDiagnostics?.conversationMemory ?? null,
        previousStrategy: previousDiagnostics?.strategy ?? null,
        previousAssistantDialogueAct: previousDiagnostics?.dialogueTurnPlan.dialogueAct ?? null,
        pendingItem: previousDiagnostics?.dialogueTurnPlan.nextPendingItem ?? null,
        recentStrategies: previousDiagnostics?.recentStrategies ?? [],
        barrierUnmentionedTurns: previousDiagnostics?.stateTransition.barrierUnmentionedTurns ?? 0,
      });
      const turnDiagnostics = {
        adaptiveState: apiResponse.adaptiveState,
        previousAdaptiveState: apiResponse.previousAdaptiveState,
        decisionState: apiResponse.decisionState,
        previousDecisionState: apiResponse.previousDecisionState,
        conversationMemory: apiResponse.conversationMemory,
        previousConversationMemory: apiResponse.previousConversationMemory,
        decisionTransition: apiResponse.decisionTransition,
        decisionSupportStrategy: apiResponse.decisionSupportStrategy,
        decisionSupportTheoryConstruct: apiResponse.decisionSupportTheoryConstruct,
        decisionSupportTurnPlan: apiResponse.decisionSupportTurnPlan,
        currentTurnEvidence: apiResponse.currentTurnEvidence,
        currentTurnInterpretation: apiResponse.currentTurnInterpretation,
        requestInterpretation: apiResponse.requestInterpretation,
        semanticTurn: apiResponse.semanticTurn,
        responsePlan: apiResponse.responsePlan,
        resolvedShortReply: apiResponse.resolvedShortReply,
        stateTransition: apiResponse.stateTransition,
        strategy: apiResponse.strategy,
        theoryConstruct: apiResponse.theoryConstruct,
        dialogueTurnPlan: apiResponse.dialogueTurnPlan,
        retrievalQuery: apiResponse.retrievalQuery,
        calculationResult: apiResponse.calculationResult,
        sources: apiResponse.sources,
        dialogueDesignSources: apiResponse.dialogueDesignSources,
        usedEvidenceIds: apiResponse.usedEvidenceIds,
        initialGeneratedResponse: apiResponse.initialGeneratedResponse,
        repairedResponse: apiResponse.repairedResponse,
        operationValidation: apiResponse.operationValidation,
        operationRepairAttempted: apiResponse.operationRepairAttempted,
        classificationMode: apiResponse.classificationMode,
        responseMode: apiResponse.responseMode,
        groqModel: apiResponse.groqModel,
        classificationConsistency: apiResponse.classificationConsistency,
        classificationRepairUsed: apiResponse.classificationRepairUsed,
        strategyRepeated: apiResponse.strategyRepeated,
        strategyProgressionApplied: apiResponse.strategyProgressionApplied,
        repetitionDetected: apiResponse.repetitionDetected,
        regenerationUsed: apiResponse.regenerationUsed,
        similarityScore: apiResponse.similarityScore,
        repeatedDialogueMove: apiResponse.repeatedDialogueMove,
        dialogueAdvanced: apiResponse.dialogueAdvanced,
        primaryGoalSatisfied: apiResponse.primaryGoalSatisfied,
        decisionNeedAddressed: apiResponse.decisionNeedAddressed,
        unsupportedAssumptionDetected: apiResponse.unsupportedAssumptionDetected,
        resolvedIssueRepeated: apiResponse.resolvedIssueRepeated,
        directQuestionAnswered: apiResponse.directQuestionAnswered,
        shortReplyResolved: apiResponse.shortReplyResolved,
        resolvedMeaning: apiResponse.resolvedMeaning,
        understandingChanged: apiResponse.understandingChanged,
        repeatedExplanationDetected: apiResponse.repeatedExplanationDetected,
        practicalRequestFulfilled: apiResponse.practicalRequestFulfilled,
        userCorrectionHandled: apiResponse.userCorrectionHandled,
        recentStrategies: apiResponse.recentStrategies,
        safetyOverrideApplied: apiResponse.safetyOverrideApplied,
        fallbackUsed: apiResponse.fallbackUsed,
        orchestrationValidation: apiResponse.orchestrationValidation,
        innovationMetadata: apiResponse.innovationMetadata,
        fallbackReason: apiResponse.fallbackReason,
        routingDiagnostics: apiResponse.routingDiagnostics,
        dialogueRoute: apiResponse.dialogueRoute,
        turnRequest: apiResponse.turnRequest,
        pipelineTrace: apiResponse.pipelineTrace,
        providerExecution: apiResponse.providerExecution,
        assumptionValidation: apiResponse.assumptionValidation,
        metadataConsistency: apiResponse.metadataConsistency,
      };
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: apiResponse.reply,
        timestamp: apiResponse.timestamp ?? new Date().toISOString(),
        diagnostics: turnDiagnostics,
      };
      setSession((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        latestDiagnostics: turnDiagnostics,
        updatedAt: new Date().toISOString(),
      }));
      setChatStatus(IDLE_STATUS);
    } catch (error) {
      setChatStatus({
        loading: false,
        error:
          error instanceof Error ? error.message : 'Unable to reach the chat service.',
      });
    }
  }, [session.latestDiagnostics, session.riskResult]);

  const resetSession = useCallback(() => {
    clearSession();
    setSession(createEmptySession());
    setCalculatorStatus(IDLE_STATUS);
    setChatStatus(IDLE_STATUS);
  }, []);

  const downloadSessionJson = useCallback(() => {
    downloadJson(`vare-session-${Date.now()}.json`, buildSessionExport(session));
  }, [session]);

  const downloadSessionCsv = useCallback(() => {
    downloadText(`vare-session-${Date.now()}.csv`, buildSessionCsv(session), 'text/csv');
  }, [session]);

  return {
    session,
    calculatorStatus,
    chatStatus,
    configStatus,
    setConsentGiven,
    goToScreen,
    runMockRisk,
    runCalculatedRisk,
    sendMessage,
    resetSession,
    downloadSessionJson,
    downloadSessionCsv,
  };
}
