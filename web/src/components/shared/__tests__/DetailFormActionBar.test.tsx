import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          'actions.edit': 'تعديل',
          'actions.save': 'حفظ',
          'actions.cancel': 'إلغاء',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

describe('DetailFormActionBar', () => {
  it('shows edit button in view mode', () => {
    render(
      <DetailFormActionBar
        isEditing={false}
        canEdit
        onStartEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تعديل' })).toBeInTheDocument();
  });

  it('shows save and cancel in edit mode', async () => {
    render(
      <DetailFormActionBar
        isEditing
        canEdit
        onCancelEdit={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    });
  });

  it('calls onStartEdit when edit is clicked', async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    render(
      <DetailFormActionBar
        isEditing={false}
        canEdit
        onStartEdit={onStartEdit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'تعديل' }));
    expect(onStartEdit).toHaveBeenCalledOnce();
  });
});
