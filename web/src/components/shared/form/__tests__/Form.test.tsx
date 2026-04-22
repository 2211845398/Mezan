import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Form } from '@/components/shared/form/Form';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

describe('Form', () => {
  it('validates via Zod and calls onSubmit with typed values', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Form schema={schema} onSubmit={onSubmit} defaultValues={{ email: '', password: '' }}>
        {(form) => (
          <>
            <label>
              email
              <input aria-label="email" type="email" {...form.register('email')} />
            </label>
            <label>
              password
              <input aria-label="password" type="password" {...form.register('password')} />
            </label>
            <button type="submit">go</button>
          </>
        )}
      </Form>,
    );

    // Invalid submission: Zod rejects, onSubmit must not fire.
    await user.type(screen.getByLabelText('email'), 'not-email');
    await user.type(screen.getByLabelText('password'), 'short');
    await user.click(screen.getByRole('button', { name: 'go' }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());

    // Valid submission: Zod passes, onSubmit fires with the typed values.
    await user.clear(screen.getByLabelText('email'));
    await user.type(screen.getByLabelText('email'), 'ok@example.com');
    await user.clear(screen.getByLabelText('password'));
    await user.type(screen.getByLabelText('password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'go' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { email: 'ok@example.com', password: 'correct-horse' },
        expect.anything(),
      ),
    );
  });
});
