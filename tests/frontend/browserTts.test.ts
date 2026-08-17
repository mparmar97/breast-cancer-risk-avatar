import { describe, expect, it } from 'vitest';
import { isSafariBrowser } from '../../src/liveavatar/audioUnlock';
import { pcmS16leToWavBlob } from '../../src/liveavatar/playPcm';
import {
  chunkTextForBrowserTts,
  isGroqTtsRateLimitError,
  isMobileBrowser,
  pickBrowserTtsVoice,
  resolveBrowserTtsPreference,
} from '../../src/liveavatar/browserTts';

describe('pickBrowserTtsVoice', () => {
  it('prefers a female en-US voice over a male default on desktop', () => {
    const chosen = pickBrowserTtsVoice([
      { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false },
      { name: 'Microsoft Mark - English (United States)', lang: 'en-US', default: false },
    ]);
    expect(chosen?.name).toMatch(/Zira/i);
  });

  it('uses the device default English voice on mobile preference', () => {
    const chosen = pickBrowserTtsVoice(
      [
        { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
        { name: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false },
      ],
      { preference: 'device_default' },
    );
    expect(chosen?.name).toMatch(/David/i);
    expect(chosen?.default).toBe(true);
  });

  it('avoids known male voices when no explicit female match exists', () => {
    const chosen = pickBrowserTtsVoice([
      { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
      { name: 'Google UK English Female', lang: 'en-GB', default: false },
    ]);
    expect(chosen?.name).toMatch(/Female/i);
  });
});

describe('resolveBrowserTtsPreference', () => {
  it('prefers female voices on mobile and desktop', () => {
    expect(
      resolveBrowserTtsPreference({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      }),
    ).toBe('female_preferred');
    expect(
      resolveBrowserTtsPreference({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      }),
    ).toBe('female_preferred');
    expect(isMobileBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
  });

  it('only uses device default when explicitly requested', () => {
    expect(resolveBrowserTtsPreference({ preferDeviceDefault: true })).toBe('device_default');
  });
});

describe('pickBrowserTtsVoice mobile female', () => {
  it('picks a female iOS-style voice over a male default', () => {
    const chosen = pickBrowserTtsVoice(
      [
        { name: 'Aaron', lang: 'en-US', default: true },
        { name: 'Samantha', lang: 'en-US', default: false },
      ],
      { preference: 'female_preferred' },
    );
    expect(chosen?.name).toMatch(/Samantha/i);
  });
});

describe('isGroqTtsRateLimitError', () => {
  it('detects Groq daily TTS limit messages', () => {
    expect(
      isGroqTtsRateLimitError(
        'Groq Orpheus daily TTS limit reached (try again in 2h). Using browser voice until the limit resets.',
      ),
    ).toBe(true);
    expect(isGroqTtsRateLimitError('rate_limit_exceeded')).toBe(true);
  });
});

describe('chunkTextForBrowserTts', () => {
  it('splits long text for mobile speechSynthesis', () => {
    const long = `${'This is a sentence. '.repeat(20)}Done.`;
    const chunks = chunkTextForBrowserTts(long, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Done.');
  });
});

describe('Safari playback helpers', () => {
  it('detects Safari but not Chrome', () => {
    expect(
      isSafariBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe(true);
    expect(
      isSafariBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('builds a valid WAV header for PCM playback', async () => {
    const samples = new Int16Array([0, 1000, -1000, 0]);
    const blob = pcmS16leToWavBlob(samples, 24_000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + samples.length * 2);
  });
});
