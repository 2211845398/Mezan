import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { inclusiveEndIsoDateFromStartAndDays } from '@/lib/date';

import { createLeaveRequest } from '../../api';
import { formatVacationBalanceRemaining } from '../../lib/leaveBalanceDisplay';
import { hrKeys, leaveBalanceQueryOptions } from '../../queries';

const FORM_ID = 'hr-employee-leave-request-form';

const schema = z.object({
  leave_type: z.enum(['vacation', 'sick', 'personal']),
  start_date: z.string().min(1),
  duration_days: z.coerce.number().int().min(1).max(366),
  /** Derived for display only; API still uses inclusiveEndIsoDateFromStartAndDays on submit. */
  end_date: z.string(),
  reason: z.string().max(1024).optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  employeeProfileId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function EmployeeLeaveRequestDialog({ employeeProfileId, open, onOpenChange }: Props) {
  const { t } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();

  const { data: balance } = useQuery({
    ...leaveBalanceQueryOptions(employeeProfileId),
    enabled: open && employeeProfileId > 0 && !Number.isNaN(employeeProfileId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leave_type: 'vacation',
      start_date: '',
      duration_days: 1,
      end_date: '',
      reason: '',
    },
  });

  const start = form.watch('start_date');
  const durationDays = form.watch('duration_days');

  useEffect(() => {
    const nextEnd =
      start && durationDays >= 1
        ? inclusiveEndIsoDateFromStartAndDays(start, durationDays)
        : '';
    form.setValue('end_date', nextEnd);
  }, [start, durationDays, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        leave_type: 'vacation',
        start_date: '',
        duration_days: 1,
        end_date: '',
        reason: '',
      });
    }
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) =>
      createLeaveRequest(employeeProfileId, {
        leave_type: v.leave_type,
        start_date: v.start_date,
        end_date: inclusiveEndIsoDateFromStartAndDays(v.start_date, v.duration_days),
        reason: v.reason?.trim() ? v.reason.trim() : null,
      }),
    onSuccess: async () => {
      toast.success(t('leave.created'));
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('leave.dialog.title')}
      maxWidth="md"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-[5px]">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {tc('actions.cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            className={floatingFormApproveButtonClassName}
            disabled={mutation.isPending}
          >
            {t('leave.form.submit')}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => mutation.mutateAsync(v))}
        >
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{t('leave.dialog.balance_section')}</p>
            {balance ? (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  {t('leave.dialog.balance_year', { year: balance.calendar_year })}
                </li>
                <li>
                  {t('leave.dialog.balance_remaining')}:{' '}
                  {balance.remaining_days != null && balance.remaining_days !== ''
                    ? formatVacationBalanceRemaining(balance.remaining_days)
                    : t('leave.dialog.balance_not_tracked')}
                </li>
                {balance.entitlement_days != null && balance.entitlement_days !== '' ? (
                  <li>
                    {t('leave.dialog.balance_entitlement')}:{' '}
                    {formatVacationBalanceRemaining(balance.entitlement_days)}
                  </li>
                ) : null}
                {balance.used_days != null && balance.used_days !== '' ? (
                  <li>
                    {t('leave.dialog.balance_used')}: {formatVacationBalanceRemaining(balance.used_days)}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">{t('leave.dialog.balance_loading')}</p>
            )}
          </div>

          <FormField
            control={form.control}
            name="leave_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('leave.form.type')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="vacation">{t('leave.type.vacation')}</SelectItem>
                    <SelectItem value="sick">{t('leave.type.sick')}</SelectItem>
                    <SelectItem value="personal">{t('leave.type.personal')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('leave.form.start')}</FormLabel>
                  <FormControl>
                    <DateField value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duration_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('leave.dialog.duration_days_label')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={366}
                      inputMode="numeric"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isFinite(field.value) ? field.value : 1}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === '' ? 1 : Number.parseInt(raw, 10) || 1);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('leave.form.end')}</FormLabel>
                <FormControl>
                  <DateField
                    value={field.value}
                    onChange={() => {}}
                    disabled
                    placeholder={t('leave.dialog.duration_placeholder')}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('leave.form.reason')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FloatingFormDialog>
  );
}
