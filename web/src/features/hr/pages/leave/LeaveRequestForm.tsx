import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';

import { createLeaveRequest } from '../../api';
import { employeesQueryOptions, hrKeys } from '../../queries';

const schema = z.object({
  employee_profile_id: z.coerce.number().int().positive(),
  leave_type: z.enum(['vacation', 'sick', 'personal']),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function LeaveRequestForm() {
  const { t } = useTranslation('hr');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canCreate = usePermission('employees', 'create');
  const { data: emps = [] } = useQuery(employeesQueryOptions());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employee_profile_id: 0,
      leave_type: 'vacation',
      start_date: '',
      end_date: '',
      reason: '',
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      createLeaveRequest(v.employee_profile_id, {
        leave_type: v.leave_type,
        start_date: v.start_date,
        end_date: v.end_date,
        reason: v.reason?.trim() || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      toast.success(t('leave.created'));
      navigate('/hr/leave');
    },
    onError: () => toast.error(t('hr_errors.generic')),
  });

  if (!canCreate) {
    return <p className="p-4 text-sm text-muted-foreground">403</p>;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('leave.new')}</h1>
      <Button type="button" variant="outline" asChild>
        <Link to="/hr/leave">{t('leave.title')}</Link>
      </Button>
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <div className="grid gap-1">
          <Label>{t('leave.form.employee')}</Label>
          <Select
            value={form.watch('employee_profile_id') ? String(form.watch('employee_profile_id')) : ''}
            onValueChange={(v) => form.setValue('employee_profile_id', Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {emps.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  #{e.id} (user {e.user_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('leave.form.type')}</Label>
          <Select
            value={form.watch('leave_type')}
            onValueChange={(v) => form.setValue('leave_type', v as FormValues['leave_type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vacation">vacation</SelectItem>
              <SelectItem value="sick">sick</SelectItem>
              <SelectItem value="personal">personal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('leave.form.start')}</Label>
          <DateField value={form.watch('start_date')} onChange={(d) => form.setValue('start_date', d)} />
        </div>
        <div className="grid gap-1">
          <Label>{t('leave.form.end')}</Label>
          <DateField value={form.watch('end_date')} onChange={(d) => form.setValue('end_date', d)} />
        </div>
        <div className="grid gap-1">
          <Label>{t('leave.form.reason')}</Label>
          <Textarea rows={2} {...form.register('reason')} />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {t('leave.form.submit')}
        </Button>
      </form>
    </div>
  );
}
