import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang?: string;
}

/**
 * Browser speech-to-text → app chat pipeline.
 * Keeps medical replies on the Worker path (avatar only speaks validated text).
 */
export function useVoiceInput({
  onFinalTranscript,
  onListeningChange,
  lang = 'en-US',
}: UseVoiceInputOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldBeListeningRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  const onListeningChangeRef = useRef(onListeningChange);
  onFinalRef.current = onFinalTranscript;
  onListeningChangeRef.current = onListeningChange;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const setListeningSafe = useCallback((next: boolean) => {
    setListening(next);
    onListeningChangeRef.current?.(next);
  }, []);

  const stop = useCallback(() => {
    shouldBeListeningRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      rec?.stop();
    } catch {
      try {
        rec?.abort();
      } catch {
        // ignore
      }
    }
    setListeningSafe(false);
  }, [setListeningSafe]);

  const start = useCallback(() => {
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge, or type instead.');
      return false;
    }

    // Stop any prior instance without clearing the "want to listen" intent.
    const prior = recognitionRef.current;
    recognitionRef.current = null;
    try {
      prior?.abort();
    } catch {
      // ignore
    }

    shouldBeListeningRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        }
      }
      const trimmed = finalText.trim();
      if (trimmed) {
        onFinalRef.current(trimmed);
      }
    };

    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown';
      if (code === 'aborted' || code === 'no-speech') {
        setListeningSafe(false);
        return;
      }
      if (code === 'not-allowed') {
        setError('Microphone permission was denied. Allow the mic to talk with the avatar.');
      } else {
        setError('Could not hear that. Tap Talk again, or type your message.');
      }
      shouldBeListeningRef.current = false;
      setListeningSafe(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      shouldBeListeningRef.current = false;
      setListeningSafe(false);
    };

    try {
      recognition.start();
      setListeningSafe(true);
      return true;
    } catch {
      setError('Could not start the microphone. Try again or type your message.');
      shouldBeListeningRef.current = false;
      setListeningSafe(false);
      return false;
    }
  }, [lang, setListeningSafe]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    supported,
    listening,
    error,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  };
}
