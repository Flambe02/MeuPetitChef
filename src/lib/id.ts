/**
 * A random UUID, resilient to `crypto.randomUUID`'s secure-context requirement.
 *
 * `crypto.randomUUID()` only exists on HTTPS or localhost — testing this app
 * over plain HTTP on a LAN IP (a phone on the same network as a dev machine)
 * or on an older WebView is enough to lose it, and the failure mode is a hard
 * crash ("crypto.randomUUID is not a function"), not a graceful fallback.
 * `crypto.getRandomValues` carries no such restriction and is supported
 * everywhere `crypto` exists at all, so the RFC 4122 v4 layout is built from
 * that instead. `Math.random` is the last resort for the handful of runtimes
 * with no `crypto` object whatsoever — acceptable here, since this id only
 * ever becomes a storage path segment or a primary key, never a secret.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
