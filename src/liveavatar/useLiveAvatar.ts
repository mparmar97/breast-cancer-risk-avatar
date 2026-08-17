import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionEvent,
  SessionState,
} from '@heygen/liveavatar-web-sdk';
import {
  endLiveAvatarSessionApi,
  fetchLiveAvatarConfig,
  keepAliveLiveAvatarSessionApi,
  prepareAvatarSpeech,
  startLiveAvatarSessionApi,
} from './api';
import type {
  AvatarDeliveryMetadata,
  AvatarExpression,
  EmbodimentPolicyView,
  LiveAvatarDeveloperSnapshot,
  LiveAvatarPublicConfig,
  LiveAvatarSessionExportMeta,
  LiveAvatarStatus,
  LiveAvatarVoiceAffect,
} from './types';
import { playPcmS16leBase64 } from './playPcm';
import { unlockPlaybackFromUserGesture } from './audioUnlock';
import { isGroqTtsRateLimitError, isGroqTtsTermsError, speakWithBrowserTts } from './browserTts';

const DEFAULT_VOICE_SPEED = 1;
const DEFAULT_VOICE_AFFECT: LiveAvatarVoiceAffect = { style: 0.15, stability: 0.75 };

function maskSessionId(sessionId: string): string {
  if (!sessionId || sessionId.length <= 8) return '••••';
  return `${sessionId.slice(0, 4)}…${sessionId.slice(-4)}`;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function speedsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) >= 0.01;
}

function voiceAffectsDiffer(a: LiveAvatarVoiceAffect, b: LiveAvatarVoiceAffect): boolean {
  return Math.abs(a.style - b.style) >= 0.02 || Math.abs(a.stability - b.stability) >= 0.02;
}

function prefersAttentiveListening(expression: AvatarExpression | undefined): boolean {
  return (
    expression === 'reassuring' ||
    expression === 'gentle' ||
    expression === 'attentive'
  );
}

export interface DeliverValidatedResponseArgs {
  assistantTurnId: string;
  validatedText: string;
  adaptiveState?: unknown;
  currentTurnEvidence?: unknown;
}

export function useLiveAvatar() {
  const [config, setConfig] = useState<LiveAvatarPublicConfig | null>(null);
  const [status, setStatus] = useState<LiveAvatarStatus>('idle');
  const [userStatus, setUserStatus] = useState('Text-only mode');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(0);
  const [reconnectAttempts] = useState(0);
  const [delivery, setDelivery] = useState<AvatarDeliveryMetadata | null>(null);
  const [embodiment, setEmbodiment] = useState<EmbodimentPolicyView | null>(null);
  const [appliedVoice, setAppliedVoice] = useState<
    (LiveAvatarVoiceAffect & { speed: number }) | null
  >(null);
  const [embodimentPoliciesUsed, setEmbodimentPoliciesUsed] = useState<string[]>([]);
  const [failures, setFailures] = useState(0);
  const [interruptions, setInterruptions] = useState(0);
  const [sessionStartedOnce, setSessionStartedOnce] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [browserTtsFallback, setBrowserTtsFallback] = useState<{
    active: boolean;
    reason: 'rate_limit' | 'terms' | 'other' | null;
    voicePreference: 'device_default' | 'female_preferred' | null;
  }>({ active: false, reason: null, voicePreference: null });

  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const interruptRequestedRef = useRef(false);
  const maxSessionSecondsRef = useRef<number | undefined>(undefined);
  const statusRef = useRef<LiveAvatarStatus>('idle');
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const endAvatarRef = useRef<() => Promise<void>>(async () => undefined);
  const preferredVoiceSpeedRef = useRef(DEFAULT_VOICE_SPEED);
  const sessionVoiceSpeedRef = useRef(DEFAULT_VOICE_SPEED);
  const preferredVoiceAffectRef = useRef<LiveAvatarVoiceAffect>({ ...DEFAULT_VOICE_AFFECT });
  const sessionVoiceAffectRef = useRef<LiveAvatarVoiceAffect>({ ...DEFAULT_VOICE_AFFECT });
  const expressionRef = useRef<AvatarExpression>('neutral');
  const localAudioStopRef = useRef<(() => void) | null>(null);
  const localAudioAbortRef = useRef<AbortController | null>(null);
  const recreatingForPaceRef = useRef(false);
  const runSessionStartRef = useRef<
    (options?: {
      voiceSpeed?: number;
      voiceAffect?: LiveAvatarVoiceAffect;
      avatarExpression?: AvatarExpression;
    }) => Promise<boolean>
  >(async () => false);

  const setStatusSafe = useCallback((next: LiveAvatarStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const safeStartListening = useCallback(() => {
    const sdk = sessionRef.current;
    if (!sdk || speakingRef.current) return;
    if (sdk.state !== SessionState.CONNECTED) return;
    try {
      sdk.startListening();
    } catch {
      // ignore — pose is best-effort
    }
  }, []);

  const safeStopListening = useCallback(() => {
    const sdk = sessionRef.current;
    if (!sdk) return;
    try {
      sdk.stopListening();
    } catch {
      // ignore
    }
  }, []);

  const setListeningPose = useCallback(
    (listening: boolean) => {
      if (listening) safeStartListening();
      else safeStopListening();
    },
    [safeStartListening, safeStopListening],
  );

  useEffect(() => {
    let cancelled = false;
    fetchLiveAvatarConfig()
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        if (!cfg.enabled) {
          setStatusSafe('disabled');
          setUserStatus('Text-only mode');
        } else if (!cfg.configured) {
          setStatusSafe('not_configured');
          setUserStatus('Avatar unavailable');
        } else {
          setStatusSafe('idle');
          setUserStatus('Text-only mode');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusSafe('not_configured');
          setUserStatus('Avatar unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setStatusSafe]);

  const clearTimers = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stopLocalAudio = useCallback(() => {
    localAudioAbortRef.current?.abort();
    localAudioAbortRef.current = null;
    localAudioStopRef.current?.();
    localAudioStopRef.current = null;
  }, []);

  const releaseSession = useCallback(async () => {
    clearTimers();
    stopLocalAudio();
    const sdk = sessionRef.current;
    sessionRef.current = null;
    const token = sessionTokenRef.current;
    sessionTokenRef.current = null;
    sessionIdRef.current = null;
    speakingRef.current = false;
    interruptRequestedRef.current = false;
    try {
      if (sdk) {
        try {
          sdk.stopListening();
        } catch {
          // ignore
        }
        await sdk.stop();
      }
    } catch {
      // ignore teardown errors
    }
    if (token) {
      try {
        await endLiveAvatarSessionApi(token);
      } catch {
        // ignore
      }
    }
  }, [clearTimers, stopLocalAudio]);

  useEffect(() => {
    return () => {
      void releaseSession();
    };
  }, [releaseSession]);

  useEffect(() => {
    const onUnload = () => {
      const token = sessionTokenRef.current;
      if (token) void endLiveAvatarSessionApi(token);
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  const tryAttachVideo = useCallback((reason: string) => {
    const sdk = sessionRef.current;
    const el = videoElementRef.current;
    if (!sdk || !el) return false;
    try {
      sdk.attach(el);
      // LITE: keep element muted — TTS plays locally (reliable hearing).
      // FULL: unmute LiveKit remote TTS audio.
      const lite = config?.mode === 'LITE';
      el.muted = Boolean(lite);
      el.volume = lite ? 0 : 1;
      void el.play().catch(() => undefined);
      void reason;
      return true;
    } catch {
      return false;
    }
  }, [config?.mode]);

  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoElementRef.current = el;
      setVideoElement(el);
      if (el && sessionRef.current?.state === SessionState.CONNECTED) {
        tryAttachVideo('element-ready');
      }
    },
    [tryAttachVideo],
  );

  const endAvatar = useCallback(async () => {
    setStatusSafe('ending');
    setUserStatus('Text-only mode');
    await releaseSession();
    setStatusSafe('ended');
    sessionStartedAtRef.current = null;
  }, [releaseSession, setStatusSafe]);

  endAvatarRef.current = endAvatar;

  const runSessionStart = useCallback(
    async (options?: {
      voiceSpeed?: number;
      voiceAffect?: LiveAvatarVoiceAffect;
      avatarExpression?: AvatarExpression;
    }): Promise<boolean> => {
      setErrorMessage(null);
      setStatusSafe('starting');
      setUserStatus('Connecting…');
      setSessionStartedOnce(true);

      const voiceSpeed = options?.voiceSpeed ?? preferredVoiceSpeedRef.current;
      const voiceAffect = options?.voiceAffect ?? preferredVoiceAffectRef.current;
      if (options?.avatarExpression) {
        expressionRef.current = options.avatarExpression;
      }

      try {
        const { session } = await startLiveAvatarSessionApi({
          voiceSpeed,
          voiceStyle: voiceAffect.style,
          voiceStability: voiceAffect.stability,
          avatarExpression: options?.avatarExpression ?? expressionRef.current,
        });
        sessionTokenRef.current = session.sessionToken;
        sessionIdRef.current = session.sessionId;
        maxSessionSecondsRef.current = session.developmentMaxSessionSeconds;
        sessionVoiceSpeedRef.current =
          typeof session.voiceSpeed === 'number' ? session.voiceSpeed : voiceSpeed;
        preferredVoiceSpeedRef.current = sessionVoiceSpeedRef.current;
        sessionVoiceAffectRef.current = session.voiceAffect ?? voiceAffect;
        preferredVoiceAffectRef.current = sessionVoiceAffectRef.current;

        setStatusSafe('connecting');
        // Let React paint the live video slot before the SDK connects.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const sdk = new LiveAvatarSession(session.sessionToken, { voiceChat: false });
        sessionRef.current = sdk;

        const attachSoon = () => {
          if (tryAttachVideo('stream-ready')) return;
          window.setTimeout(() => tryAttachVideo('stream-ready-retry'), 250);
          window.setTimeout(() => tryAttachVideo('stream-ready-retry-2'), 1000);
        };

        sdk.on(SessionEvent.SESSION_STREAM_READY, () => {
          attachSoon();
        });

        sdk.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
          if (state === SessionState.CONNECTED) {
            setStatusSafe('connected');
            setUserStatus('Avatar ready');
            attachSoon();
            safeStartListening();
          }
        });

        sdk.on(SessionEvent.SESSION_DISCONNECTED, () => {
          if (recreatingForPaceRef.current) return;
          clearTimers();
          sessionRef.current = null;
          sessionTokenRef.current = null;
          sessionIdRef.current = null;
          if (statusRef.current !== 'ending' && statusRef.current !== 'ended') {
            setFailures((n) => n + 1);
            setStatusSafe('ended');
            setUserStatus('Text-only mode');
          }
        });

        sdk.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          speakingRef.current = true;
          setStatusSafe('speaking');
          setUserStatus('Speaking…');
        });

        sdk.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          speakingRef.current = false;
          setDelivery((prev) =>
            prev ? { ...prev, speechCompleted: !prev.interrupted } : prev,
          );
          if (statusRef.current === 'speaking') {
            setStatusSafe('connected');
            setUserStatus('Avatar ready');
          }
          if (prefersAttentiveListening(expressionRef.current)) {
            safeStartListening();
          } else {
            // Warm/encouraging: brief idle, then listen for the next turn.
            safeStopListening();
            window.setTimeout(() => {
              if (!speakingRef.current) safeStartListening();
            }, 350);
          }
        });

        await sdk.start();
        setStatusSafe('connected');
        setUserStatus('Avatar ready');
        attachSoon();
        safeStartListening();

        sessionStartedAtRef.current = Date.now();
        setSessionDurationSeconds(0);

        durationTimerRef.current = setInterval(() => {
          if (!sessionStartedAtRef.current) return;
          const elapsed = Math.floor((Date.now() - sessionStartedAtRef.current) / 1000);
          setSessionDurationSeconds(elapsed);
          const max = maxSessionSecondsRef.current;
          if (typeof max === 'number' && elapsed >= max) {
            void endAvatarRef.current();
          }
        }, 1000);

        keepAliveTimerRef.current = setInterval(() => {
          const token = sessionTokenRef.current;
          if (!token) return;
          void keepAliveLiveAvatarSessionApi(token).catch(() => {
            try {
              void sessionRef.current?.keepAlive();
            } catch {
              // ignore
            }
          });
        }, 120_000);

        return true;
      } catch (error) {
        setFailures((n) => n + 1);
        const detail =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'Avatar session could not start.';
        setErrorMessage(`${detail} Continuing with text.`);
        setStatusSafe('idle');
        setUserStatus('Text-only mode');
        await releaseSession();
        return false;
      }
    },
    [clearTimers, releaseSession, safeStartListening, safeStopListening, setStatusSafe, tryAttachVideo],
  );

  runSessionStartRef.current = runSessionStart;

  const startAvatar = useCallback(async () => {
    unlockPlaybackFromUserGesture();
    if (!config?.enabled) return;
    if (!config.configured) {
      setStatusSafe('not_configured');
      setUserStatus('Avatar unavailable');
      return;
    }
    if (!consentAccepted) {
      setShowConsent(true);
      return;
    }
    await runSessionStart();
  }, [config, consentAccepted, runSessionStart, setStatusSafe]);

  const confirmConsent = useCallback(async () => {
    unlockPlaybackFromUserGesture();
    setConsentAccepted(true);
    setShowConsent(false);
    await runSessionStart();
  }, [runSessionStart]);

  const stopSpeaking = useCallback(() => {
    interruptRequestedRef.current = true;
    stopLocalAudio();
    const sdk = sessionRef.current;
    if (sdk && speakingRef.current) {
      try {
        sdk.interrupt();
        setInterruptions((n) => n + 1);
      } catch {
        // ignore
      }
    }
    speakingRef.current = false;
    if (statusRef.current === 'speaking') {
      setStatusSafe('connected');
      setUserStatus('Avatar ready');
    }
    setDelivery((prev) =>
      prev ? { ...prev, interrupted: true, speechCompleted: false } : prev,
    );
    safeStartListening();
  }, [safeStartListening, setStatusSafe, stopLocalAudio]);

  const deliverValidatedResponse = useCallback(
    async (args: DeliverValidatedResponseArgs) => {
      const connected =
        statusRef.current === 'connected' || statusRef.current === 'speaking';
      if (!connected || !sessionRef.current) {
        setDelivery({
          assistantTurnId: args.assistantTurnId,
          requested: false,
          speechGenerated: false,
          speechStarted: false,
          speechCompleted: false,
          interrupted: false,
          failureStage: 'not_connected',
        });
        return;
      }

      if (speakingRef.current) {
        stopSpeaking();
      }
      interruptRequestedRef.current = false;

      try {
        const prepared = await prepareAvatarSpeech({
          assistantTurnId: args.assistantTurnId,
          validatedText: args.validatedText,
          connected: true,
          sessionId: sessionIdRef.current ?? undefined,
          adaptiveState: args.adaptiveState,
          currentTurnEvidence: args.currentTurnEvidence,
        });

        setEmbodiment(prepared.embodiment);
        expressionRef.current = prepared.embodiment.avatarExpression ?? 'neutral';
        setEmbodimentPoliciesUsed((prev) =>
          prev.includes(prepared.embodimentPolicyLabel)
            ? prev
            : [...prev, prepared.embodimentPolicyLabel],
        );
        setDelivery(prepared.delivery);

        const targetSpeed =
          typeof prepared.voiceSpeed === 'number'
            ? prepared.voiceSpeed
            : preferredVoiceSpeedRef.current;
        const targetAffect: LiveAvatarVoiceAffect = prepared.voiceAffect
          ? {
              style: prepared.voiceAffect.style,
              stability: prepared.voiceAffect.stability,
            }
          : preferredVoiceAffectRef.current;
        preferredVoiceSpeedRef.current = targetSpeed;
        preferredVoiceAffectRef.current = targetAffect;
        setAppliedVoice({
          speed: targetSpeed,
          style: targetAffect.style,
          stability: targetAffect.stability,
        });

        if (!prepared.tts.ok) {
          const termsBlocked = isGroqTtsTermsError(prepared.tts.message);
          const rateLimited = isGroqTtsRateLimitError(prepared.tts.message);
          setDelivery({
            ...prepared.delivery,
            failureStage:
              prepared.tts.reason === 'tts_not_configured'
                ? 'tts_not_configured'
                : 'tts',
            failureMessage: prepared.tts.message,
          });

          // Speak validated text with the device/window voice when Groq Orpheus
          // is rate-limited or otherwise unavailable (mobile uses phone default).
          if (termsBlocked || rateLimited || prepared.tts.reason !== 'tts_not_configured') {
            safeStopListening();
            setStatusSafe('speaking');
            speakingRef.current = true;
            stopLocalAudio();
            const abort = new AbortController();
            localAudioAbortRef.current = abort;
            // Prefer a female English voice on mobile and desktop (doctor-avatar demo).
            const local = speakWithBrowserTts(args.validatedText, {
              rate: targetSpeed,
              signal: abort.signal,
              preferDeviceDefault: false,
            });
            localAudioStopRef.current = local.stop;
            setBrowserTtsFallback({
              active: true,
              reason: rateLimited ? 'rate_limit' : termsBlocked ? 'terms' : 'other',
              voicePreference: local.preference,
            });
            setUserStatus(
              termsBlocked
                ? 'Female browser/phone voice backup (accept Groq Orpheus terms for avatar lip-sync)'
                : rateLimited
                  ? 'Female browser/phone voice backup (Groq TTS rate limit)'
                  : 'Female browser/phone voice backup',
            );
            setErrorMessage(
              termsBlocked
                ? 'Accept Groq Orpheus TTS terms once, then restart: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english'
                : prepared.tts.message || 'Avatar voice could not be generated — using device voice.',
            );
            void local.ended.then(() => {
              if (abort.signal.aborted) return;
              speakingRef.current = false;
              if (statusRef.current === 'speaking') {
                setStatusSafe('connected');
                setUserStatus(
                  termsBlocked
                    ? 'Avatar ready — accept Groq Orpheus terms for lip-sync voice'
                    : rateLimited
                      ? 'Avatar ready — Groq TTS limit; female browser/phone voice until reset'
                      : 'Avatar ready',
                );
              }
              safeStartListening();
            });
            return;
          }

          setBrowserTtsFallback({ active: false, reason: null, voicePreference: null });
          setUserStatus('Voice unavailable — add GROQ_API_KEY for LITE TTS');
          setErrorMessage(
            prepared.tts.message || 'Avatar voice could not be generated.',
          );
          return;
        }

        setBrowserTtsFallback({ active: false, reason: null, voicePreference: null });

        if (prepared.tts.validatedText !== args.validatedText) {
          setDelivery({
            ...prepared.delivery,
            speechGenerated: false,
            failureStage: 'liveavatar_delivery',
            failureMessage: 'Text integrity check failed',
          });
          return;
        }

        const useFullSpeakText =
          prepared.mode === 'FULL' || prepared.tts.delivery === 'speak_text';

        // FULL TTS speed/affect are locked at token creation — recreate when they change.
        // LITE applies speed via Groq TTS per utterance (no session recreate).
        const needsVoiceRecreate =
          useFullSpeakText &&
          (speedsDiffer(sessionVoiceSpeedRef.current, targetSpeed) ||
            voiceAffectsDiffer(sessionVoiceAffectRef.current, targetAffect));

        if (needsVoiceRecreate) {
          setUserStatus('Adjusting presence…');
          recreatingForPaceRef.current = true;
          try {
            await releaseSession();
            const ok = await runSessionStartRef.current({
              voiceSpeed: targetSpeed,
              voiceAffect: targetAffect,
              avatarExpression: expressionRef.current,
            });
            if (!ok || !sessionRef.current) {
              setDelivery({
                ...prepared.delivery,
                failureStage: 'liveavatar_delivery',
                failureMessage: 'Could not apply speaking presence',
              });
              return;
            }
          } finally {
            recreatingForPaceRef.current = false;
          }
        }

        if (interruptRequestedRef.current) {
          setDelivery({ ...prepared.delivery, interrupted: true });
          return;
        }

        const sdk = sessionRef.current;
        if (!sdk) {
          setDelivery({ ...prepared.delivery, interrupted: true });
          return;
        }

        // Leave listening pose before speaking.
        safeStopListening();
        setStatusSafe('speaking');
        setUserStatus('Speaking…');
        speakingRef.current = true;

        if (useFullSpeakText) {
          // FULL mode: LiveAvatar built-in TTS speaks host text verbatim.
          sdk.repeat(prepared.tts.validatedText);
          setDelivery({
            ...prepared.delivery,
            speechGenerated: true,
            speechStarted: true,
            ttsProvider: 'liveavatar-full',
            audioFormat: 'liveavatar_builtin_tts',
          });
        } else {
          if (!prepared.tts.audioBase64) {
            setDelivery({
              ...prepared.delivery,
              failureStage: 'tts',
              failureMessage: 'Missing PCM audio for LITE delivery',
            });
            setUserStatus('Voice unavailable — missing TTS audio');
            speakingRef.current = false;
            safeStartListening();
            return;
          }

          // Hear Groq TTS in-browser; LiveAvatar uses the same PCM for lip-sync.
          stopLocalAudio();
          const abort = new AbortController();
          localAudioAbortRef.current = abort;
          const local = playPcmS16leBase64(prepared.tts.audioBase64, {
            sampleRate: prepared.tts.sampleRate ?? 24_000,
            signal: abort.signal,
          });
          localAudioStopRef.current = local.stop;

          try {
            sdk.repeatAudio(prepared.tts.audioBase64);
          } catch (error) {
            setFailures((n) => n + 1);
            setDelivery({
              ...prepared.delivery,
              failureStage: 'liveavatar_delivery',
              failureMessage:
                error instanceof Error ? error.message : 'LITE speak failed',
            });
            // Still keep local audio playing so the user hears the reply.
          }

          setDelivery({
            ...prepared.delivery,
            speechGenerated: true,
            speechStarted: true,
            ttsProvider: prepared.tts.provider,
            audioFormat: `${prepared.tts.encoding}@${prepared.tts.sampleRate}Hz`,
          });
          setUserStatus('Speaking…');
        }
      } catch {
        setFailures((n) => n + 1);
        setDelivery({
          assistantTurnId: args.assistantTurnId,
          requested: true,
          speechGenerated: false,
          speechStarted: false,
          speechCompleted: false,
          interrupted: false,
          failureStage: 'liveavatar_delivery',
          failureMessage: 'Avatar delivery failed',
        });
        if (statusRef.current === 'speaking') {
          setStatusSafe('connected');
          setUserStatus('Avatar ready');
        }
        speakingRef.current = false;
        safeStartListening();
      }
    },
    [releaseSession, safeStartListening, safeStopListening, stopLocalAudio, stopSpeaking, setStatusSafe],
  );

  const isLive =
    status === 'connected' ||
    status === 'speaking' ||
    status === 'connecting' ||
    status === 'starting';

  const developerSnapshot: LiveAvatarDeveloperSnapshot = {
    enabled: Boolean(config?.enabled),
    configured: Boolean(config?.configured),
    mode: config ? (config.sandbox ? 'Sandbox' : 'Production') : 'unknown',
    avatarConfigured: Boolean(config?.avatarConfigured),
    apiKeyServerSideOnly: true,
    apiKeyExposedToClient: false,
    status,
    sessionIdMasked: maskSessionId(sessionIdRef.current ?? ''),
    sessionDurationSeconds,
    reconnectAttempts,
    delivery,
    embodiment,
    appliedVoice,
    ttsProvider: delivery?.ttsProvider ?? (config?.ttsConfigured ? 'configured' : 'none'),
    audioFormat: config
      ? `${config.audioFormat.encoding}@${config.audioFormat.sampleRateHz}Hz`
      : 'pcm_s16le@24000Hz',
    staticAvatarActive: !(status === 'connected' || status === 'speaking'),
    fallbackReason:
      delivery?.failureStage ??
      (status === 'not_configured' ? config?.missingReason ?? 'not_configured' : null),
    permanentKeySentToBrowser: false,
    secretInFrontendBundle: false,
    browserTtsFallback,
  };

  const exportMeta: LiveAvatarSessionExportMeta = {
    avatarMode: status === 'connected' || status === 'speaking' ? 'live' : 'static',
    liveAvatarSandbox: Boolean(config?.sandbox),
    liveAvatarSessionStarted: sessionStartedOnce,
    liveAvatarSessionDurationSeconds: sessionDurationSeconds,
    liveAvatarFailures: failures,
    avatarSpeechInterruptions: interruptions,
    embodimentPoliciesUsed,
  };

  return {
    config,
    status,
    userStatus,
    errorMessage,
    showConsent,
    consentAccepted,
    sessionDurationLabel: formatDuration(sessionDurationSeconds),
    sessionDurationSeconds,
    isLiveConnected: status === 'connected' || status === 'speaking',
    showLiveVideo: isLive,
    developerSnapshot,
    exportMeta,
    delivery,
    embodiment,
    /** LITE plays TTS in-browser; mute LiveKit remote audio to avoid doubling. */
    remoteAudioEnabled: config?.mode !== 'LITE',
    videoElement,
    attachVideo,
    startAvatar,
    confirmConsent,
    dismissConsent: () => setShowConsent(false),
    stopSpeaking,
    setListeningPose,
    endAvatar,
    deliverValidatedResponse,
  };
}

export type UseLiveAvatarReturn = ReturnType<typeof useLiveAvatar>;
