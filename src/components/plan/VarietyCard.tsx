import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import type { WeeklyVarietyReport } from '@/lib/planning/types';
import { PROTEIN_LABEL } from '@/lib/planning/variety';

const ORDER: (keyof WeeklyVarietyReport['proteinCounts'])[] = [
  'frango',
  'peixe',
  'carne',
  'ovo',
  'vegetal',
  'outro',
];

export function VarietyCard({ report, onImprove }: { report: WeeklyVarietyReport; onImprove: () => void }) {
  const rows = ORDER.filter((type) => report.proteinCounts[type] > 0);
  if (rows.length === 0) return null;

  return (
    <Card className="p-4">
      <CardTitle>Variedade da semana</CardTitle>

      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((type) => (
          <div key={type} className="flex items-center justify-between text-small text-ink">
            <span>{PROTEIN_LABEL[type]}</span>
            <span className="font-mono text-ink-muted">{report.proteinCounts[type]}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-hairline pt-3">
        <DataLabel value={`${String(report.score)}/100`}>Variedade</DataLabel>
      </div>

      {report.suggestion ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-small text-ink-muted">{report.suggestion}</p>
          <button
            type="button"
            onClick={onImprove}
            className="self-start text-small font-semibold text-rouge underline underline-offset-4"
          >
            Melhorar variedade
          </button>
        </div>
      ) : null}
    </Card>
  );
}
