import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, Pencil, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listUsers } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { createEmployee, type EmployeeProfileRead, updateEmployee } from '../../api';
import { employeesQueryOptions, hrKeys } from '../../queries';

function EmployeeFloatingForm({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeProfileRead | null;
}) {
  const { t } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const isEdit = employee != null;
  const { data: users = [] } = useQuery({
    queryKey: adminKeys.userList(),
    queryFn: listUsers,
    enabled: open,
  });
  const [userId, setUserId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const base = baseSalary.trim() ? baseSalary : null;
      const hourly = hourlyRate.trim() ? hourlyRate : null;
      if (!base && !hourly) {
        throw new Error(t('employees.form.base_or_hourly'));
      }
      if (isEdit) {
        return updateEmployee(employee.id, {
          hire_date: hireDate,
          base_salary: base,
          hourly_rate: hourly,
          bank_account: bankAccount.trim() || null,
        });
      }
      return createEmployee({
        user_id: Number(userId),
        hire_date: hireDate,
        base_salary: base,
        hourly_rate: hourly,
        bank_account: bankAccount.trim() || null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      notify.success(tc('toasts.saved'));
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    setUserId(employee ? String(employee.user_id) : '');
    setHireDate(employee?.hire_date?.slice(0, 10) ?? '');
    setBaseSalary(employee?.base_salary != null ? String(employee.base_salary) : '');
    setHourlyRate(employee?.hourly_rate != null ? String(employee.hourly_rate) : '');
    setBankAccount(employee?.bank_account ?? '');
  }, [employee, open]);

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('employees.edit') : t('employees.new')}
      maxWidth="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save.mutateAsync();
        }}
      >
        <div className="space-y-1">
          <Label>{t('employees.form.user')}</Label>
          <Select value={userId} onValueChange={setUserId} disabled={isEdit}>
            <SelectTrigger>
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={String(user.id)}>
                  {user.email} (#{user.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('employees.form.hire_date')}</Label>
          <DateField value={hireDate} onChange={setHireDate} />
        </div>
        <div className="space-y-1">
          <Label>{t('employees.form.base_salary')}</Label>
          <MoneyInput value={baseSalary} onChange={setBaseSalary} />
        </div>
        <div className="space-y-1">
          <Label>{t('employees.form.hourly_rate')}</Label>
          <MoneyInput value={hourlyRate} onChange={setHourlyRate} />
        </div>
        <p className="text-xs text-muted-foreground">{t('employees.form.rate_hint')}</p>
        <div className="space-y-1">
          <Label>{t('employees.form.bank')}</Label>
          <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
        </div>
        {save.isError ? <p className="text-sm text-destructive">{String(save.error.message)}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            type="submit"
            className={floatingFormApproveButtonClassName}
            disabled={save.isPending || !hireDate || (!isEdit && !userId)}
          >
            {t('employees.form.save')}
          </Button>
        </div>
      </form>
    </FloatingFormDialog>
  );
}

export default function EmployeesList() {
  const { t } = useTranslation('hr');
  const canUpdate = usePermission('employees', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(employeesQueryOptions());
  const [formOpen, setFormOpen] = useState(false);
  const [formEmployee, setFormEmployee] = useState<EmployeeProfileRead | null>(null);

  const { t: tAdmin } = useTranslation('admin');

  const columns = useMemo(
    () =>
      defineColumns<EmployeeProfileRead>()([
        {
          id: 'name',
          header: tAdmin('users.col.full_name'),
          cell: ({ row }) => row.original.user_full_name ?? row.original.user_email ?? `User #${row.original.user_id}`,
        },
        {
          id: 'email',
          header: tAdmin('users.col.email'),
          cell: ({ row }) => row.original.user_email ?? '—',
        },
        {
          id: 'status',
          header: tAdmin('users.col.status'),
          cell: ({ row }) => row.original.user_status ?? '—',
        },
        {
          id: 'role',
          header: tAdmin('users.col.role'),
          cell: ({ row }) => row.original.user_role_name || row.original.user_role_code || '—',
        },
        {
          id: 'branch',
          header: tAdmin('users.col.branch'),
          cell: ({ row }) => row.original.user_branch_name ?? '—',
        },
        { id: 'hire_date', header: t('employees.col.hire_date'), cell: ({ row }) => row.original.hire_date },
        {
          id: 'compensation',
          header: t('employees.col.compensation'),
          cell: ({ row }) => {
            if (row.original.base_salary) {
              return `Salary: ${row.original.base_salary}`;
            }
            if (row.original.hourly_rate) {
              return `Hourly: ${row.original.hourly_rate}`;
            }
            return '—';
          },
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                asChild
              >
                <Link to={`/hr/employees/${row.original.id}`}>
                  <ExternalLink className="me-1 size-4" />
                  {t('employees.view')}
                </Link>
              </Button>
              {canUpdate ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setFormEmployee(row.original);
                    setFormOpen(true);
                  }}
                  aria-label={t('employees.edit')}
                >
                  <Pencil className="size-4" />
                </Button>
              ) : null}
            </div>
          ),
        },
      ]),
    [canUpdate, t, tAdmin],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('employees.title')}
        actions={
          <Button variant="outline" asChild>
            <Link to="/hr/employees/pending">
              <UserCheck className="me-2 size-4" />
              {t('pending.title')}
              <ArrowRight className="ms-2 size-4" />
            </Link>
          </Button>
        }
      />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <EmployeeFloatingForm open={formOpen} onOpenChange={setFormOpen} employee={formEmployee} />
    </div>
  );
}
