import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Defers save-button mount by one frame after entering edit mode so a click on
 * Edit cannot land on a newly mounted submit button at the same coordinates.
 */
export function useDeferredEditSaveActions(isEditing: boolean): boolean {
  const [saveActionsReady, setSaveActionsReady] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setSaveActionsReady(false);
      return;
    }
    const frameId = requestAnimationFrame(() => {
      setSaveActionsReady(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, [isEditing]);

  return saveActionsReady;
}

/** Reduces ghost-click risk when Edit is replaced by Save in the same slot. */
export function preventEditGhostClick(event: PointerEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

export type UseEditableFormModeOptions<TValues extends FieldValues> = {
  form: UseFormReturn<TValues>;
  /** When false the form stays read-only and edit controls are hidden. */
  canEdit?: boolean;
  /** True for create pages — fields start editable, no view mode toggle. */
  isCreate?: boolean;
};

export type UseEditableFormModeResult = {
  isEditing: boolean;
  canEdit: boolean;
  isCreate: boolean;
  /** Whether fields should be interactive. */
  fieldsEnabled: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  /** Call after a successful save to exit edit mode and refresh the snapshot. */
  finishEdit: () => void;
  /** Sync snapshot when server data reloads into the form (e.g. useEffect reset). */
  syncSnapshot: () => void;
};

export function useEditableFormMode<TValues extends FieldValues>({
  form,
  canEdit = true,
  isCreate = false,
}: UseEditableFormModeOptions<TValues>): UseEditableFormModeResult {
  const [isEditing, setIsEditing] = useState(isCreate);
  const snapshotRef = useRef<TValues | null>(null);

  const syncSnapshot = useCallback(() => {
    snapshotRef.current = form.getValues();
  }, [form]);

  const startEdit = useCallback(() => {
    if (!canEdit || isCreate) return;
    snapshotRef.current = form.getValues();
    setIsEditing(true);
  }, [canEdit, isCreate, form]);

  const cancelEdit = useCallback(() => {
    if (isCreate) return;
    if (snapshotRef.current != null) {
      form.reset(snapshotRef.current);
    }
    form.clearErrors();
    setIsEditing(false);
  }, [form, isCreate]);

  const finishEdit = useCallback(() => {
    if (isCreate) return;
    snapshotRef.current = form.getValues();
    setIsEditing(false);
  }, [form, isCreate]);

  const fieldsEnabled = isCreate || (canEdit && isEditing);

  return {
    isEditing: isCreate || isEditing,
    canEdit,
    isCreate,
    fieldsEnabled,
    startEdit,
    cancelEdit,
    finishEdit,
    syncSnapshot,
  };
}
