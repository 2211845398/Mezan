import { describe, expect, it, beforeEach } from 'vitest';

import { applyCartDiscount, createCart, addCartLine, updateCartCustomer } from '@/features/pos/api';
import { resetPosFixtures, seedOpenShift } from '@/test/msw/handlers/pos';

describe('POS cart — MSW loyalty discount & inactive customer patch', () => {
  beforeEach(() => {
    resetPosFixtures();
    seedOpenShift();
  });

  it('PATCH customer 999 is rejected as inactive for POS', async () => {
    const cart = await createCart({ terminal_id: 10, shift_id: 501 });
    await expect(updateCartCustomer(cart.id, 999)).rejects.toMatchObject({
      response: { status: 422 },
    });
  });

  it('POST loyalty discount applies when cart has customer and lines', async () => {
    let cart = await createCart({ terminal_id: 10, shift_id: 501 });
    cart = await addCartLine(cart.id, { product_id: 1, qty: 2 });
    cart = await updateCartCustomer(cart.id, 42);
    const out = await applyCartDiscount(cart.id, { mode: 'loyalty', loyalty_points: 10 });
    expect(out.discounts?.[0]).toMatchObject({
      code: '__POS_LOYALTY__',
      loyalty_points_redeemed: 10,
    });
  });
});
