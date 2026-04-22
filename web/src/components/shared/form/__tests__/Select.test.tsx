import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Select } from '@/components/shared/form/Select';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

function Harness() {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <>
      <Select
        aria-label="branch"
        placeholder="pick one"
        value={value}
        onChange={setValue}
        options={[
          { value: 'hq', label: 'HQ' },
          { value: 'store-a', label: 'Store A' },
        ]}
      />
      <div data-testid="value">{value ?? ''}</div>
    </>
  );
}

describe('Select', () => {
  it('lets the user pick an option and exposes the value', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const trigger = screen.getByRole('combobox', { name: 'branch' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const hq = await screen.findByRole('option', { name: 'HQ' });
    await user.click(hq);

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toBe('hq');
    });
  });
});
