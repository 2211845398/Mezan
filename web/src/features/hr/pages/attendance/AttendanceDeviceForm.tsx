import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import { BranchPicker } from '@/features/admin/components/BranchPicker';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationAlert,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { notify } from '@/lib/toast';
import { createFormInvalidHandler } from '@/lib/formValidation';

import type { AttendanceDeviceRead } from '../../attendanceDevices/api';
import { useCreateAttendanceDevice, useUpdateAttendanceDevice } from '../../attendanceDevices/queries';

function buildSchema(isEdit: boolean) {
  return z
    .object({
      name: z.string().min(1),
      branch_id: z.coerce.number().refine((n) => n > 0, 'Required'),
      kiosk_email: z.string().min(1),
      kiosk_password: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const email = v.kiosk_email.trim();
      if (!email.includes('@')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid email',
          path: ['kiosk_email'],
        });
      }
      if (!isEdit && (!v.kiosk_password || v.kiosk_password.length < 8)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Min 8 characters',
          path: ['kiosk_password'],
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const FORM_ID = 'hr-attendance-device-form';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: AttendanceDeviceRead | null;
};

export function AttendanceDeviceForm({ open, onOpenChange, device }: Props) {
  const { t } = useTranslation('hr');
  const isEdit = device != null;
  const schema = useMemo(() => buildSchema(isEdit), [isEdit]);
  const create = useCreateAttendanceDevice();
  const update = useUpdateAttendanceDevice();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      branch_id: 0,
      kiosk_email: '',
      kiosk_password: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (device) {
      form.reset({
        name: device.name,
        branch_id: device.branch_id,
        kiosk_email: device.user_email ?? '',
        kiosk_password: '',
      });
    } else {
      form.reset({
        name: '',
        branch_id: 0,
        kiosk_email: '',
        kiosk_password: '',
      });
    }
  }, [open, device, form]);

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['name', 'branch_id', 'kiosk_email', 'kiosk_password'],
  });

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('attendanceDevices.editTitle') : t('attendanceDevices.createTitle')}
      maxWidth="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={create.isPending || update.isPending}
          >
            {t('attendanceDevices.cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            className={floatingFormApproveButtonClassName}
            disabled={create.isPending || update.isPending}
          >
            {isEdit ? t('attendanceDevices.save') : t('attendanceDevices.create')}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            try {
              const email = v.kiosk_email.trim();
              const password = v.kiosk_password?.trim();
              if (isEdit && device) {
                await update.mutateAsync({
                  id: device.id,
                  body: {
                    name: v.name.trim(),
                    branch_id: v.branch_id,
                    kiosk_email: email,
                    ...(password ? { kiosk_password: password } : {}),
                  },
                });
                notify.success(t('attendanceDevices.saved'));
              } else {
                await create.mutateAsync({
                  branch_id: v.branch_id,
                  name: v.name.trim(),
                  kiosk_email: email,
                  kiosk_password: password!,
                  kiosk_first_name: v.name.trim(),
                });
                notify.success(t('attendanceDevices.created'));
              }
              onOpenChange(false);
            } catch (error) {
              applyApiErrorToForm(form, error);
              notifyApiError(error, t('attendanceDevices.createFailed'));
            }
          }, onInvalid)}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('attendanceDevices.col.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="branch_id"
            render={({ field }) => (
              <FormItem>
                <BranchPicker
                  id="device-branch"
                  label={t('attendanceDevices.col.branch')}
                  value={field.value > 0 ? field.value : null}
                  onChange={(id) => field.onChange(id ?? 0)}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">{t('attendanceDevices.kioskAccountSection')}</p>
            <FormField
              control={form.control}
              name="kiosk_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('attendanceDevices.kioskEmail')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="kiosk_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isEdit
                      ? t('attendanceDevices.kioskPasswordOptional')
                      : t('attendanceDevices.kioskPassword')}
                  </FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormValidationAlert />
        </form>
      </Form>
    </FloatingFormDialog>
  );
}
