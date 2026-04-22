import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import ShiftGate from '@/features/pos/pages/ShiftGate';
import { resetPosFixtures } from '@/test/msw/handlers/pos';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

describe('ShiftGate', () => {
  beforeEach(() => {
    resetPosFixtures();
    useAuthStore.getState().clear();
    useAuthStore.setState({
      status: 'authenticated',
      permissionsLoaded: true,
      activeBranchId: 1,
    });
    useAuthStore.getState().setPermissions([
      { resource: 'pos_shifts', action: 'read' },
      { resource: 'pos_shifts', action: 'open' },
      { resource: 'terminals', action: 'read' },
    ]);
  });

  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it('opens a shift on the selected terminal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ShiftGate />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /اختر الطرفية|Select terminal/i })).toBeInTheDocument();
    });

    const openBtn = screen.getByRole('button', { name: /فتح وردية|Open shift/i });
    await user.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText(/الوردية مفتوحة|Shift is open/i)).toBeInTheDocument();
    });
  });
});
