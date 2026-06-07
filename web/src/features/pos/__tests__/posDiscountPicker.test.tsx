import { describe, expect, it, vi } from 'vitest';

import { DiscountPicker } from '@/features/pos/components/DiscountPicker';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

describe('DiscountPicker', () => {
  it('submits flat currency discount by default tab', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <DiscountPicker customerLoyaltyBalance={null} disabled={false} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /تطبيق خصم|Apply discount/i }));
    const input = screen.getByLabelText(/مبلغ الخصم|Discount amount/i);
    await user.type(input, '12.50');
    const applyButtons = screen.getAllByRole('button', { name: /تطبيق خصم|Apply discount/i });
    await user.click(applyButtons[applyButtons.length - 1]!);
    expect(onApply).toHaveBeenCalledWith({ mode: 'flat', amount: '12.50' });
  });

  it('does not show removed promo or loyalty hint copy', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <DiscountPicker customerLoyaltyBalance={80} disabled={false} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /تطبيق خصم|Apply discount/i }));
    await user.click(screen.getByRole('tab', { name: /رمز ترويجي|Promotion code/i }));
    expect(
      screen.queryByText(/يُحسب الخصم على السلة|cart discount is calculated automatically/i),
    ).toBeNull();
    await user.click(screen.getByRole('tab', { name: /نقاط الولاء|Loyalty points/i }));
    expect(
      screen.queryByText(/تُخصم النقاط عند إتمام الدفع|points are debited when the sale is paid/i),
    ).toBeNull();
  });

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
