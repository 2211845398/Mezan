import type { TFunction } from 'i18next';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { localizedUomLabel } from '@/lib/localizedUom';
import { cn } from '@/lib/utils';

export type CartLineUomOption = {
  uom_id: number;
  code: string;
  symbol: string;
  name: string;
};

export type CartLineUomToggleProps = {
  options: CartLineUomOption[];
  activeUomId: number;
  editable: boolean;
  onSelect: (uomId: number) => void;
  /** Shown on the popover trigger when options.length > 3. */
  triggerLabel?: string;
};

function optionLabel(opt: CartLineUomOption, tc: TFunction): string {
  return localizedUomLabel(opt.code, tc) || opt.name;
}

export function CartLineUomToggle({
  options,
  activeUomId,
  editable,
  onSelect,
  triggerLabel,
}: CartLineUomToggleProps) {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('catalog');
  const [uomOpen, setUomOpen] = useState(false);

  if (options.length <= 1) return null;

  const activeOpt = options.find((o) => o.uom_id === activeUomId) ?? options[0]!;
  const activeLabel = triggerLabel ?? optionLabel(activeOpt, tc);

  if (options.length > 3) {
    if (!editable) {
      return (
        <span className="text-[11px] text-muted-foreground sm:text-xs">{activeLabel}</span>
      );
    }

    return (
      <Popover open={uomOpen} onOpenChange={setUomOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-border/70 bg-muted/20 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 sm:text-sm"
            aria-label={t('register.change_uom')}
          >
            {activeLabel}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="center">
          {options.map((opt) => {
            const isActive = opt.uom_id === activeUomId;
            const label = optionLabel(opt, tc);
            return (
              <button
                key={opt.uom_id}
                type="button"
                className={cn(
                  'flex min-h-11 w-full cursor-default select-none items-center rounded-md px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted',
                  isActive && 'bg-muted/70 font-medium text-foreground',
                )}
                onClick={() => {
                  if (!isActive) onSelect(opt.uom_id);
                  setUomOpen(false);
                }}
              >
                {isActive ? (
                  <Check className="me-2 size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <span className="me-2 inline-block size-4 shrink-0" aria-hidden />
                )}
                {label}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('register.change_uom')}
      className="inline-flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-lg border border-border/70 bg-muted/20 p-0.5"
    >
      {options.map((opt) => {
        const isActive = opt.uom_id === activeUomId;
        const label = optionLabel(opt, tc);
        return (
          <button
            key={opt.uom_id}
            type="button"
            disabled={!editable}
            aria-pressed={isActive}
            aria-label={label}
            className={cn(
              'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors sm:text-sm',
              isActive
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-transparent bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              !editable && 'cursor-default opacity-70',
            )}
            onClick={() => {
              if (!isActive && editable) onSelect(opt.uom_id);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
