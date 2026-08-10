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
  previousAdaptiveState: null,
  currentTurnEvidence: {
    intent: 'expressed worry about the result',
    understanding: 'not expressed',
    emotion: '"I am scared"',
    barrier: 'not expressed',
    selfEfficacy: 'not expressed',
    readiness: 'not expressed',
    safetyFlag: 'not expressed',
  },
  currentTurnInterpretation: {
    primaryIntent: 'express_emotion',
    secondaryIntents: [],
    understanding: 'correct',
    emotion: 'worried',
    barrier: 'fear',
    selfEfficacy: 'unknown',
    readiness: 'considering',
    safetyFlag: 'none',
    currentTurnEvidence: {
      intent: 'expressed worry about the result',
      understanding: 'not expressed',
      emotion: '"I am scared"',
      barrier: 'not expressed',
      selfEfficacy: 'not expressed',
      readiness: 'not expressed',
      safetyFlag: 'not expressed',
    },
    refersToPreviousAssistantTurn: false,
    shortReplyType: 'not_short_reply',
    confidence: 0.75,
  },
  resolvedShortReply: {
    isShortReply: false,
    shortReplyType: 'not_short_reply',
    requiresClarification: false,
  },
  stateTransition: {
    previousUnderstanding: 'uncertain',
    currentUnderstanding: 'correct',
    understandingChanged: true,
    previousEmotion: 'uncertain',
    currentEmotion: 'worried',
    previousBarrier: 'none',
    currentBarrier: 'fear',
    barrierCleared: false,
    previousSelfEfficacy: 'unknown',
    currentSelfEfficacy: 'unknown',
    previousReadiness: 'unclear',
    currentReadiness: 'considering',
    stateChanged: true,
    changedFields: ['emotion', 'barrier', 'readiness'],
    barrierUnmentionedTurns: 0,
  },
  strategy: 'acknowledge_emotion',
  theoryConstruct: {
    theory: 'Motivational Interviewing communication principles',
    construct: 'reflective listening and autonomy support',
    communicationTechnique: 'reflection and open-ended question',
    objective: 'acknowledge emotion without increasing fear',
    sourceIds: ['MERCADO-ECA-MI-2023'],
    citations: ['Mercado M, et al. Embodied conversational agents providing motivational interviewing to improve health-related behaviors: scoping review. J Med Internet Res. 2023.'],
  },
  dialogueTurnPlan: {
    primaryGoal: 'acknowledge_emotion',
    dialogueAct: 'reflect_emotion',
    mustAddress: ['the emotion currently expressed: worried'],
    mustNotAssume: [],
    shouldAskQuestion: true,
    questionPurpose: 'barrier_exploration',
    nextPendingItem: {
      type: 'question',
      text: 'what part of the result feels most concerning',
      expectedReplyType: 'open_response',
    },
  },
  retrievalQuery: 'risk concern fear probability not diagnosis supportive explanation',
  sources: [
    {
      id: 'nci-elevated-not-certain-001',
      sourceId: 'NCI-RISK-TOOLS-2024',
      title: 'How Breast Cancer Risk Assessment Tools Work',
      organization: 'National Cancer Institute',
      section: 'Interpreting high and low estimates',
      topic: 'elevated_risk_not_current_cancer',
      score: 0.531,
      status: 'vetted',
      sourceUse: 'medical-rag',
      sourceType: 'government-patient-education',
      sourceUrl:
        'https://www.cancer.gov/news-events/cancer-currents-blog/2024/understanding-breast-cancer-risk-assessment-tools',
      publicationDate: '2024-06-27',
      accessedDate: '2026-08-04',
      citation: 'Reynolds S. How Breast Cancer Risk Assessment Tools Work. National Cancer Institute. June 27, 2024.',
    },
  ],
  dialogueDesignSources: [
    {
      id: 'mercado-mi-evidence-001',
      sourceId: 'MERCADO-ECA-MI-2023',
      title:
        'Embodied Conversational Agents Providing Motivational Interviewing to Improve Health-Related Behaviors: Scoping Review',
      organization: 'Journal of Medical Internet Research',
      topic: 'motivational_interviewing_agent',
      status: 'vetted',
      sourceType: 'systematic-review',
      sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/38064707/',
      publicationDate: '2023',
      accessedDate: '2026-08-04',
      citation:
        'Mercado M, et al. Embodied conversational agents providing motivational interviewing to improve health-related behaviors: scoping review. J Med Internet Res. 2023.',
    },
  ],
  usedEvidenceIds: [],
  classificationMode: 'local-fallback',
  responseMode: 'local-rag-fallback',
  groqModel: 'openai/gpt-oss-20b',
  classificationConsistency: 'fallback',
  classificationRepairUsed: false,
  strategyRepeated: false,
  strategyProgressionApplied: false,
  repetitionDetected: false,
  regenerationUsed: false,
  similarityScore: 0,
  repeatedDialogueMove: null,
  dialogueAdvanced: true,
  primaryGoalSatisfied: true,
  unsupportedAssumptionDetected: false,
  resolvedIssueRepeated: false,
  directQuestionAnswered: true,
  shortReplyResolved: false,
  resolvedMeaning: null,
  understandingChanged: true,
  repeatedExplanationDetected: false,
  practicalRequestFulfilled: true,
  userCorrectionHandled: true,
  recentStrategies: ['acknowledge_emotion'],
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
        onDownloadJson={vi.fn()}
        onDownloadCsv={vi.fn()}
      />,
    );

    expect(screen.getByText(/elevated risk \(demo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/maya/i)).toBeInTheDocument();
    expect(screen.getByText(/video avatar session unavailable/i)).toBeInTheDocument();
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
        onDownloadJson={vi.fn()}
        onDownloadCsv={vi.fn()}
      />,
    );

    expect(screen.getByText(/developer details/i)).toBeInTheDocument();
    expect(screen.getAllByText('acknowledge_emotion').length).toBeGreaterThan(0);
    expect(screen.getByText(/not psychological diagnoses/i)).toBeInTheDocument();
    // RAG diagnostics: retrieval query and source metadata should be visible.
    expect(screen.getAllByText(/risk concern fear probability/i).length).toBeGreaterThan(0);
    expect(screen.getByText('How Breast Cancer Risk Assessment Tools Work')).toBeInTheDocument();
    expect(screen.getByText('0.531')).toBeInTheDocument();
    expect(screen.getByText(/all active entries are marked as vetted/i)).toBeInTheDocument();
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
        onDownloadJson={vi.fn()}
        onDownloadCsv={vi.fn()}
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
        onDownloadJson={vi.fn()}
        onDownloadCsv={vi.fn()}
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
        onDownloadJson={vi.fn()}
        onDownloadCsv={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to reach the chat service/i);
  });

  it('calls onReset and download handlers when their buttons are clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onDownloadJson = vi.fn();
    const onDownloadCsv = vi.fn();

    render(
      <ChatInterface
        riskResult={riskResult}
        messages={[]}
        loading={false}
        error={null}
        latestDiagnostics={null}
        onSendMessage={vi.fn()}
        onReset={onReset}
        onDownloadJson={onDownloadJson}
        onDownloadCsv={onDownloadCsv}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reset session/i }));
    expect(onReset).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /download session json/i }));
    expect(onDownloadJson).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /download session csv/i }));
    expect(onDownloadCsv).toHaveBeenCalledTimes(1);
  });
});
