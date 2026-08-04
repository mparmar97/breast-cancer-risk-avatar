import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChatInterface from '../../src/components/ChatInterface';
import type { ChatDiagnostics, ChatMessage, RiskResult } from '../../src/types';

const riskResult: RiskResult = {
  model: 'Mock Demonstration Calculator',
  fiveYearRisk: 3.2,
  riskHorizon: '5 years',
  riskBranch: 'elevated',
  disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
};

const messages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'Hello',
    timestamp: '2026-08-04T00:00:00.000Z',
  },
];

const diagnostics: ChatDiagnostics = {
  adaptiveState: {
    understanding: 'correct',
    emotion: 'worried',
    barrier: 'fear',
    selfEfficacy: 'unknown',
    readiness: 'considering',
    safetyFlag: 'none',
    confidence: 0.75,
  },
  strategy: 'acknowledge_emotion',
  theoryConstruct: {
    theory: 'Motivational Interviewing communication principles',
    construct: 'reflective listening and autonomy support',
    communicationTechnique: 'reflection and open-ended question',
    objective: 'acknowledge emotion without increasing fear',
  },
  responseMode: 'local-fallback',
};

describe('ChatInterface', () => {
  it('renders the risk result, avatar placeholder, and existing messages', () => {
    render(
      <ChatInterface
        riskResult={riskResult}
        messages={messages}
        loading={false}
        error={null}
        latestDiagnostics={diagnostics}
        onSendMessage={vi.fn()}
        onReset={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByText(/elevated risk \(demo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/guide avatar/i)).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows the developer details disclosure with the latest diagnostics, but not in the main transcript', () => {
    render(
      <ChatInterface
        riskResult={riskResult}
        messages={messages}
        loading={false}
        error={null}
        latestDiagnostics={diagnostics}
        onSendMessage={vi.fn()}
        onReset={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByText(/developer details/i)).toBeInTheDocument();
    expect(screen.getByText('acknowledge_emotion')).toBeInTheDocument();
    expect(screen.getByText(/not psychological diagnoses/i)).toBeInTheDocument();
    // The internal state must never be rendered as part of the visible chat transcript.
    expect(screen.queryByText('worried', { selector: '.chat-message-bubble' })).not.toBeInTheDocument();
  });

  it('sends the typed message and clears the input', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    render(
      <ChatInterface
        riskResult={riskResult}
        messages={[]}
        loading={false}
        error={null}
        latestDiagnostics={null}
        onSendMessage={onSendMessage}
        onReset={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/message/i);
    await user.type(input, 'I am scared.');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendMessage).toHaveBeenCalledWith('I am scared.');
    expect(input).toHaveValue('');
  });

  it('disables Send while a reply is loading and shows a pending indicator', () => {
    render(
      <ChatInterface
        riskResult={riskResult}
        messages={[]}
        loading
        error={null}
        latestDiagnostics={null}
        onSendMessage={vi.fn()}
        onReset={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it('shows a readable error message when the chat request fails', () => {
    render(
      <ChatInterface
        riskResult={riskResult}
        messages={[]}
        loading={false}
        error="Unable to reach the chat service."
        latestDiagnostics={null}
        onSendMessage={vi.fn()}
        onReset={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to reach the chat service/i);
  });

  it('calls onReset and onDownload when their buttons are clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onDownload = vi.fn();

    render(
      <ChatInterface
        riskResult={riskResult}
        messages={[]}
        loading={false}
        error={null}
        latestDiagnostics={null}
        onSendMessage={vi.fn()}
        onReset={onReset}
        onDownload={onDownload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reset session/i }));
    expect(onReset).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /download session json/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
