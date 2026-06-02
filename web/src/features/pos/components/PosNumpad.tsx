import { Delete } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PosNumpadProps = {
  disabled?: boolean;
  buffer: string;
  onBufferChange: (next: string) => void;
  onApply: () => void;
  onClear: () => void;
};

const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'] as const;

const keyBtnClass =
  'h-11 border-border bg-background text-base font-semibold shadow-sm hover:bg-muted';

export function PosNumpad({ disabled, buffer, onBufferChange, onApply, onClear }: PosNumpadProps) {
  const { t } = useTranslation('pos');

  function appendKey(key: string) {
    if (disabled) return;
    if (key === '.' && buffer.includes('.')) return;
    if (buffer === '0' && key !== '.') {
      onBufferChange(key);
      return;
    }
    onBufferChange(buffer + key);
  }

  function backspace() {
    if (disabled || !buffer) return;
    onBufferChange(buffer.slice(0, -1));
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/20 p-2">
      <p className="text-center text-xs font-medium text-muted-foreground">{t('numpad.mode_qty')}</p>
      <div
        className="rounded-md border border-border bg-background px-3 py-2 text-end text-lg font-semibold tabular-nums num-latin"
        dir="ltr"
        aria-live="polite"
      >
        {buffer || '0'}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {DIGIT_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            className={keyBtnClass}
            disabled={disabled}
            onClick={() => appendKey(key)}
          >
            {key}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className={cn(keyBtnClass)}
          disabled={disabled}
          onClick={backspace}
          aria-label={t('numpad.backspace')}
        >
          <Delete className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(keyBtnClass, 'text-xs')}
          disabled={disabled}
          onClick={onClear}
        >
          {t('numpad.clear')}
        </Button>
        <Button
          type="button"
          className="col-span-2 h-11 font-semibold"
          disabled={disabled || !buffer}
          onClick={onApply}
        >
          {t('numpad.apply')}
        </Button>
      </div>
    </div>
  );
}
