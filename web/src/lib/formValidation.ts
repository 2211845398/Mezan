import { useCallback } from 'react';
import type { Control, FieldError, FieldErrors, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { useFormState } from 'react-hook-form';

import i18n from '@/i18n';

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

export type FormInvalidHandlerOptions<T extends FieldValues> = {
  fieldOrder?: readonly Path<T>[];
  /** Optional per-field message mapper (domain-specific codes). */
  mapMessage?: (error: FieldError | undefined, fieldName: string) => string | undefined;
};

/** Map a single RHF/Zod field error to a localized user-facing message. */
export function mapClientFieldErrorMessage(
  error: FieldError | undefined,
  tc: TFunction<'common'>,
): string | undefined {
  if (!error?.message) return undefined;
  const msg = String(error.message);
  if (msg.toLowerCase().includes('required') || msg === 'Required') {
    return tc('errors.validation_required');
  }
  if (
    msg.toLowerCase().includes('invalid email') ||
    (msg.toLowerCase().includes('email') && msg.toLowerCase().includes('invalid'))
  ) {
    return tc('errors.validation_email_invalid');
  }
  if (msg.toLowerCase().includes('too short') || msg.toLowerCase().includes('at least')) {
    return tc('errors.validation_password_short');
  }
  return msg;
}

/** Collect unique validation messages for invalid submit (in display order). */
export function collectValidationToasts(
  errs: FieldErrors<FieldValues>,
  tc: TFunction<'common'>,
  fieldOrder?: readonly string[],
  mapMessage?: (error: FieldError | undefined, fieldName: string) => string | undefined,
): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  const resolve = (key: string) => {
    const err = errs[key] as FieldError | undefined;
    const text = mapMessage?.(err, key) ?? mapClientFieldErrorMessage(err, tc);
    if (text && !seen.has(text)) {
      seen.add(text);
      messages.push(text);
    }
  };

  if (fieldOrder?.length) {
    for (const key of fieldOrder) resolve(key);
  }
  for (const key of Object.keys(errs)) {
    if (fieldOrder?.includes(key)) continue;
    resolve(key);
  }
  return messages;
}

/** Store the first validation message as a form-level alert and focus the first invalid field. */
export function notifyFormValidationErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: FieldErrors<T>,
  options?: FormInvalidHandlerOptions<T>,
): void {
  const tc = i18n.getFixedT(i18n.language, 'common');
  const messages = collectValidationToasts(
    errors as FieldErrors<FieldValues>,
    tc,
    options?.fieldOrder as readonly string[] | undefined,
    options?.mapMessage,
  );
  form.setError('root.validation' as Parameters<typeof form.setError>[0], {
    type: 'client',
    message: messages[0] ?? tc('errors.validation'),
  });
  focusFirstFormError(form, errors, options?.fieldOrder);
}

/** Factory for RHF `handleSubmit` invalid callback (form-level alert, no field-inline copy). */
export function createFormInvalidHandler<T extends FieldValues>(
  form: UseFormReturn<T>,
  options?: FormInvalidHandlerOptions<T>,
): (errors: FieldErrors<T>) => void {
  return (errors) => notifyFormValidationErrors(form, errors, options);
}
