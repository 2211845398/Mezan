import type { ReactNode } from 'react';

import { useDateRangeConstraint } from '@/hooks/useDateRangeConstraint';
import { cn } from '@/lib/utils';

import { DateField } from './DateField';

export type DateRangeFieldsProps = {
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromLabel: ReactNode;
  toLabel: ReactNode;
  fromId?: string;
  toId?: string;
  fieldClassName?: string;
  /** Wrapper class for each label+field column (e.g. fixed width grids). */
  cellClassName?: string;
  fromCellClassName?: string;
  toCellClassName?: string;
  className?: string;
};

export function DateRangeFields({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  fromLabel,
  toLabel,
  fromId,
  toId,
  fieldClassName,
  cellClassName,
  fromCellClassName,
  toCellClassName,
  className,
}: DateRangeFieldsProps) {
  const { minToDate } = useDateRangeConstraint(fromValue, toValue, onToChange);

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className={cn('grid gap-1', cellClassName, fromCellClassName)}>
        {fromLabel}
        <DateField
          id={fromId}
          value={fromValue}
          onChange={onFromChange}
          className={fieldClassName}
        />
      </div>
      <div className={cn('grid gap-1', cellClassName, toCellClassName)}>
        {toLabel}
        <DateField
          id={toId}
          value={toValue}
          onChange={onToChange}
          minSelectableDate={minToDate}
          className={fieldClassName}
        />
      </div>
    </div>
  );
}
