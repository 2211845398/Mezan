import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { getUserRoles, listPendingOnboarding } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { adminKeys, useCreateUser } from '../../queries';

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().optional(),
  branch_id: z.coerce.number().nullable().optional(),
  role_code: z.string().optional().nullable(),
  require_onboarding: z.boolean(),
  assigned_hr_user_id: z.coerce.number().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function UserCreate() {
  const { t } = useTranslation('admin');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const create = useCreateUser();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      full_name: '',
      password: '',
      branch_id: null,
      role_code: null,
      require_onboarding: true,
      assigned_hr_user_id: null,
    },
  });
  const requireOnb = form.watch('require_onboarding');
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
    <div className="mx-auto max-w-lg p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t('users.create_title')}</h1>
      {createdId == null ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              const u = await create.mutateAsync({
                email: v.email,
                full_name: v.full_name,
                password: v.password != null && v.password !== '' ? v.password : null,
                branch_id: v.branch_id == null ? null : v.branch_id,
                role_code: v.role_code && v.role_code !== '' ? v.role_code : null,
                require_onboarding: v.require_onboarding,
                assigned_hr_user_id: v.assigned_hr_user_id == null ? null : v.assigned_hr_user_id,
                status: v.require_onboarding ? 'pending_onboarding' : 'active',
              });
              setCreatedId(u.id);
            })}
            className="space-y-4"
          >
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
                    <Input
                      placeholder="IT_ADMIN, CASHIER, …"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2">
              <FormField
                name="require_onboarding"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="onb"
                      />
                    </FormControl>
                    <FormLabel htmlFor="onb">{t('users.require_onboarding')}</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            {requireOnb ? (
              <div>
                <FormField
                  name="assigned_hr_user_id"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users.assigned_hr_id')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === '' ? null : Number(v));
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <p className="text-muted-foreground text-xs">{t('users.assigned_hr_help')}</p>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {t('actions.save')}
              </Button>
              <Button type="button" variant="secondary" asChild>
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
              {t('users.roles')}: {userRoles.map((r) => r.role_code).join(', ')}
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
