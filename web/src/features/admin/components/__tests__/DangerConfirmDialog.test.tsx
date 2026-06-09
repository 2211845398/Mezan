import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, userEvent } from '@/test/utils';

import { DangerConfirmDialog } from '../DangerConfirmDialog';

describe('DangerConfirmDialog', () => {
  it('submits on Enter when confirm keyword matches', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DangerConfirmDialog
        open
        onOpenChange={() => {}}
        title="تعطيل المستخدم"
        description="لن يستطيع المستخدم تسجيل الدخول بعد التعطيل."
        confirmKeyword="تعطيل"
        onConfirm={onConfirm}
      />,
    );

    const input = await screen.findByRole('textbox');
    await user.type(input, 'تعطيل');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('does not submit on Enter when keyword does not match', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DangerConfirmDialog
        open
        onOpenChange={() => {}}
        title="تعطيل المستخدم"
        description="لن يستطيع المستخدم تسجيل الدخول بعد التعطيل."
        confirmKeyword="تعطيل"
        onConfirm={onConfirm}
      />,
    );

    const input = await screen.findByRole('textbox');
    await user.type(input, 'خطأ');
    await user.keyboard('{Enter}');

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders without description when omitted', async () => {
    renderWithProviders(
      <DangerConfirmDialog
        open
        onOpenChange={() => {}}
        title="أرشفة الفرع"
        confirmKeyword="أرشفة"
        onConfirm={() => {}}
      />,
    );

    expect(await screen.findByText('أرشفة الفرع')).toBeInTheDocument();
    expect(screen.getByText('اكتب «أرشفة» للتأكيد')).toBeInTheDocument();
    expect(screen.queryByText(/حذف ناعم/)).toBeNull();
  });
});
