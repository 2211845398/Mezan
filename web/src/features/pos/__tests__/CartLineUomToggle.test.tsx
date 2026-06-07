import { describe, expect, it, vi } from 'vitest';

import { CartLineUomToggle } from '@/features/pos/components/CartLineUomToggle';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

const twoOptions = [
  { uom_id: 1, code: 'PIECE', symbol: 'pcs', name: 'Piece' },
  { uom_id: 2, code: 'BOX', symbol: 'box', name: 'Box' },
];

const fourOptions = [
  ...twoOptions,
  { uom_id: 3, code: 'KG', symbol: 'kg', name: 'Kilogram' },
  { uom_id: 4, code: 'LITER', symbol: 'l', name: 'Liter' },
];

describe('CartLineUomToggle', () => {
  it('renders segmented buttons for 2–3 units', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <CartLineUomToggle
        options={twoOptions}
        activeUomId={1}
        editable
        onSelect={onSelect}
      />,
    );

    const group = screen.getByRole('group', { name: /تغيير الوحدة|Change unit/i });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { pressed: true })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /تغيير الوحدة|Change unit/i })).toBeNull();
  });

  it('calls onSelect when clicking an inactive unit', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <CartLineUomToggle
        options={twoOptions}
        activeUomId={1}
        editable
        onSelect={onSelect}
      />,
    );

    const buttons = screen.getAllByRole('button');
    const inactive = buttons.find((b) => b.getAttribute('aria-pressed') === 'false');
    expect(inactive).toBeTruthy();
    await user.click(inactive!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('does not call onSelect when clicking the active unit', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <CartLineUomToggle
        options={twoOptions}
        activeUomId={1}
        editable
        onSelect={onSelect}
      />,
    );

    const active = screen.getByRole('button', { pressed: true });
    await user.click(active);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows popover trigger instead of segmented buttons when more than 3 units', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <CartLineUomToggle
        options={fourOptions}
        activeUomId={1}
        editable
        triggerLabel="2 قطعة"
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByRole('group', { name: /تغيير الوحدة|Change unit/i })).toBeNull();
    expect(screen.getByRole('button', { name: /تغيير الوحدة|Change unit/i })).toBeTruthy();
    expect(screen.getByText('2 قطعة')).toBeTruthy();
  });

  it('disables segmented buttons when not editable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <CartLineUomToggle
        options={twoOptions}
        activeUomId={1}
        editable={false}
        onSelect={onSelect}
      />,
    );

    const inactive = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'false');
    expect(inactive).toBeDisabled();
    await user.click(inactive!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders static label when more than 3 units and not editable', () => {
    renderWithProviders(
      <CartLineUomToggle
        options={fourOptions}
        activeUomId={1}
        editable={false}
        triggerLabel="2 قطعة"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('2 قطعة')).toBeTruthy();
  });

  it('returns null for a single unit option', () => {
    const { container } = renderWithProviders(
      <CartLineUomToggle
        options={[twoOptions[0]!]}
        activeUomId={1}
        editable
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
