/**
 * Safari / iOS block audio until a user gesture unlocks Web Audio and
 * speechSynthesis. Call unlockPlaybackFromUserGesture() from Start avatar /
 * consent clicks so later Groq PCM and browser-voice fallback can be heard.
 */

let sharedContext: AudioContext | null = null;
let unlocked = false;

export function isSafariBrowser(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|EdgiOS|FxiOS|Android/i.test(userAgent);
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new Ctor();
  }
  return sharedContext;
}

export async function resumeSharedAudioContext(): Promise<AudioContext | null> {
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Safari may still resume on a later gesture.
    }
  }
  return ctx;
}

function speakSilentUnlock(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.lang = 'en-US';
    synth.speak(utterance);
    synth.pause();
    synth.resume();
  } catch {
    // ignore
  }
}

/** Must run in a click/tap handler. */
export function unlockPlaybackFromUserGesture(): void {
  unlocked = true;
  void resumeSharedAudioContext();
  speakSilentUnlock();
  if (typeof document === 'undefined') return;
  try {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', 'true');
    audio.muted = true;
    audio.volume = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

export function isPlaybackUnlocked(): boolean {
  return unlocked;
}
