import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

function mockFetchSequence() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/health')) {
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: '2026-08-04T00:00:00.000Z', version: '0.1.0' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.includes('/api/mock-risk')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { scenario: string };
      const result =
        body.scenario === 'elevated'
          ? {
              model: 'Mock Demonstration Calculator',
              fiveYearRisk: 3.2,
              riskHorizon: '5 years',
              riskBranch: 'elevated',
              disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
            }
          : {
              model: 'Mock Demonstration Calculator',
              fiveYearRisk: 1.1,
              riskHorizon: '5 years',
              riskBranch: 'average',
              disclaimer: 'Demonstration result only. This is not a validated medical calculation.',
            };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/chat')) {
      return new Response(
        JSON.stringify({
          reply: 'A risk estimate is not a diagnosis.',
          adaptiveState: {
            understanding: 'incorrect',
            emotion: 'uncertain',
            barrier: 'none',
            selfEfficacy: 'unknown',
            readiness: 'unclear',
            safetyFlag: 'diagnosis_request',
            confidence: 0.9,
          },
          strategy: 'safety_boundary',
          theoryConstruct: {
            theory: 'medical risk-communication safety',
            construct: 'scope and role boundary',
            communicationTechnique: 'clear non-diagnostic statement',
            objective: 'prevent diagnosis and treatment advice',
          },
          retrievalQuery: 'risk probability diagnosis explanation elevated average natural frequency',
          sources: [
            {
              id: 'nci-elevated-not-certain-001',
              sourceId: 'NCI-RISK-TOOLS-2024',
              title: 'How Breast Cancer Risk Assessment Tools Work',
              organization: 'National Cancer Institute',
              section: 'Interpreting high and low estimates',
              topic: 'elevated_risk_not_current_cancer',
              score: 0.42,
              status: 'vetted',
              sourceUse: 'medical-rag',
              sourceType: 'government-patient-education',
              sourceUrl:
                'https://www.cancer.gov/news-events/cancer-currents-blog/2024/understanding-breast-cancer-risk-assessment-tools',
              publicationDate: '2024-06-27',
              accessedDate: '2026-08-04',
              citation:
                'Reynolds S. How Breast Cancer Risk Assessment Tools Work. National Cancer Institute. June 27, 2024.',
            },
          ],
          dialogueDesignSources: [],
          responseMode: 'local-rag-fallback',
          timestamp: '2026-08-04T00:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('not found', { status: 404 });
  });
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', mockFetchSequence());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts on the consent screen with Continue disabled until consent is checked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByText('VARE Breast-Cancer Risk Avatar Prototype'),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a clinician/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot diagnose/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot recommend treatment/i)).toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /consent to continue/i }));
    expect(continueButton).toBeEnabled();
  });

  it('walks through consent → calculator → chat and completes a chat exchange', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: /consent to continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/mock risk calculator/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /test elevated-risk branch/i }));

    expect(await screen.findByText(/chat with the demonstration guide/i)).toBeInTheDocument();
    expect(screen.getByText(/elevated risk \(demo\)/i)).toBeInTheDocument();
    expect(screen.getByText('3.2%', { exact: false })).toBeInTheDocument();

    const input = screen.getByLabelText(/message/i);
    await user.type(input, 'Does this mean I have cancer?');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText(/not a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText('Does this mean I have cancer?')).toBeInTheDocument();
  });

  it('persists the session across a simulated refresh', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('checkbox', { name: /consent to continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /test average-risk branch/i }));

    expect(await screen.findByText(/chat with the demonstration guide/i)).toBeInTheDocument();

    unmount();
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/chat with the demonstration guide/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/average risk \(demo\)/i)).toBeInTheDocument();
  });

  it('resets the session back to the consent screen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: /consent to continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /test average-risk branch/i }));

    expect(await screen.findByText(/chat with the demonstration guide/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset session/i }));

    expect(
      await screen.findByText('VARE Breast-Cancer Risk Avatar Prototype'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    const stored = window.localStorage.getItem('vare.session.v1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? '{}');
    expect(parsed).toMatchObject({
      consentGiven: false,
      screen: 'consent',
      riskResult: null,
      messages: [],
    });
  });
});
