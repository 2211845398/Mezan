import { useState } from 'react';
import { describe, expect, it } from 'vitest';

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
  it('renders the currently-selected date on the trigger', () => {
    renderWithProviders(<Harness initial="2026-04-22" />);
    expect(screen.getByRole('button', { name: 'date' })).toHaveTextContent('2026-04-22');
  });

  it('updates the value when a calendar day is picked', async () => {
    const user = userEvent.setup();
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
