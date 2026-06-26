import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useDeferredEditSaveActions, useEditableFormMode } from '@/lib/useEditableFormMode';

type Values = { name: string };

describe('useEditableFormMode', () => {
  it('starts read-only on detail pages', () => {
    const { result: formResult } = renderHook(() =>
      useForm<Values>({ defaultValues: { name: 'Alpha' } }),
    );
    const { result } = renderHook(() =>
      useEditableFormMode({ form: formResult.current, canEdit: true, isCreate: false }),
    );

    expect(result.current.fieldsEnabled).toBe(false);
    expect(result.current.isEditing).toBe(false);
  });

  it('starts editable on create pages', () => {
    const { result: formResult } = renderHook(() =>
      useForm<Values>({ defaultValues: { name: '' } }),
    );
    const { result } = renderHook(() =>
      useEditableFormMode({ form: formResult.current, canEdit: true, isCreate: true }),
    );

    expect(result.current.fieldsEnabled).toBe(true);
    expect(result.current.isEditing).toBe(true);
  });

  it('cancelEdit restores the snapshot taken at startEdit', () => {
    const { result: formResult } = renderHook(() =>
      useForm<Values>({ defaultValues: { name: 'Alpha' } }),
    );
    const form = formResult.current;
    const { result } = renderHook(() =>
      useEditableFormMode({ form, canEdit: true, isCreate: false }),
    );

    act(() => {
      result.current.startEdit();
      form.setValue('name', 'Changed');
    });
    expect(form.getValues('name')).toBe('Changed');

    act(() => {
      result.current.cancelEdit();
    });
    expect(form.getValues('name')).toBe('Alpha');
    expect(result.current.fieldsEnabled).toBe(false);
  });

  it('finishEdit exits edit mode after save', () => {
    const { result: formResult } = renderHook(() =>
      useForm<Values>({ defaultValues: { name: 'Alpha' } }),
    );
    const form = formResult.current;
    const { result } = renderHook(() =>
      useEditableFormMode({ form, canEdit: true, isCreate: false }),
    );

    act(() => {
      result.current.startEdit();
      form.setValue('name', 'Saved');
      result.current.finishEdit();
    });

    expect(result.current.fieldsEnabled).toBe(false);
    act(() => {
      result.current.startEdit();
      result.current.cancelEdit();
    });
    expect(form.getValues('name')).toBe('Saved');
  });
});

describe('useDeferredEditSaveActions', () => {
  it('is false while not editing', () => {
    const { result } = renderHook(() => useDeferredEditSaveActions(false));
    expect(result.current).toBe(false);
  });

  it('becomes true on the next frame after entering edit mode', async () => {
    const { result, rerender } = renderHook(
      ({ isEditing }) => useDeferredEditSaveActions(isEditing),
      { initialProps: { isEditing: false } },
    );

    rerender({ isEditing: true });
    expect(result.current).toBe(false);

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('resets when leaving edit mode', async () => {
    const { result, rerender } = renderHook(
      ({ isEditing }) => useDeferredEditSaveActions(isEditing),
      { initialProps: { isEditing: true } },
    );

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    rerender({ isEditing: false });
    expect(result.current).toBe(false);
  });
});
