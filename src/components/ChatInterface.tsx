import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatDiagnostics, ChatMessage as ChatMessageData, ConfigStatus, RiskResult } from '../types';
import { useLiveAvatar } from '../liveavatar/useLiveAvatar';
import LiveAvatarVideo from '../liveavatar/LiveAvatarVideo';
import LiveAvatarControls from '../liveavatar/LiveAvatarControls';
import { useVoiceInput } from '../hooks/useVoiceInput';
import AvatarPanel from './AvatarPanel';
import ChatMessageItem from './ChatMessage';
import DeveloperPanel from './DeveloperPanel';
import RiskResultCard from './RiskResultCard';

interface ChatInterfaceProps {
  riskResult: RiskResult;
  messages: ChatMessageData[];
  loading: boolean;
  error: string | null;
  latestDiagnostics: ChatDiagnostics | null;
  configStatus?: ConfigStatus | null;
  onSendMessage: (text: string) => void;
  onReset: () => void;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onLiveAvatarExportMeta?: (meta: ReturnType<typeof useLiveAvatar>['exportMeta']) => void;
}

export default function ChatInterface({
  riskResult,
  messages,
  loading,
  error,
  latestDiagnostics,
  configStatus = null,
  onSendMessage,
  onReset,
  onDownloadJson,
  onDownloadCsv,
  onLiveAvatarExportMeta,
}: ChatInterfaceProps) {
  const [draft, setDraft] = useState('');
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [showTypeBox, setShowTypeBox] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const lastDeliveredTurnRef = useRef<string | null>(null);
  const loadingRef = useRef(loading);
  const prevAvatarStatusRef = useRef<string>('idle');
  const voiceConversationRef = useRef(false);

  const liveAvatar = useLiveAvatar();
  const deliverRef = useRef(liveAvatar.deliverValidatedResponse);
  const connectedRef = useRef(liveAvatar.isLiveConnected);
  deliverRef.current = liveAvatar.deliverValidatedResponse;
  connectedRef.current = liveAvatar.isLiveConnected;
  loadingRef.current = loading;
  voiceConversationRef.current = voiceConversation;

  const sendUserMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loadingRef.current) return;
    if (liveAvatar.status === 'speaking') {
      liveAvatar.stopSpeaking();
    }
    if (liveAvatar.isLiveConnected) {
      liveAvatar.setListeningPose(true);
    }
    onSendMessage(trimmed);
    setDraft('');
  };

  const voice = useVoiceInput({
    onFinalTranscript: (text) => {
      sendUserMessage(text);
    },
    onListeningChange: (isListening) => {
      if (isListening && liveAvatar.isLiveConnected) {
        if (liveAvatar.status === 'speaking') {
          liveAvatar.stopSpeaking();
        }
        liveAvatar.setListeningPose(true);
      }
    },
  });

  const voiceStartRef = useRef(voice.start);
  const voiceStopRef = useRef(voice.stop);
  voiceStartRef.current = voice.start;
  voiceStopRef.current = voice.stop;

  useEffect(() => {
    onLiveAvatarExportMeta?.(liveAvatar.exportMeta);
  }, [
    liveAvatar.exportMeta.avatarMode,
    liveAvatar.exportMeta.liveAvatarSessionDurationSeconds,
    liveAvatar.exportMeta.liveAvatarFailures,
    liveAvatar.exportMeta.avatarSpeechInterruptions,
    liveAvatar.exportMeta.liveAvatarSessionStarted,
    onLiveAvatarExportMeta,
  ]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages.length, loading]);

  // Deliver validated assistant text only after it is already in history.
  useEffect(() => {
    if (loading) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    const turnId =
      last.diagnostics?.turnRequest?.turnId ??
      last.diagnostics?.pipelineTrace?.turnId ??
      last.id;
    if (lastDeliveredTurnRef.current === turnId) return;
    lastDeliveredTurnRef.current = turnId;

    if (!connectedRef.current) return;

    void deliverRef.current({
      assistantTurnId: turnId,
      validatedText: last.content,
      adaptiveState: last.diagnostics?.adaptiveState,
      currentTurnEvidence: last.diagnostics?.currentTurnEvidence,
    });
  }, [messages, loading]);

  // Hands-free loop: after the avatar finishes speaking, listen again.
  useEffect(() => {
    const prev = prevAvatarStatusRef.current;
    const next = liveAvatar.status;
    prevAvatarStatusRef.current = next;

    if (!voiceConversationRef.current || !voice.supported) return;
    if (loading || voice.listening) return;

    const finishedSpeaking = prev === 'speaking' && next === 'connected';
    const justConnected = prev !== 'connected' && next === 'connected' && prev !== 'speaking';

    if (finishedSpeaking || (justConnected && voiceConversationRef.current)) {
      const timer = window.setTimeout(() => {
        if (!voiceConversationRef.current || loadingRef.current) return;
        if (liveAvatar.status === 'speaking') return;
        voiceStartRef.current();
      }, finishedSpeaking ? 500 : 700);
      return () => window.clearTimeout(timer);
    }
  }, [liveAvatar.status, loading, voice.listening, voice.supported]);

  // Stop voice conversation when avatar ends.
  useEffect(() => {
    if (
      voiceConversation &&
      (liveAvatar.status === 'ended' ||
        liveAvatar.status === 'idle' ||
        liveAvatar.status === 'disabled' ||
        liveAvatar.status === 'not_configured')
    ) {
      setVoiceConversation(false);
      voiceStopRef.current();
    }
  }, [liveAvatar.status, voiceConversation]);

  function startVoiceConversation() {
    if (!voice.supported) return;
    setVoiceConversation(true);
    setShowTypeBox(false);
    if (liveAvatar.status === 'speaking') {
      liveAvatar.stopSpeaking();
    }
    if (liveAvatar.isLiveConnected) {
      liveAvatar.setListeningPose(true);
    }
    voice.clearError();
    voice.start();
  }

  function stopVoiceConversation() {
    setVoiceConversation(false);
    voice.stop();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (voice.listening) voice.stop();
    sendUserMessage(draft);
  }

  const liveActive = liveAvatar.showLiveVideo;
  const canVoiceChat = voice.supported && liveAvatar.isLiveConnected;
  const captionOverride = liveAvatar.isLiveConnected
    ? voiceConversation
      ? voice.listening
        ? 'Your turn — speak now. Pause when you finish.'
        : loading || liveAvatar.status === 'speaking'
          ? 'Maya is responding…'
          : 'Voice conversation on — waiting for the next turn.'
      : 'Live video ready — tap “Talk with Maya” to speak instead of typing.'
    : liveActive
      ? 'Connecting live avatar…'
      : undefined;

  return (
    <div className="card card--wide">
      <h1 className="title">Chat with the demonstration guide</h1>

      <RiskResultCard result={riskResult} />

      <div className="avatar-layout">
        <AvatarPanel
          videoUnavailable={!liveAvatar.isLiveConnected}
          liveActive={liveActive}
          liveVideo={
            <LiveAvatarVideo
              visible={liveActive}
              remoteAudioEnabled={liveAvatar.remoteAudioEnabled}
              onVideoElement={liveAvatar.attachVideo}
            />
          }
          captionOverride={captionOverride}
          expression={liveAvatar.embodiment?.avatarExpression ?? null}
        />
        <LiveAvatarControls
          status={liveAvatar.status}
          userStatus={
            voice.listening
              ? 'Listening to you…'
              : voiceConversation && liveAvatar.status === 'speaking'
                ? 'Maya is speaking…'
                : liveAvatar.userStatus
          }
          sessionDurationLabel={liveAvatar.sessionDurationLabel}
          sandbox={liveAvatar.config?.sandbox}
          enabled={Boolean(liveAvatar.config?.enabled)}
          configured={Boolean(liveAvatar.config?.configured)}
          showConsent={liveAvatar.showConsent}
          onStart={() => void liveAvatar.startAvatar()}
          onStopSpeaking={liveAvatar.stopSpeaking}
          onEnd={() => {
            stopVoiceConversation();
            void liveAvatar.endAvatar();
          }}
          onConfirmConsent={() => void liveAvatar.confirmConsent()}
          onDismissConsent={liveAvatar.dismissConsent}
        />
        {liveAvatar.errorMessage && (
          <p className="status-meta" role="status">
            {liveAvatar.errorMessage}
          </p>
        )}
      </div>

      {voice.supported && (
        <div className="voice-conversation">
          {!liveAvatar.isLiveConnected && (
            <p className="voice-conversation-hint">
              Start the avatar first, then tap Talk with Maya to speak instead of typing.
            </p>
          )}
          {canVoiceChat && !voiceConversation && (
            <button
              type="button"
              className="btn btn--primary btn--voice-start"
              onClick={startVoiceConversation}
              disabled={loading}
            >
              Talk with Maya
            </button>
          )}
          {voiceConversation && (
            <div className="voice-conversation-active">
              <button
                type="button"
                className={`btn btn--primary btn--mic${voice.listening ? ' btn--mic-active' : ''}`}
                onClick={() => {
                  if (voice.listening) voice.stop();
                  else voice.start();
                }}
                disabled={loading || liveAvatar.status === 'speaking'}
                aria-pressed={voice.listening}
              >
                {voice.listening
                  ? 'Listening… tap to stop'
                  : loading || liveAvatar.status === 'speaking'
                    ? 'Wait for Maya…'
                    : 'Tap to speak'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={stopVoiceConversation}
              >
                End voice chat
              </button>
            </div>
          )}
          {(voice.listening || voice.error || voiceConversation) && (
            <p
              className={`voice-status${voice.error ? ' voice-status--error' : ''}`}
              role="status"
            >
              {voice.error ??
                (voice.listening
                  ? 'Listening… speak clearly, then pause.'
                  : voiceConversation
                    ? 'Hands-free mode: after Maya finishes, your mic opens again.'
                    : null)}
            </p>
          )}
        </div>
      )}

      {!voice.supported && (
        <p className="voice-status voice-status--error" role="status">
          Voice chat needs Chrome or Edge (browser speech recognition). You can still type below.
        </p>
      )}

      <ul
        className="chat-transcript"
        ref={listRef}
        aria-live="polite"
        aria-label="Conversation transcript"
      >
        {messages.length === 0 && (
          <li className="chat-empty">
            {voice.supported
              ? 'Start the avatar, tap Talk with Maya, and speak — or type below.'
              : 'Say hello or ask a question to start the conversation.'}
          </li>
        )}
        {messages.map((message) => (
          <ChatMessageItem key={message.id} message={message} />
        ))}
        {loading && (
          <li
            className="chat-message chat-message--assistant chat-message--pending"
            role="status"
          >
            <span className="chat-message-sender">Guide</span>
            <p className="chat-message-bubble">Thinking…</p>
          </li>
        )}
      </ul>

      {error && (
        <p className="status-meta status-meta--error" role="alert">
          {error}
        </p>
      )}

      <p className="chat-scope-note" role="note">
        Ask about this demonstration risk estimate, what the calculator means, general
        healthy-habit education, or sample questions for a clinician. Product picks,
        diagnoses, treatment plans, and other out-of-scope topics are outside what this
        guide can help with.
      </p>

      {voiceConversation && !showTypeBox ? (
        <button
          type="button"
          className="btn btn--ghost btn--show-type"
          onClick={() => setShowTypeBox(true)}
        >
          Prefer to type instead
        </button>
      ) : (
        <form className="chat-form" onSubmit={handleSubmit}>
          <label htmlFor="chat-input" className="visually-hidden">
            Message
          </label>
          <input
            id="chat-input"
            type="text"
            className="chat-input"
            placeholder={voice.listening ? 'Listening…' : 'Type a message…'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={loading || voice.listening}
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || voice.listening || !draft.trim()}
          >
            Send
          </button>
        </form>
      )}

      <div className="chat-actions">
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset Session
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDownloadJson}>
          Download Session JSON
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDownloadCsv}>
          Download Session CSV
        </button>
      </div>

      <p className="disclaimer-footnote">
        This is a scripted demonstration guide, not a clinician. It cannot diagnose
        conditions or recommend treatment. Please keep questions within the topics
        listed above.
      </p>

      <DeveloperPanel
        diagnostics={latestDiagnostics}
        configStatus={configStatus}
        liveAvatar={liveAvatar.developerSnapshot}
      />
    </div>
  );
}
