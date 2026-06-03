import type { TaxDefinitionRead } from '../api';

type ProductTaxChipsProps = {
  taxDefinitionIds?: number[];
  outputVatRate?: string | number | null;
  taxById: Map<number, TaxDefinitionRead>;
  className?: string;
};

function formatVatPct(raw: string | number | null | undefined): string {
  const n = Number.parseFloat(String(raw ?? '0'));
  if (!Number.isFinite(n)) return '0.00';
  return (n * 100).toFixed(2);
}

const chipClassName =
  'inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm';

/**
 * Read-only tax pills for catalog tables (`/catalog/products`), matching edit-form tag style.
 */
export function ProductTaxChips({
  taxDefinitionIds,
  outputVatRate,
  taxById,
  className,
}: ProductTaxChipsProps) {
  const ids = taxDefinitionIds?.length ? taxDefinitionIds : [];

  if (ids.length > 0) {
    return (
      <div className={`flex flex-wrap justify-start gap-1.5 ${className ?? ''}`}>
        {ids.map((id) => {
          const d = taxById.get(id);
          const name = d?.name ?? String(id);
          const pct = d ? formatVatPct(d.rate) : '—';
          return (
            <span key={id} className={chipClassName}>
              <span>{name}</span>
              <span className="num-latin text-muted-foreground">({pct}%)</span>
            </span>
          );
        })}
      </div>
    );
  }

  const pct = formatVatPct(outputVatRate);
  return (
    <div className={className}>
      <span className={chipClassName}>
        <span className="num-latin">{pct}%</span>
      </span>
    </div>
  );
}
