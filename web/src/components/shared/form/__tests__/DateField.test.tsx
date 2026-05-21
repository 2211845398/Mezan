import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DateField } from '@/components/shared/form/DateField';
import { fromISO } from '@/lib/date';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/utils';

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
  }: {
    onSelect?: (date: Date | undefined) => void;
  }) => (
    <button type="button" onClick={() => onSelect?.(fromISO('2026-04-10T12:00:00Z'))}>
      pick-day
    </button>
  ),
}));

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField value={value} onChange={setValue} aria-label="date" />
      <div data-testid="value">{value}</div>
    </>
  );
}

describe('DateField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fromISO('2026-04-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the currently-selected date on the trigger', () => {
    renderWithProviders(<Harness initial="2026-04-22" />);
    expect(screen.getByRole('button', { name: 'date' })).toHaveTextContent('2026-04-22');
  });

  it('updates the value when a calendar day is picked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderWithProviders(<Harness initial="2026-04-22" />);

    await user.click(screen.getByRole('button', { name: 'date' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'pick-day' }));

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toMatch(/^2026-04-10$/);
    });
    vi.useFakeTimers();
    vi.setSystemTime(fromISO('2026-04-10T12:00:00Z'));
  });
});
