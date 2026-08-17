/**
 * Browser Speech Synthesis fallback when Groq Orpheus TTS is unavailable
 * (e.g. rate limit / terms). Speaks validated text only — no rewrite.
 *
 * Prefer a female English voice on desktop and mobile so the doctor-avatar
 * demo does not switch to a male OS/phone default.
 */

import { isSafariBrowser } from './audioUnlock';

const FEMALE_VOICE_NAME =
  /\b(female|zira|samantha|jenny|aria|sara|sarah|hazel|susan|karen|moira|fiona|tessa|veena|raveena|zoe|victoria|kate|serena|google\s*uk\s*english\s*female|google\s*us\s*english\s*female|microsoft\s*(jenny|aria|zira|sara)|siri)\b/i;

const MALE_VOICE_NAME =
  /\b(male|david|mark|guy|fred|daniel|thomas|george|ravi|sean|alex|aaron|microsoft\s*(david|mark|guy))\b/i;

export type BrowserTtsVoicePreference = 'female_preferred' | 'device_default';

export function isMobileBrowser(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

export function resolveBrowserTtsPreference(options?: {
  preferDeviceDefault?: boolean;
  userAgent?: string;
}): BrowserTtsVoicePreference {
  // Only use raw device default when explicitly requested.
  if (options?.preferDeviceDefault) return 'device_default';
  void options?.userAgent;
  void isMobileBrowser;
  return 'female_preferred';
}

export function pickBrowserTtsVoice(
  voices: ReadonlyArray<Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'>>,
  options?: { preference?: BrowserTtsVoicePreference },
): Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'> | undefined {
  const english = voices.filter((v) => /^en(-|_)/i.test(v.lang) || /^en$/i.test(v.lang));
  const pool = english.length > 0 ? english : [...voices];
  if (pool.length === 0) return undefined;

  const preference = options?.preference ?? 'female_preferred';

  if (preference === 'device_default') {
    const englishDefault = pool.find((v) => v.default);
    if (englishDefault) return englishDefault;
    const anyDefault = voices.find((v) => v.default);
    if (anyDefault) return anyDefault;
  }

  const enUsFemale = pool.find((v) => /en(-|_)?US/i.test(v.lang) && FEMALE_VOICE_NAME.test(v.name));
  if (enUsFemale) return enUsFemale;

  const anyFemale = pool.find((v) => FEMALE_VOICE_NAME.test(v.name));
  if (anyFemale) return anyFemale;

  // Mobile defaults are often female without "female" in the name — prefer non-male default.
  const defaultNonMale = pool.find((v) => v.default && !MALE_VOICE_NAME.test(v.name));
  if (defaultNonMale) return defaultNonMale;

  const enUsNonMale = pool.find((v) => /en(-|_)?US/i.test(v.lang) && !MALE_VOICE_NAME.test(v.name));
  if (enUsNonMale) return enUsNonMale;

  const anyNonMale = pool.find((v) => !MALE_VOICE_NAME.test(v.name));
  if (anyNonMale) return anyNonMale;

  return pool.find((v) => /^en/i.test(v.lang)) ?? pool[0];
}

function waitForVoices(synth: SpeechSynthesis, timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    const onChange = () => finish();
    const timer = window.setTimeout(finish, timeoutMs);
    synth.addEventListener('voiceschanged', onChange);
  });
}

/** Split long replies so mobile speechSynthesis does not stall mid-utterance. */
export function chunkTextForBrowserTts(text: string, maxChars = 180): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    const part = current.trim();
    if (part) chunks.push(part);
    current = '';
  };

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      push();
      let rest = piece;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < Math.floor(maxChars * 0.4)) cut = maxChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) current = rest;
      continue;
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= maxChars) current = candidate;
    else {
      push();
      current = piece;
    }
  }
  push();
  return chunks;
}

export function speakWithBrowserTts(
  text: string,
  options?: {
    rate?: number;
    signal?: AbortSignal;
    preferDeviceDefault?: boolean;
  },
): { stop: () => void; ended: Promise<void>; preference: BrowserTtsVoicePreference } {
  const preference = resolveBrowserTtsPreference({
    preferDeviceDefault: options?.preferDeviceDefault,
  });
  const utteranceText = text.trim();
  if (!utteranceText || typeof window === 'undefined' || !window.speechSynthesis) {
    return { stop: () => undefined, ended: Promise.resolve(), preference };
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      synth.cancel();
    } catch {
      // ignore
    }
  };

  if (options?.signal) {
    if (options.signal.aborted) {
      stop();
      return { stop, ended: Promise.resolve(), preference };
    }
    options.signal.addEventListener('abort', stop, { once: true });
  }

  const ended = (async () => {
    const safari = isSafariBrowser();
    // Safari/iOS: cancel() then speak() in the same turn is often silent.
    if (safari) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 80);
      });
    }

    const voices = await waitForVoices(synth, safari ? 2000 : 1200);
    if (stopped || options?.signal?.aborted) return;

    try {
      synth.resume();
    } catch {
      // ignore
    }

    const chosen = pickBrowserTtsVoice(voices, { preference });
    const chunks = chunkTextForBrowserTts(utteranceText, safari ? 120 : 180);
    const rate = clampRate(options?.rate ?? 1);

    const keepAlive = safari
      ? window.setInterval(() => {
          try {
            if (synth.speaking && synth.paused) synth.resume();
          } catch {
            // ignore
          }
        }, 200)
      : null;

    try {
      for (const chunk of chunks) {
        if (stopped || options?.signal?.aborted) return;
        await speakOneUtterance(synth, chunk, {
          rate,
          voice: chosen as SpeechSynthesisVoice | undefined,
          preferDeviceDefault: preference === 'device_default',
          safari,
          onStopCheck: () => stopped || Boolean(options?.signal?.aborted),
        });
      }
    } finally {
      if (keepAlive != null) window.clearInterval(keepAlive);
    }
  })();

  return { stop, ended, preference };
}

function speakOneUtterance(
  synth: SpeechSynthesis,
  text: string,
  options: {
    rate: number;
    voice?: SpeechSynthesisVoice;
    preferDeviceDefault: boolean;
    safari?: boolean;
    onStopCheck: () => boolean;
  },
): Promise<void> {
  return new Promise((resolve) => {
    if (options.onStopCheck()) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.safari ? Math.min(options.rate, 1.05) : options.rate;
    utterance.volume = 1;
    utterance.lang = 'en-US';
    // Safari often goes silent if pitch is tweaked or a mismatched voice object is set.
    utterance.pitch = options.safari ? 1 : 1.05;
    if (options.voice && !options.safari) {
      utterance.voice = options.voice;
    } else if (options.voice && /female|samantha|karen|moira|tessa|fiona|siri|zoe|victoria/i.test(options.voice.name)) {
      utterance.voice = options.voice;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      resolve();
    };
    const watchdog = window.setTimeout(finish, Math.max(4000, text.length * 80));
    utterance.onend = () => finish();
    utterance.onerror = () => finish();
    try {
      synth.resume();
    } catch {
      // ignore
    }
    synth.speak(utterance);
  });
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1.4, Math.max(0.7, rate));
}

export function isGroqTtsTermsError(message: string | undefined): boolean {
  if (!message) return false;
  // Only real terms-gate errors — do not treat every Orpheus failure as terms.
  return /terms acceptance|model_terms_required|one-time terms acceptance/i.test(message);
}

export function isGroqTtsRateLimitError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /daily TTS limit reached|rate_limit_exceeded|tokens per day|TPD|Using browser voice|429/i.test(
      message,
    ) || /groq orpheus daily tts limit/i.test(message)
  );
}
