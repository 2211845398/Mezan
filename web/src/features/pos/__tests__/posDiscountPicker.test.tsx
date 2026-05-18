import { describe, expect, it, vi } from 'vitest';

import { DiscountPicker } from '@/features/pos/components/DiscountPicker';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

describe('DiscountPicker', () => {
  it('submits loyalty redemption with mode and points', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <DiscountPicker customerLoyaltyBalance={80} disabled={false} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /تطبيق خصم|Apply discount/i }));
    await user.click(screen.getByRole('tab', { name: /نقاط الولاء|Loyalty points/i }));
    const input = screen.getByLabelText(/نقاط للاستبدال|Points to redeem/i);
    await user.clear(input);
    await user.type(input, '25');
    const applyButtons = screen.getAllByRole('button', { name: /تطبيق خصم|Apply discount/i });
    await user.click(applyButtons[applyButtons.length - 1]!);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ mode: 'loyalty', loyalty_points: 25 });
  });
});
