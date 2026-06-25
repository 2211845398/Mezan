import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';

import { useDateRangeConstraint } from '@/hooks/useDateRangeConstraint';
import { cn } from '@/lib/utils';

import { DateField, type DateFieldHandle } from './DateField';

export type DateRangeFieldsHandle = {
  commitPending: () => { from: string; to: string };
};

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

export const DateRangeFields = forwardRef<DateRangeFieldsHandle, DateRangeFieldsProps>(
  function DateRangeFields(
    {
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
    },
    ref,
  ) {
    const fromRef = useRef<DateFieldHandle>(null);
    const toRef = useRef<DateFieldHandle>(null);
    const { minToDate } = useDateRangeConstraint(fromValue, toValue, onToChange);

    useImperativeHandle(
      ref,
      () => ({
        commitPending: () => ({
          from: fromRef.current?.commitPending() ?? fromValue,
          to: toRef.current?.commitPending() ?? toValue,
        }),
      }),
      [fromValue, toValue],
    );

    return (
      <div className={cn('flex flex-wrap items-end gap-3', className)}>
        <div className={cn('grid gap-1', cellClassName, fromCellClassName)}>
          {fromLabel}
          <DateField
            ref={fromRef}
            id={fromId}
            value={fromValue}
            onChange={onFromChange}
            className={fieldClassName}
          />
        </div>
        <div className={cn('grid gap-1', cellClassName, toCellClassName)}>
          {toLabel}
          <DateField
            ref={toRef}
            id={toId}
            value={toValue}
            onChange={onToChange}
            minSelectableDate={minToDate}
            className={fieldClassName}
          />
        </div>
      </div>
    );
  },
);
