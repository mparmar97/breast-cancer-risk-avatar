import type { ChatMessage as ChatMessageData } from '../types';

interface ChatMessageProps {
  message: ChatMessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <li className={`chat-message chat-message--${message.role}`}>
      <span className="chat-message-sender">{isUser ? 'You' : 'Guide'}</span>
      <p className="chat-message-bubble">{message.content}</p>
      <span className="chat-message-time">{time}</span>
    </li>
  );
}
