import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import ShiftGate from '@/features/pos/pages/ShiftGate';
import { resetPosFixtures } from '@/test/msw/handlers/pos';
import { renderWithProviders, screen } from '@/test/utils';

describe('POS RBAC', () => {
  beforeEach(() => {
    resetPosFixtures();
    useAuthStore.getState().clear();
    useAuthStore.setState({
      status: 'authenticated',
      permissionsLoaded: true,
      activeBranchId: 1,
    });
    useAuthStore.getState().setPermissions([]);
  });

  it('hides shift gate without pos_shifts:read', () => {
    renderWithProviders(<ShiftGate />);
    expect(screen.getByText('403')).toBeInTheDocument();
  });
});
