import { useCallback } from 'react';
import type { Control, FieldErrors, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useFormState } from 'react-hook-form';

export function hasFieldError(errors: FieldErrors<FieldValues>, name: string): boolean {
  const parts = name.split('.');
  let node: unknown = errors;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[part];
  }
  return node != null && typeof node === 'object' && 'message' in (node as object);
}

/** Red border/ring only after a failed submit attempt. */
export function shouldShowFieldError(
  errors: FieldErrors<FieldValues>,
  name: string,
  isSubmitted: boolean,
): boolean {
  return isSubmitted && hasFieldError(errors, name);
}

/** First field with an error, respecting visual order when `fieldOrder` is provided. */
export function getFirstErrorFieldName(
  errors: FieldErrors<FieldValues>,
  fieldOrder?: readonly string[],
): string | undefined {
  if (fieldOrder?.length) {
    for (const name of fieldOrder) {
      if (hasFieldError(errors, name)) return name;
    }
  }
  for (const key of Object.keys(errors)) {
    if (hasFieldError(errors, key)) return key;
  }
  return undefined;
}

export function fieldAriaInvalid(
  errors: FieldErrors<FieldValues>,
  name: string,
  isSubmitted = false,
): true | undefined {
  return shouldShowFieldError(errors, name, isSubmitted) ? true : undefined;
}

/** Red border on the control when invalid (after submit). */
export function invalidFieldClass(
  errors: FieldErrors<FieldValues>,
  name: string,
  isSubmitted = false,
): string {
  return shouldShowFieldError(errors, name, isSubmitted)
    ? 'border-destructive focus:border-destructive focus-visible:border-destructive'
    : '';
}

/** Subscribe to errors + isSubmitted so invalid styling updates after submit. */
export function useSubscribedFieldErrors<T extends FieldValues>(
  control: Control<T>,
): FieldErrors<T> {
  const { errors } = useFormState({ control });
  return errors;
}

export function useFormValidationDisplay<T extends FieldValues>(control: Control<T>) {
  const { errors, isSubmitted } = useFormState({ control });

  const showError = useCallback(
    (name: string) => shouldShowFieldError(errors as FieldErrors<FieldValues>, name, isSubmitted),
    [errors, isSubmitted],
  );

  const invalidClass = useCallback(
    (name: string) => invalidFieldClass(errors as FieldErrors<FieldValues>, name, isSubmitted),
    [errors, isSubmitted],
  );

  const ariaInvalid = useCallback(
    (name: string) => fieldAriaInvalid(errors as FieldErrors<FieldValues>, name, isSubmitted),
    [errors, isSubmitted],
  );

  return { errors, isSubmitted, showError, invalidClass, ariaInvalid };
}

export function scrollFieldIntoView(name: string): void {
  requestAnimationFrame(() => {
    const el =
      document.querySelector<HTMLElement>(`[name="${name}"]`) ??
      document.getElementById(name);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/** Focus the first focusable control inside `id`, or the element itself. */
export function focusElementById(id: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(
      'button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? el).focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/** Focus and scroll to the first invalid field (by display order). */
export function focusFirstFormError<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: FieldErrors<T>,
  fieldOrder?: readonly Path<T>[],
): void {
  const name = getFirstErrorFieldName(errors, fieldOrder as readonly string[] | undefined);
  if (!name) return;
  void form.setFocus(name as Path<T>);
  scrollFieldIntoView(name);
}
