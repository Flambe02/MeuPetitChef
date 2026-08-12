import { Bell, Clock, Gauge, RotateCw, Settings2, Thermometer } from 'lucide-react';
import type { ComponentType } from 'react';

import type { EquipmentTheme } from '@/domain/equipment';
import type { DialKind } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * One cook-mode dial: time, temperature, speed, an alert.
 *
 * The outline takes the *appliance's* shape, not a fixed circle — a Thermomix
 * step is ringed, an oven step is boxed, a hob step is an octagon. That is what
 * makes a glance across the room tell you which machine you are standing at,
 * and it is why the shape lives in `EQUIPMENT_THEME` rather than here.
 */
const SHAPE_PATH: Record<EquipmentTheme['shape'], string> = {
  // Two arcs, because a `<circle>` cannot share the `<path>` element's API.
  circle: 'M100 6 a94 94 0 1 1 -0.1 0 Z',
  square:
    'M22 6 h156 a16 16 0 0 1 16 16 v156 a16 16 0 0 1 -16 16 h-156 a16 16 0 0 1 -16 -16 v-156 a16 16 0 0 1 16 -16 Z',
  octagon: 'M64 6 h72 l58 58 v72 l-58 58 h-72 l-58 -58 v-72 Z',
  diamond: 'M100 4 l96 96 l-96 96 l-96 -96 Z',
  triangle: 'M100 10 l92 172 h-184 Z',
};

/** Every `dial_kind`, so nothing ever falls through to the raw enum value. */
const KIND_ICON: Record<DialKind, ComponentType<{ className?: string }>> = {
  tempo: Clock,
  temperatura: Thermometer,
  velocidade: RotateCw,
  potencia: Gauge,
  modo: Settings2,
  alerta: Bell,
};

const KIND_LABEL: Record<DialKind, string> = {
  tempo: 'Tempo',
  temperatura: 'Temperatura',
  velocidade: 'Velocidade',
  // Was missing, so the screen printed the raw enum: "POTENCIA", unaccented.
  potencia: 'Potência',
  modo: 'Modo',
  alerta: 'Alerta',
};

export function Dial({
  kind,
  value,
  sub,
  shape,
  accent,
  className,
}: {
  kind: DialKind;
  value: string;
  sub?: string | null;
  shape: EquipmentTheme['shape'];
  /** CSS colour — the appliance accent, e.g. `var(--color-eq-oven)`. */
  accent: string;
  className?: string;
}) {
  const Icon = KIND_ICON[kind];

  return (
    // Everything inside is sized in `em`, so the whole dial scales from this one
    // font-size. A phone held sideways gives cook mode roughly 280px of height:
    // at a fixed 158px the dials and the verb line get clipped by the centring.
    <div
      className={cn('relative aspect-square shrink-0', className)}
      style={{ fontSize: 'clamp(9px, 2.6vh, 13px)', width: 'clamp(108px, 31vh, 158px)' }}
    >
      <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <path
          d={SHAPE_PATH[shape]}
          fill="none"
          stroke={accent}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.3em] px-[2em] text-center">
        <Icon className="size-[1.15em] text-ink-muted" />
        <span className="font-mono text-[0.7em] tracking-[0.16em] text-ink-muted uppercase">
          {KIND_LABEL[kind]}
        </span>
        <span className="font-display text-[2em] leading-none font-bold tracking-[-0.02em] text-ink">
          {value}
        </span>
        {sub ? <span className="text-[0.85em] text-ink-muted">{sub}</span> : null}
      </div>
    </div>
  );
}
