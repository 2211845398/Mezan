import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { applyApiErrorToForm } from '@/api/errorMessages';

/**
 * Map a backend `ValidationError.details.errors[]` array into RHF field
 * errors. FastAPI's RequestValidationError shape is:
 *   { loc: [...], msg: string, type: string }
 */
export function applyBackendFieldErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  errors:
    | ReadonlyArray<{
        loc?: ReadonlyArray<string | number>;
        msg?: string;
        type?: string;
      }>
    | undefined,
): void {
  if (!errors) return;
  for (const e of errors) {
    const locPath = (e.loc ?? []).filter((x) => typeof x === 'string');
    const path = locPath.length >= 2 ? locPath.slice(1).join('.') : locPath[0];
    if (!path) continue;
    form.setError(
      path as Parameters<typeof form.setError>[0],
      { type: e.type ?? 'server', message: e.msg ?? 'Invalid value' },
      { shouldFocus: false },
    );
  }
}

export function handleFormApiError<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: unknown,
): string | null {
  return applyApiErrorToForm(form, error);
}
