import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  minEndDateFromStart,
  useDateRangeConstraint,
} from '@/hooks/useDateRangeConstraint';

describe('minEndDateFromStart', () => {
  it('returns trimmed start date when set', () => {
    expect(minEndDateFromStart(' 2026-06-01 ')).toBe('2026-06-01');
  });

  it('returns undefined for empty start', () => {
    expect(minEndDateFromStart('')).toBeUndefined();
    expect(minEndDateFromStart('   ')).toBeUndefined();
  });
});

describe('useDateRangeConstraint', () => {
  it('exposes minToDate from the start value', () => {
    const setTo = vi.fn();
    const { result } = renderHook(() =>
      useDateRangeConstraint('2026-06-01', '2026-06-08', setTo),
    );

    expect(result.current.minToDate).toBe('2026-06-01');
  });

  it('clears end when it becomes before start', () => {
    const setTo = vi.fn();
    const { rerender } = renderHook(
      ({ from, to }: { from: string; to: string }) =>
        useDateRangeConstraint(from, to, setTo),
      { initialProps: { from: '2026-05-01', to: '2026-06-08' } },
    );

    act(() => {
      rerender({ from: '2026-06-10', to: '2026-06-08' });
    });

    expect(setTo).toHaveBeenCalledWith('');
  });
});
