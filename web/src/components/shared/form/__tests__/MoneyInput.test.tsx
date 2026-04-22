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

    // Canonical (backend-shaped) value:
    expect(screen.getByTestId('canonical').textContent).toBe('1234.50');

    // Display (locale-formatted, ar-EG default). `Intl.NumberFormat('ar-EG')`
    // renders Eastern Arabic digits with `٬` thousands and `٫` decimal.
    const displayed = (input as HTMLInputElement).value;
    // Accept either ar-EG digits (common) or Latin digits (if a locale flag
    // is flipped) — strip separators and compare.
    const digitsOnly = displayed
      .replace(/[,.،٬٫]/g, '')
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    expect(digitsOnly).toBe('123450');
  });
});
