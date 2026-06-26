import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  type FieldValues,
  FormProvider,
  type SubmitHandler,
  useForm,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType } from 'zod';

import { FormValidationAlert } from '@/components/ui/form';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { createFormInvalidHandler, type FormInvalidHandlerOptions } from '@/lib/formValidation';

/*
 * Thin wrapper around react-hook-form + Zod. Every non-trivial form in the
 * app flows through this component (Plan §7.4) so we get a single place to
 * wire submit-pending state, disabled-on-submit, Zod validation, and the
 * backend envelope → field error mapping.
 *
 * The shadcn form primitives (`<FormField />`, `<FormItem />`, …) are
 * re-exported from `./primitives.ts` alongside this file so feature code
 * imports everything from `@/components/shared/form`.
 */

export type FormProps<TValues extends FieldValues> = {
  schema: ZodType<TValues>;
  onSubmit: SubmitHandler<TValues>;
  defaultValues?: UseFormProps<TValues>['defaultValues'];
  /** Visual field order for first-error toast + focus. */
  fieldOrder?: FormInvalidHandlerOptions<TValues>['fieldOrder'];
  mapMessage?: FormInvalidHandlerOptions<TValues>['mapMessage'];
  /**
   * Render-prop: receives the configured form object so feature code can
   * type fields through `form.register(...)`, `form.control`, etc.
   */
  children: (form: UseFormReturn<TValues>) => ReactNode;
  id?: string;
  className?: string;
};

export function Form<TValues extends FieldValues>({
  schema,
  onSubmit,
  defaultValues,
  fieldOrder,
  mapMessage,
  children,
  id,
  className,
}: FormProps<TValues>) {
  const form = useForm<TValues>({
    resolver: zodResolver(schema),
    ...(defaultValues !== undefined ? { defaultValues } : {}),
    mode: 'onTouched',
  });

  const onInvalid = useCallback(
    createFormInvalidHandler(form, {
      ...(fieldOrder && { fieldOrder }),
      ...(mapMessage ? { mapMessage } : {}),
    }),
    [form, fieldOrder, mapMessage],
  );

  const submitting = form.formState.isSubmitting;

  return (
    <FormProvider {...form}>
      <form
        {...(id !== undefined ? { id } : {})}
        {...(className !== undefined ? { className } : {})}
        noValidate
        onKeyDown={handleFormEnterSubmit}
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
      >
        <fieldset disabled={submitting} className="space-y-4">
          {children(form)}
          <FormValidationAlert />
        </fieldset>
      </form>
    </FormProvider>
  );
}
