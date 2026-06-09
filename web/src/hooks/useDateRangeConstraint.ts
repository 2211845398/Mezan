import { useEffect } from 'react';

/** ISO `YYYY-MM-DD` start date for constraining an end-date field, or `undefined` if unset. */
export function minEndDateFromStart(from: string): string | undefined {
  const trimmed = from.trim();
  return trimmed || undefined;
}

/**
 * Keeps a date-range "to" value on or after "from".
 * - Returns `minToDate` for `DateField.minSelectableDate`.
 * - Clears `to` when it becomes strictly before `from`.
 */
export function useDateRangeConstraint(
  from: string,
  to: string,
  setTo: (value: string) => void,
): { minToDate: string | undefined } {
  const minToDate = minEndDateFromStart(from);

  useEffect(() => {
    const start = from.trim();
    const end = to.trim();
    if (!start || !end) return;
    if (end < start) {
      setTo('');
    }
  }, [from, to, setTo]);

  return { minToDate };
}
