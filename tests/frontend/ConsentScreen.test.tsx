import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsentScreen from '../../src/components/ConsentScreen';

describe('ConsentScreen', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('error', { status: 500 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables Continue until consent is checked, then calls onContinue', async () => {
    const user = userEvent.setup();
    const onConsentChange = vi.fn();
    const onContinue = vi.fn();

    const { rerender } = render(
      <ConsentScreen
        consentGiven={false}
        onConsentChange={onConsentChange}
        onContinue={onContinue}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /consent to continue/i });
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(continueButton).toBeDisabled();

    await user.click(checkbox);
    expect(onConsentChange).toHaveBeenCalledWith(true);

    rerender(
      <ConsentScreen
        consentGiven
        onConsentChange={onConsentChange}
        onContinue={onContinue}
      />,
    );

    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument());
  });

  it('states that the assistant is not a clinician and cannot diagnose or treat', async () => {
    render(
      <ConsentScreen consentGiven={false} onConsentChange={vi.fn()} onContinue={vi.fn()} />,
    );

    expect(screen.getByText(/not a clinician/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot diagnose/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot recommend treatment/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument());
  });
});
