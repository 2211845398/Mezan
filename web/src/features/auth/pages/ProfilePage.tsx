import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Lock, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import type { ProfileUpdate } from '@/api/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuthUser } from '@/features/auth/stores/authStore';
import { useAuthStore } from '@/features/auth/stores/authStore';
import EmployeeLeaveRequestDialog from '@/features/hr/pages/employees/EmployeeLeaveRequestDialog';
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl, withMediaCacheBust } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useUploadAvatar } from '../hooks/useUploadAvatar';
import { useMe } from '../queries';

/** Libyan mobile: `09` + operator digit 1–5 + 7 subscriber digits (10 digits). */
const LY_MOBILE_RE = /^09[1-5]\d{7}$/;

function splitFullName(full: string | null | undefined): {
  first_name: string;
  father_name: string;
  last_name: string;
} {
  const raw = full?.trim() ?? '';
  if (!raw) return { first_name: '', father_name: '', last_name: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0]!, father_name: '', last_name: '' };
  if (parts.length === 2) return { first_name: parts[0]!, father_name: '', last_name: parts[1]! };
  return {
    first_name: parts[0]!,
    father_name: parts[1]!,
    last_name: parts.slice(2).join(' '),
  };
}

function joinNameParts(first: string, father: string, last: string): string | null {
  const segments = [first, father, last].map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  return segments.join(' ');
}

function initials(displayName: string | null | undefined, email: string): string {
  const n = displayName?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function buildProfileSchema(t: (k: string) => string) {
  return z.object({
    email: z.string().email(t('profile.email_invalid')),
    first_name: z.string().max(120).optional(),
    father_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    phone: z
      .string()
      .optional()
      .refine(
        (v) => {
          const s = v?.trim() ?? '';
          return s.length === 0 || LY_MOBILE_RE.test(s);
        },
        { message: t('profile.phone_invalid_ly') },
      ),
    city: z.string().optional(),
    /** Sentinel `__default__` maps to API `null` (no preference). */
    preferred_language: z.enum(['ar', 'en', '__default__']),
  });
}

function buildPasswordSchema(t: (k: string) => string) {
  return z
    .object({
      current_password: z.string().optional(),
      new_password: z
        .string()
        .optional()
        .refine((v) => !v || v.length === 0 || v.length >= 8, {
          message: t('profile.new_password_too_short'),
        }),
      confirm_new_password: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      const np = val.new_password?.trim() ?? '';
      if (np.length > 0) {
        if (!val.current_password || val.current_password.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['current_password'],
            message: t('profile.current_password_required'),
          });
        }
        if (np !== (val.confirm_new_password ?? '')) {
          ctx.addIssue({
            code: 'custom',
            path: ['confirm_new_password'],
            message: t('profile.password_mismatch'),
          });
        }
      }
    });
}

type ProfileFormValues = z.infer<ReturnType<typeof buildProfileSchema>>;
type PasswordFormValues = z.infer<ReturnType<typeof buildPasswordSchema>>;

export default function ProfilePage() {
  const { t } = useTranslation('auth');
  const { t: tHr } = useTranslation('hr');
  const setUser = useAuthStore((s) => s.setUser);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const avatarCacheBust = useAuthStore((s) => s.avatarCacheBust);
  const canCreateLeave = usePermission('employees', 'create');
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const { data: me, isLoading, isError } = useMe();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const profileSchema = buildProfileSchema(t);
  const passwordSchema = buildPasswordSchema(t);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      email: '',
      first_name: '',
      father_name: '',
      last_name: '',
      phone: '',
      city: '',
      preferred_language: '__default__',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_new_password: '',
    },
  });

  useEffect(() => {
    if (!me) return;
    const nameParts = splitFullName(me.full_name);
    profileForm.reset({
      email: me.email ?? '',
      ...nameParts,
      phone: me.phone ?? '',
      city: me.city ?? '',
      preferred_language:
        me.preferred_language === 'en' || me.preferred_language === 'ar'
          ? me.preferred_language
          : '__default__',
    });
  }, [me, profileForm]);

  const firstNameWatch = profileForm.watch('first_name');
  const fatherNameWatch = profileForm.watch('father_name');
  const lastNameWatch = profileForm.watch('last_name');
  const emailWatch = profileForm.watch('email');

  if (isLoading && !me) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">{t('errors.generic')}</p>
      </div>
    );
  }

  const composedName = joinNameParts(
    firstNameWatch ?? '',
    fatherNameWatch ?? '',
    lastNameWatch ?? '',
  );
  const displayName = (composedName ?? me.full_name?.trim()) || me.email;
  const heroAvatarSrc =
    localPreview ??
    withMediaCacheBust(resolveMediaUrl(me.avatar_url), avatarCacheBust);
  const ini = initials(
    displayName === me.email ? null : displayName,
    emailWatch || me.email,
  );

  function onProfileSubmit(values: ProfileFormValues) {
    const full_name = joinNameParts(
      values.first_name ?? '',
      values.father_name ?? '',
      values.last_name ?? '',
    );
    const phone =
      values.phone == null || values.phone.trim() === '' ? null : values.phone.trim();
    const city = values.city == null || values.city.trim() === '' ? null : values.city.trim();

    const payload: ProfileUpdate = {
      email: values.email.trim(),
      full_name,
      phone,
      city,
      preferred_language:
        values.preferred_language === '__default__' ? null : values.preferred_language,
    };

    update.mutate(payload, {
      onSuccess: (next) => {
        setUser(next as AuthUser);
        toast.success(t('profile.saved'));
      },
      onError: (err) => {
        const message = applyApiErrorToForm(profileForm, err);
        if (message) toast.error(message);
      },
    });
  }

  function onPasswordSubmit(values: PasswordFormValues) {
    const np = values.new_password?.trim() ?? '';
    if (np.length === 0) {
      toast.error(t('profile.password_enter_new'));
      return;
    }
    update.mutate(
      {
        current_password: values.current_password ?? '',
        new_password: np,
      },
      {
        onSuccess: (next) => {
          setUser(next as AuthUser);
          passwordForm.reset({
            current_password: '',
            new_password: '',
            confirm_new_password: '',
          });
          toast.success(t('profile.password_updated'));
        },
        onError: (err) => {
          const message = applyApiErrorToForm(passwordForm, err);
          if (message) toast.error(message);
        },
      },
    );
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.photo_invalid_type'));
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    uploadAvatar.mutate(file, {
      onSuccess: () => {
        URL.revokeObjectURL(preview);
        setLocalPreview(null);
        toast.success(t('profile.photo_saved'));
      },
      onError: (err) => {
        URL.revokeObjectURL(preview);
        setLocalPreview(null);
        notifyApiError(err, t('errors.generic'));
      },
    });
  }

  const showLeaveRequest =
    canCreateLeave &&
    me.employee_profile_id != null &&
    me.employee_profile_id > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={t('profile.page_title')}
        subtitle={t('profile.page_subtitle')}
        actions={
          showLeaveRequest ? (
            <Button type="button" size="sm" onClick={() => setLeaveDialogOpen(true)}>
              {tHr('leave.dialog.trigger')}
            </Button>
          ) : null
        }
      />

      {showLeaveRequest ? (
        <EmployeeLeaveRequestDialog
          employeeProfileId={me.employee_profile_id!}
          open={leaveDialogOpen}
          onOpenChange={setLeaveDialogOpen}
        />
      ) : null}

      <div className="flex flex-col items-center gap-6 rounded-xl border-2 border-secondary/25 bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <Avatar
          className={cn(
            'size-28 shrink-0 border-4 border-secondary/30 shadow-md sm:size-32',
          )}
        >
          {heroAvatarSrc ? (
            <AvatarImage src={heroAvatarSrc} alt="" referrerPolicy="no-referrer" />
          ) : null}
          <AvatarFallback className="bg-secondary/15 text-2xl font-semibold text-secondary-foreground num-latin">
            {ini}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <h2 className="text-2xl font-semibold tracking-tight">{displayName}</h2>
          <p className="text-muted-foreground mt-1 text-sm num-latin">{me.email}</p>
          {roleCodes.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {roleCodes.map((code) => (
                <Badge
                  key={code}
                  variant="outline"
                  className={cn(
                    'border-2 border-secondary bg-background font-mono text-[11px] text-secondary shadow-none num-latin',
                    'hover:bg-muted/50',
                  )}
                >
                  {code}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <Card className="border-2 border-secondary/20 shadow-sm lg:col-span-3">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-secondary">
              <User className="size-5 shrink-0" aria-hidden />
              <CardTitle className="text-lg">{t('profile.personal_title')}</CardTitle>
            </div>
            <CardDescription>{t('profile.personal_subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                <input
                  id="profile-avatar-file"
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />

                <div className="space-y-2">
                  <Label htmlFor="profile-avatar-file" className="text-base">
                    {t('profile.photo_upload')}
                  </Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 border-secondary/60"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploadAvatar.isPending}
                    >
                      <Camera className="size-4" />
                      {uploadAvatar.isPending ? t('actions.loading') : t('profile.choose_photo')}
                    </Button>
                    <p className="text-muted-foreground text-xs">{t('profile.photo_hint')}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={profileForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.first_name')}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="given-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="father_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.father_name')}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="additional-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.last_name')}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="family-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.email')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            autoComplete="email"
                            dir="ltr"
                            className="num-latin"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.phone')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="tel"
                            className="num-latin"
                            dir="ltr"
                            placeholder="0912345678"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.city')}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="address-level2" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="preferred_language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.language')}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => field.onChange(v as 'ar' | 'en' | '__default__')}
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
                </div>

                <Button type="submit" disabled={update.isPending} className="min-w-[160px]">
                  {update.isPending ? t('actions.loading') : t('profile.save')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-2 border-secondary/20 shadow-sm lg:col-span-2">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-secondary">
              <Lock className="size-5 shrink-0" aria-hidden />
              <CardTitle className="text-lg">{t('profile.password_section')}</CardTitle>
            </div>
            <CardDescription>{t('profile.password_card_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={passwordForm.control}
                  name="current_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.current_password')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="current-password"
                          dir="ltr"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.new_password')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" autoComplete="new-password" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirm_new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.confirm_new_password')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" autoComplete="new-password" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full gap-2 border-secondary"
                  disabled={update.isPending}
                >
                  <Lock className="size-4" />
                  {update.isPending ? t('actions.loading') : t('profile.change_password_action')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
