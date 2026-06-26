import type { KeyboardEvent } from 'react';

/** Skip Enter→submit when focus is in multiline fields or floating overlays. */
export function shouldIgnoreFormEnterSubmit(
  target: EventTarget | null,
  options?: { allowInDialog?: boolean },
): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.tagName === 'TEXTAREA') return true;
  if (!options?.allowInDialog && target.closest('[role="dialog"]')) return true;
  if (target.closest('[data-radix-popper-content-wrapper]')) return true;
  if (target.closest('[cmdk-root]')) return true;
  return false;
}

function isEnterSubmitKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export function handleFormEnterSubmit(e: KeyboardEvent<HTMLFormElement>): void {
  if (!isEnterSubmitKey(e)) return;
  const allowInDialog = e.currentTarget.closest('[role="dialog"]') != null;
  if (shouldIgnoreFormEnterSubmit(e.target, { allowInDialog })) return;
  e.preventDefault();
  e.currentTarget.requestSubmit();
}

/** Enter→submit for forms inside dialogs (does not ignore `[role="dialog"]`). */
export function handleDialogFormEnterSubmit(e: KeyboardEvent<HTMLFormElement>): void {
  if (!isEnterSubmitKey(e)) return;
  if (shouldIgnoreFormEnterSubmit(e.target, { allowInDialog: true })) return;
  e.preventDefault();
  e.currentTarget.requestSubmit();
}

/** Enter→submit when focus is inside a container that wraps a `<form>` (e.g. dialog body). */
export function handleContainerEnterSubmit(e: KeyboardEvent<HTMLElement>): void {
  if (!isEnterSubmitKey(e)) return;
  if (shouldIgnoreFormEnterSubmit(e.target, { allowInDialog: true })) return;
  const form = e.currentTarget.querySelector('form');
  if (!form) return;
  e.preventDefault();
  form.requestSubmit();
}
