import type { VesselKind } from '@/domain/equipment';

/**
 * The appliance outline cook mode draws beside the current step.
 *
 * Traced from the prototype's own SVGs so the silhouettes match. Drawn in
 * `currentColor` at a very low opacity: it is scenery, not information — the
 * instruction and the dials carry everything the cook needs.
 */
const PATHS: Record<Exclude<VesselKind, 'none'>, React.ReactNode> = {
  bowl: (
    <>
      <path d="M56 66 h188 a10 10 0 0 1 10 10 v6 a10 10 0 0 1 -10 10 h-188 a10 10 0 0 1 -10 -10 v-6 a10 10 0 0 1 10 -10 Z" />
      <path d="M62 96 l22 136 a18 18 0 0 0 18 15 h96 a18 18 0 0 0 18 -15 l22 -136" />
      <path d="M254 100 h16 a8 8 0 0 1 8 8 v26 a8 8 0 0 1 -8 8 h-22" />
      <path d="M150 118 c14 22 14 62 0 96 c-14 -34 -14 -74 0 -96 Z" />
      <path d="M104 262 h92" />
    </>
  ),
  'air-fryer': (
    <>
      <path d="M86 44 h128 a18 18 0 0 1 18 18 v14 h-164 v-14 a18 18 0 0 1 18 -18 Z" />
      <path d="M68 84 h164 l-14 168 a16 16 0 0 1 -16 14 h-104 a16 16 0 0 1 -16 -14 Z" />
      <rect x="104" y="110" width="92" height="46" rx="8" />
      <circle cx="120" cy="124" r="4" />
      <circle cx="150" cy="124" r="4" />
      <circle cx="180" cy="124" r="4" />
      <circle cx="120" cy="142" r="4" />
      <circle cx="150" cy="142" r="4" />
      <circle cx="180" cy="142" r="4" />
      <path d="M84 178 h132" />
      <rect x="128" y="196" width="44" height="14" rx="7" />
    </>
  ),
  oven: (
    <>
      <rect x="30" y="40" width="240" height="212" rx="14" />
      <rect x="44" y="54" width="212" height="44" rx="9" />
      <circle cx="72" cy="76" r="11" />
      <circle cx="228" cy="76" r="11" />
      <rect x="102" y="64" width="96" height="24" rx="5" />
      <rect x="52" y="112" width="196" height="128" rx="10" />
      <rect x="70" y="130" width="160" height="92" rx="6" />
      <path d="M78 168 h144" />
      <path d="M78 196 h144" />
      <path d="M56 252 v16" />
      <path d="M244 252 v16" />
    </>
  ),
  stovetop: (
    <>
      <rect x="24" y="72" width="252" height="152" rx="14" />
      <rect x="40" y="88" width="152" height="120" rx="8" />
      <rect x="206" y="90" width="54" height="24" rx="5" />
      <rect x="208" y="128" width="20" height="12" rx="3" />
      <rect x="238" y="128" width="20" height="12" rx="3" />
      <rect x="208" y="150" width="20" height="12" rx="3" />
      <rect x="238" y="150" width="20" height="12" rx="3" />
      <circle cx="233" cy="188" r="18" />
      <path d="M46 224 v14" />
      <path d="M254 224 v14" />
    </>
  ),
};

export function Vessel({ kind, className }: { kind: VesselKind; className?: string }) {
  if (kind === 'none') return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 300"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {PATHS[kind]}
    </svg>
  );
}
