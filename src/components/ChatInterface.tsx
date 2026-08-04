import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage as ChatMessageData, RiskResult } from '../types';
import AvatarPanel from './AvatarPanel';
import ChatMessageItem from './ChatMessage';
import RiskResultCard from './RiskResultCard';

interface ChatInterfaceProps {
  riskResult: RiskResult;
  messages: ChatMessageData[];
  loading: boolean;
  error: string | null;
  onSendMessage: (text: string) => void;
  onReset: () => void;
  onDownload: () => void;
}

export default function ChatInterface({
  riskResult,
  messages,
  loading,
  error,
  onSendMessage,
  onReset,
  onDownload,
}: ChatInterfaceProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages.length, loading]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || loading) return;
    onSendMessage(trimmed);
    setDraft('');
  }

  return (
    <div className="card card--wide">
      <h1 className="title">Chat with the demonstration guide</h1>

      <RiskResultCard result={riskResult} />
      <AvatarPanel />

      <ul
        className="chat-transcript"
        ref={listRef}
        aria-live="polite"
        aria-label="Conversation transcript"
      >
        {messages.length === 0 && (
          <li className="chat-empty">
            Say hello, or ask a question, to start the conversation.
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

      <form className="chat-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="visually-hidden">
          Message
        </label>
        <input
          id="chat-input"
          type="text"
          className="chat-input"
          placeholder="Type a message…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={loading || !draft.trim()}
        >
          Send
        </button>
      </form>

      <div className="chat-actions">
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset Session
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDownload}>
          Download Session JSON
        </button>
      </div>

      <p className="disclaimer-footnote">
        This is a scripted demonstration guide, not a clinician. It cannot diagnose
        conditions or recommend treatment.
      </p>
    </div>
  );
}
