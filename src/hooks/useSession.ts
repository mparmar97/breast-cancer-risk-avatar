import { useCallback, useEffect, useState } from 'react';
import { fetchMockRisk, sendChatMessage } from '../services/api';
import { downloadJson } from '../services/download';
import { clearSession, createEmptySession, loadSession, saveSession } from '../services/session';
import type { ChatMessage, RiskBranch, Screen, SessionData } from '../types';

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

  useEffect(() => {
    saveSession(session);
  }, [session]);

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

  const runMockRisk = useCallback(async (scenario: RiskBranch) => {
    setCalculatorStatus({ loading: true, error: null });
    try {
      const result = await fetchMockRisk(scenario);
      setSession((prev) => ({
        ...prev,
        riskResult: result,
        screen: 'chat',
        updatedAt: new Date().toISOString(),
      }));
      setCalculatorStatus(IDLE_STATUS);
    } catch (error) {
      setCalculatorStatus({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to calculate the demonstration result.',
      });
    }
  }, []);

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
      const reply = await sendChatMessage(trimmed, historySnapshot);
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
      };
      setSession((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
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
  }, []);

  const resetSession = useCallback(() => {
    clearSession();
    setSession(createEmptySession());
    setCalculatorStatus(IDLE_STATUS);
    setChatStatus(IDLE_STATUS);
  }, []);

  const downloadSessionJson = useCallback(() => {
    downloadJson(`vare-session-${Date.now()}.json`, session);
  }, [session]);

  return {
    session,
    calculatorStatus,
    chatStatus,
    setConsentGiven,
    goToScreen,
    runMockRisk,
    sendMessage,
    resetSession,
    downloadSessionJson,
  };
}
