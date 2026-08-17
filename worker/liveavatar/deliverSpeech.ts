import type { Env } from '../types';
import { createSpeech } from '../tts/createSpeech';
import { chunkPcmForLiveAvatar, pcmToBase64 } from '../tts/audioConvert';
import type { TtsProvider } from '../tts/types';
import type { AvatarDeliveryMetadata, AvatarDeliveryRequest } from './types';
import type { EmbodimentPolicy } from '../embodiment/types';

/** Minimal duplex for LITE WebSocket command delivery (injectable for tests). */
export interface LiveAvatarSpeakTransport {
  send(payload: Record<string, unknown>): void | Promise<void>;
  waitForConnected?(timeoutMs?: number): Promise<void>;
  waitForSpeakEnded?(eventId: string, timeoutMs?: number): Promise<void>;
  isInterrupted?(): boolean;
}

export interface DeliverSpeechOptions {
  env: Env;
  request: AvatarDeliveryRequest;
  transport?: LiveAvatarSpeakTransport | null;
  connected: boolean;
  sessionId?: string;
  embodiment?: EmbodimentPolicy | null;
  ttsProvider?: TtsProvider;
  /** When true, prepare metadata/chunks but skip network (tests / dry-run). */
  dryRun?: boolean;
}

function newEventId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * validated assistant text → TTS → PCM chunks → LiveAvatar agent.speak.
 * Never paraphrases medical content. Requires assistantTurnId for integrity.
 */
export async function deliverSpeech(options: DeliverSpeechOptions): Promise<AvatarDeliveryMetadata> {
  const { request, env, transport, connected, sessionId, embodiment, ttsProvider, dryRun } = options;
  const meta: AvatarDeliveryMetadata = {
    assistantTurnId: request.assistantTurnId,
    requested: true,
    speechGenerated: false,
    speechStarted: false,
    speechCompleted: false,
    interrupted: false,
    sessionId,
    audioFormat: 'pcm_s16le@24000Hz_mono_base64',
  };

  if (!request.assistantTurnId.trim()) {
    return { ...meta, requested: false, failureStage: 'liveavatar_delivery', failureMessage: 'assistantTurnId required' };
  }
  if (!request.validatedText.trim()) {
    return { ...meta, requested: false, failureStage: 'liveavatar_delivery', failureMessage: 'validatedText empty' };
  }
  if (!connected) {
    return { ...meta, failureStage: 'not_connected', failureMessage: 'Avatar session not connected' };
  }

  const speech = await createSpeech(
    env,
    {
      text: request.validatedText,
      delivery: embodiment
        ? { tone: embodiment.deliveryTone, pace: embodiment.speakingPace }
        : undefined,
    },
    ttsProvider,
  );

  if (!speech.ok) {
    return {
      ...meta,
      failureStage: speech.reason === 'audio_conversion' ? 'audio_conversion' : 'tts',
      failureMessage: speech.message,
      ...(speech.reason === 'tts_not_configured' ? { failureStage: 'tts_not_configured' as const } : {}),
    };
  }

  meta.speechGenerated = true;
  meta.ttsProvider = speech.tts.provider;

  if (dryRun || !transport) {
    // Architecture ready; speech path validated without contacting LiveAvatar.
    meta.speechStarted = false;
    meta.speechCompleted = false;
    meta.failureStage = transport ? undefined : 'liveavatar_connection';
    meta.failureMessage = transport
      ? undefined
      : 'No LiveAvatar speak transport attached (dry-run / TTS-only)';
    return meta;
  }

  try {
    if (transport.waitForConnected) {
      await transport.waitForConnected(10_000);
    }
    if (transport.isInterrupted?.()) {
      meta.interrupted = true;
      return meta;
    }

    const eventId = newEventId('speak');
    const chunks = chunkPcmForLiveAvatar(speech.normalized.pcm);
    meta.speechStarted = true;

    for (const chunk of chunks) {
      if (transport.isInterrupted?.()) {
        meta.interrupted = true;
        await transport.send({ type: 'agent.interrupt' });
        return meta;
      }
      await transport.send({
        type: 'agent.speak',
        event_id: eventId,
        audio: pcmToBase64(chunk),
      });
    }

    await transport.send({ type: 'agent.speak_end', event_id: eventId });
    if (transport.waitForSpeakEnded) {
      await transport.waitForSpeakEnded(eventId, 60_000);
    }
    meta.speechCompleted = !transport.isInterrupted?.();
    if (transport.isInterrupted?.()) {
      meta.interrupted = true;
    }
    return meta;
  } catch (error) {
    return {
      ...meta,
      failureStage: 'liveavatar_delivery',
      failureMessage: error instanceof Error ? error.message : 'LiveAvatar delivery failed',
    };
  }
}

/** Interrupt in-flight avatar speech via official agent.interrupt. */
export async function interruptAvatarSpeech(transport: LiveAvatarSpeakTransport): Promise<void> {
  await transport.send({ type: 'agent.interrupt' });
}
