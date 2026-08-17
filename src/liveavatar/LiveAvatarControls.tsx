import type { LiveAvatarStatus } from './types';

interface LiveAvatarControlsProps {
  status: LiveAvatarStatus;
  userStatus: string;
  sessionDurationLabel: string;
  sandbox: boolean | undefined;
  enabled: boolean;
  configured: boolean;
  showConsent: boolean;
  onStart: () => void;
  onStopSpeaking: () => void;
  onEnd: () => void;
  onConfirmConsent: () => void;
  onDismissConsent: () => void;
}

export default function LiveAvatarControls({
  status,
  userStatus,
  sessionDurationLabel,
  sandbox,
  enabled,
  configured,
  showConsent,
  onStart,
  onStopSpeaking,
  onEnd,
  onConfirmConsent,
  onDismissConsent,
}: LiveAvatarControlsProps) {
  if (!enabled) return null;

  const canStart =
    configured &&
    (status === 'idle' || status === 'ended' || status === 'error' || status === 'not_configured');
  const sessionActive =
    status === 'connected' ||
    status === 'speaking' ||
    status === 'connecting' ||
    status === 'starting';
  const canStopSpeaking = status === 'speaking';
  const busy = status === 'starting' || status === 'connecting' || status === 'ending';

  return (
    <div className="liveavatar-controls">
      {showConsent && (
        <div className="liveavatar-consent" role="dialog" aria-labelledby="liveavatar-consent-title">
          <p id="liveavatar-consent-title" className="liveavatar-consent-text">
            This prototype can present responses through a real-time AI avatar. The avatar does not
            independently generate medical advice. It speaks the same information shown in the
            conversation.
          </p>
          <div className="liveavatar-consent-actions">
            <button type="button" className="btn btn--primary" onClick={onConfirmConsent}>
              Continue with avatar
            </button>
            <button type="button" className="btn btn--ghost" onClick={onDismissConsent}>
              Stay text-only
            </button>
          </div>
        </div>
      )}

      <div className="liveavatar-status-row" role="status" aria-live="polite">
        <span className="liveavatar-user-status">{userStatus}</span>
        {sessionActive && (
          <>
            <span className="liveavatar-timer" aria-label={`Avatar session ${sessionDurationLabel}`}>
              Avatar session: {sessionDurationLabel}
            </span>
            <span className="liveavatar-sandbox">
              LiveAvatar mode: {sandbox === false ? 'Production' : 'Sandbox'}
            </span>
          </>
        )}
      </div>

      {!configured && (
        <p className="liveavatar-unavailable">
          Avatar unavailable. Text mode remains available.
          {status === 'not_configured' ? ' Check Developer details for the configuration reason.' : ''}
        </p>
      )}

      <div className="liveavatar-actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onStart}
          disabled={!canStart || busy || !configured}
          aria-label="Start avatar"
        >
          Start avatar
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onStopSpeaking}
          disabled={!canStopSpeaking}
          aria-label="Stop speaking"
        >
          Stop speaking
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onEnd}
          disabled={!sessionActive || busy}
          aria-label="End avatar"
        >
          End avatar
        </button>
      </div>
    </div>
  );
}
