import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="amount">amount</label>
      <MoneyInput id="amount" value={value} onChange={setValue} currency="EGP" />
      <div data-testid="canonical">{value}</div>
    </>
  );
}

describe('MoneyInput', () => {
  it('formats 1234.5 as 1,234.50 on blur and exposes canonical "1234.50" to RHF', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const input = screen.getByLabelText('amount');
    await user.click(input);
    await user.type(input, '1234.5');
    await user.tab();

    expect(screen.getByTestId('canonical').textContent).toBe('1234.50');

    const displayed = (input as HTMLInputElement).value;
    expect(displayed).not.toMatch(/[\u0660-\u0669]/);
    const digitsOnly = displayed.replace(/[,،٬٫\s]/g, '');
    expect(digitsOnly).toBe('1234.50');
  });

  it('strips minus signs and clamps to zero on blur by default', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const input = screen.getByLabelText('amount');
    await user.click(input);
    await user.type(input, '-25.5');
    await user.tab();

    expect(screen.getByTestId('canonical').textContent).toBe('0.00');
  });
});
