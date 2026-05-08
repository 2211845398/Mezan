import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DateField } from '@/components/shared/form/DateField';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

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
    vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the currently-selected date on the trigger', () => {
    renderWithProviders(<Harness initial="2026-04-22" />);
    expect(screen.getByRole('button', { name: 'date' })).toHaveTextContent('2026-04-22');
  });

  it('updates the value when a calendar day is picked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Harness initial="2026-04-22" />);

    await user.click(screen.getByRole('button', { name: 'date' }));
    // Click the 10th of the currently-shown month.
    const day = await screen.findByRole('button', { name: /10/ });
    await user.click(day);

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toMatch(/^2026-04-10$/);
    });
  });
});
