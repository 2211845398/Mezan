import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { listProducts } from '@/features/catalog/api';

type Props = {
  disabled?: boolean;
  pickLabel: string;
  onPick: (row: {
    product_id: number;
    pick_label: string;
    uom_id?: number;
    uom_symbol?: string;
  }) => void;
};

export default function PoLineProductPicker({ disabled, pickLabel, onPick }: Props) {
  const { t } = useTranslation('purchasing');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(q.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['purchasing', 'product-search', debounced],
    queryFn: () => listProducts({ q: debounced, limit: 50, status: 'active' }),
    enabled: open && debounced.length > 0,
  });

  const inputValue = open ? q : pickLabel;

  return (
    <div className="relative">
      <Input
        className="h-9"
        disabled={disabled}
        value={inputValue}
        placeholder={t('orders.form.product_search_placeholder')}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180);
        }}
      />
      {open && debounced.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {isFetching ? (
            <li className="rounded-sm px-2 py-2 text-muted-foreground">…</li>
          ) : hits.length === 0 ? (
            <li className="rounded-sm px-2 py-2 text-muted-foreground">{t('orders.form.product_search_empty')}</li>
          ) : (
            hits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-2 text-start hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick({
                      product_id: p.id,
                      pick_label: `${p.name} — ${p.sku}`,
                      ...(p.uom_id != null ? { uom_id: p.uom_id } : {}),
                      uom_symbol: p.uom_symbol ?? 'pcs',
                    });
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground"> · {p.sku}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
