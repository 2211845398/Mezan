import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

vi.mock('@/components/ui/calendar', () => ({
  Calendar: () => null,
}));

function Harness() {
  const [from, setFrom] = useState('2026-05-01');
  const [to, setTo] = useState('2026-06-08');

  return (
    <>
      <DateRangeFields
        fromValue={from}
        toValue={to}
        onFromChange={setFrom}
        onToChange={setTo}
        fromLabel={<span>From</span>}
        toLabel={<span>To</span>}
      />
      <div data-testid="to-value">{to}</div>
      <button type="button" onClick={() => setFrom('2026-06-10')}>
        advance-from
      </button>
    </>
  );
}

describe('DateRangeFields', () => {
  it('clears the end date when start moves past it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    expect(screen.getByTestId('to-value')).toHaveTextContent('2026-06-08');

    await user.click(screen.getByRole('button', { name: 'advance-from' }));

    expect(screen.getByTestId('to-value')).toHaveTextContent('');
  });
});
