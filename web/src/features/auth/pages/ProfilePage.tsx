import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuthUser } from '@/features/auth/stores/authStore';
import { useAuthStore } from '@/features/auth/stores/authStore';

import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useMe } from '../queries';

const schema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional(),
  preferred_language: z.enum(['ar', 'en']).nullable(),
});

type FormValues = z.infer<typeof schema>;

export default function ProfilePage() {
  const { t } = useTranslation('auth');
  const setUser = useAuthStore((s) => s.setUser);
  const { data: me, isLoading, isError } = useMe();
  const update = useUpdateProfile();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      phone: '',
      preferred_language: null,
    },
  });

  useEffect(() => {
    if (!me) return;
    form.reset({
      full_name: me.full_name ?? '',
      phone: me.phone ?? '',
      preferred_language:
        me.preferred_language === 'en' || me.preferred_language === 'ar' ? me.preferred_language : null,
    });
  }, [me, form]);

  if (isLoading && !me) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="h-48 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <p className="text-sm text-muted-foreground">{t('errors.generic')}</p>
      </div>
    );
  }

  function onSubmit(values: FormValues) {
    const full_name =
      values.full_name == null || values.full_name.trim() === '' ? null : values.full_name.trim();
    const phone =
      values.phone == null || values.phone.trim() === '' ? null : values.phone.trim();

    update.mutate(
      {
        full_name,
        phone,
        preferred_language: values.preferred_language,
      },
      {
        onSuccess: (next) => {
          setUser(next as AuthUser);
          toast.success(t('profile.saved'));
        },
        onError: () => toast.error(t('errors.generic')),
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.subtitle')}</CardDescription>
          <p className="pt-1 text-xs text-muted-foreground num-latin">{me.email}</p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.full_name')}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.phone')}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="tel" className="num-latin" dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preferred_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.language')}</FormLabel>
                    <Select
                      value={field.value ?? '__default__'}
                      onValueChange={(v) =>
                        field.onChange(v === '__default__' ? null : (v as 'ar' | 'en'))
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('profile.language')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__default__">{t('profile.language_default')}</SelectItem>
                        <SelectItem value="ar">{t('profile.language_ar')}</SelectItem>
                        <SelectItem value="en">{t('profile.language_en')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('actions.loading') : t('profile.save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
