import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, DataLabel } from '@/components/ui/Card';

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  showBack?: boolean;
  /** What this screen will do once the design is implemented. */
  planned: string[];
  /** The tables and RPCs already in place for it. */
  backing: string[];
}

/**
 * A screen whose data layer is wired but whose design is not built yet.
 *
 * These exist so navigation, routing, the shell and the tab bar can be
 * exercised end to end today, and so implementing a screen from the Claude
 * Design prototype is a matter of replacing one file — never of also inventing
 * where it sits or what it queries.
 */
export function PlaceholderScreen({
  title,
  subtitle,
  showBack = false,
  planned,
  backing,
}: PlaceholderScreenProps) {
  return (
    <>
      <ScreenHeader title={title} subtitle={subtitle} showBack={showBack} />

      <div className="flex flex-col gap-4 px-5 pb-8">
        <Card accent className="p-4">
          <DataLabel>A construir</DataLabel>
          <ul className="mt-3 flex flex-col gap-2">
            {planned.map((item) => (
              <li key={item} className="text-small text-ink">
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <DataLabel>Infraestrutura pronta</DataLabel>
          <ul className="mt-3 flex flex-col gap-2">
            {backing.map((item) => (
              <li key={item} className="font-mono text-[12px] text-ink-muted">
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
