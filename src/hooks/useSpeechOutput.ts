import { useCallback, useEffect, useState } from 'react';

/**
 * "Ouvir a receita" — reads text aloud with the browser's own voice, no
 * backend, no API key. `window.speechSynthesis` is free and built into every
 * major browser, which is exactly the bar this feature needed to clear: a
 * paid or homegrown alternative would not have been worth adding.
 *
 * Two real quirks this works around:
 *   - `speechSynthesis.getVoices()` often returns an empty list until the
 *     `voiceschanged` event fires once, the first time a page uses it — so
 *     `isSupported` alone is not enough to know the voices are ready.
 *   - A new read must `cancel()` any utterance in flight first, or the
 *     browser silently queues instead of interrupting.
 */
export function useSpeechOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Chrome/Edge populate the voice list asynchronously; nothing here needs to
  // wait for it directly, but a first "speak" right after page load can pick a
  // fallback voice if the list is still empty. Touching `getVoices()` once and
  // listening for the change is enough to warm it up.
  useEffect(() => {
    if (!isSupported) return;
    window.speechSynthesis.getVoices();
    const warm = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', warm);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warm);
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    return () => window.speechSynthesis.cancel();
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, lang: 'pt' | 'fr') => {
      if (!isSupported || !text.trim()) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'fr' ? 'fr-FR' : 'pt-BR';
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  return { isSupported, isSpeaking, speak, stop };
}
