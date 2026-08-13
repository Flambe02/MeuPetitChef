import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictation for the home screen's "Falar" button.
 *
 * Uses the browser's own SpeechRecognition — no backend. Support is uneven
 * (Chrome and Edge yes, Firefox no, iOS Safari only from 14.5), so `isSupported`
 * is what the UI must branch on: a mic button that silently does nothing is
 * worse than no mic button.
 *
 * Elapsed time is derived from an absolute start instant rather than counted up
 * in state, for the same reason the cook timer is — a throttled interval must
 * not be able to lose seconds.
 */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The recognizer's own error codes — see the Web Speech API spec. */
const ERROR_MESSAGE: Record<string, string> = {
  'not-allowed': 'home.speechErrorNotAllowed',
  'no-speech': 'home.speechErrorNoSpeech',
  network: 'home.speechErrorNetwork',
};

export function useSpeechInput(onResult: (transcript: string) => void, lang: 'pt' | 'fr' = 'pt') {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Kept in a ref, written from an effect, so `start` stays referentially stable
  // without capturing a stale callback.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  // Same reason: `start` reads the current language without needing to be
  // re-created (and therefore re-bound to the mic button) every time it changes.
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  });

  const isSupported = getRecognitionCtor() !== null;
  const isRecording = startedAt !== null;

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setTick(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsedMs = startedAt === null ? 0 : Math.max(0, tick - startedAt);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStartedAt(null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    setErrorKey(null);
    const recognition = new Ctor();
    recognition.lang = langRef.current === 'fr' ? 'fr-FR' : 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.addEventListener('result', (event) => {
      const { results } = event as unknown as {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      };
      let transcript = '';
      for (let i = 0; i < results.length; i += 1) {
        transcript += results[i]?.[0]?.transcript ?? '';
      }
      onResultRef.current(transcript.trim());
    });

    const finish = () => {
      recognitionRef.current = null;
      setStartedAt(null);
    };
    recognition.addEventListener('end', finish);
    recognition.addEventListener('error', (event) => {
      const { error } = event as unknown as { error?: string };
      setErrorKey(ERROR_MESSAGE[error ?? ''] ?? 'home.speechErrorGeneric');
      finish();
    });

    recognitionRef.current = recognition;
    recognition.start();
    setStartedAt(Date.now());
    setTick(Date.now());
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { isSupported, isRecording, elapsedMs, start, stop, errorKey };
}
