import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { applyApiErrorToForm } from '@/api/errorMessages';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { getUserRoles, listPendingOnboarding } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { HrAssigneeCombobox } from '../../components/HrAssigneeCombobox';
import { RoleCodeCombobox } from '../../components/RoleCodeCombobox';
import { roleCodeLabel } from '../../lib/roleLabels';
import { adminKeys, useCreateUser } from '../../queries';

const schema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().optional(),
  branch_id: z.coerce.number().nullable().optional(),
  role_code: z.string().optional().nullable(),
  assigned_hr_user_id: z.coerce.number().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function UserCreate() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateUser();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      branch_id: null,
      role_code: null,
      assigned_hr_user_id: null,
    },
  });
  const { data: userRoles = [] } = useQuery({
    queryKey: adminKeys.userRoles(createdId ?? 0),
    queryFn: () => getUserRoles(createdId!),
    enabled: createdId != null,
  });
  const { data: pending = [] } = useQuery({
    queryKey: adminKeys.onboardingList(createdId),
    queryFn: listPendingOnboarding,
    enabled: createdId != null,
  });
  const onboardingForUser = pending.find((p) => p.user_id === createdId);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('users.create_title')}</h1>
      {createdId == null ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              setFormError(null);
              try {
                const u = await create.mutateAsync({
                  full_name: v.full_name,
                  email: v.email,
                  password: v.password != null && v.password !== '' ? v.password : null,
                  branch_id: v.branch_id == null ? null : v.branch_id,
                  role_code: v.role_code && v.role_code !== '' ? v.role_code : null,
                  assigned_hr_user_id: v.assigned_hr_user_id == null ? null : v.assigned_hr_user_id,
                  status: 'pending_onboarding',
                });
                setCreatedId(u.id);
              } catch (error) {
                setFormError(applyApiErrorToForm(form, error) ?? tc('errors.validation'));
              }
            })}
            className="space-y-4"
          >
            <FormField
              name="full_name"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.col.full_name')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="email"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.col.email')}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="password"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.password')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="branch_id"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <BranchPicker
                    label={t('users.col.branch')}
                    value={field.value}
                    onChange={(b) => field.onChange(b)}
                    allowClear
                  />
                </FormItem>
              )}
            />
            <FormField
              name="role_code"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.role_code')}</FormLabel>
                  <FormControl>
                    <RoleCodeCombobox
                      value={field.value ?? ''}
                      onChange={(code) => field.onChange(code === '' ? null : code)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="assigned_hr_user_id"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.assigned_hr_id')}</FormLabel>
                  <FormControl>
                    <HrAssigneeCombobox
                      value={field.value != null ? String(field.value) : ''}
                      onChange={(id) => field.onChange(id === '' ? null : Number(id))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {formError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" className={floatingFormApproveButtonClassName} disabled={create.isPending}>
                {t('actions.save')}
              </Button>
              <Button type="button" variant="outline" className={floatingFormCloseButtonClassName} asChild>
                <Link to="/admin/users">{t('actions.back')}</Link>
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <div className="space-y-2 rounded-md border p-4 text-sm">
          <p>{t('users.created_ok', { id: createdId })}</p>
          {userRoles.length > 0 ? (
            <p>
              {t('users.roles')}: {userRoles.map((r) => roleCodeLabel(t, r.role_code, r.role_name)).join(', ')}
            </p>
          ) : null}
          {onboardingForUser ? (
            <p>
              {t('users.onboarding_status')}: {onboardingForUser.status} (HR:{' '}
              {onboardingForUser.assigned_hr_user_id ?? '—'})
            </p>
          ) : null}
          <Button asChild>
            <Link to={`/admin/users/${createdId}`}>{t('users.open_user')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
