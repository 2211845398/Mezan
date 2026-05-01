import { describe, expect, it } from 'vitest';

import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

describe('NotificationCenter', () => {
  it('shows unread notifications and lets the user open the panel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    expect(await screen.findByText('1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /فتح الإشعارات|open notifications/i }));
    expect(await screen.findByText('Hello cashier')).toBeInTheDocument();
    expect(screen.getByText('Open your shift')).toBeInTheDocument();
  });
});
