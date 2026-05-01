import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  FloatingFormDialog,
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
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

import { createEmployee, type EmployeeProfileRead,updateEmployee } from '../../api';
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
  const canCreate = usePermission('employees', 'create');
  const canUpdate = usePermission('employees', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(employeesQueryOptions());
  const [formOpen, setFormOpen] = useState(false);
  const [formEmployee, setFormEmployee] = useState<EmployeeProfileRead | null>(null);

  const columns = useMemo(
    () =>
      defineColumns<EmployeeProfileRead>()([
        { id: 'id', accessorKey: 'id', header: t('employees.col.id') },
        { id: 'user_id', accessorKey: 'user_id', header: t('employees.col.user_id') },
        { id: 'hire_date', header: t('employees.col.hire_date'), cell: ({ row }) => row.original.hire_date },
        {
          id: 'hourly_rate',
          header: t('employees.col.hourly_rate'),
          cell: ({ row }) => row.original.hourly_rate ?? '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
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
            ) : null,
        },
      ]),
    [canUpdate, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('employees.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setFormEmployee(null);
                setFormOpen(true);
              }}
            >
              <Plus className="me-2 size-4" />
              {t('employees.new')}
            </Button>
          ) : null
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
