import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, Shield, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import type { ProfileUpdate } from '@/api/types';
import {
  FloatingFormDialog,
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthFieldError } from '@/features/auth/components/AuthFieldError';
import {
  buildProfilePasswordSchema,
  PROFILE_PASSWORD_FIELD_ORDER,
  type ProfilePasswordFormValues,
  profilePasswordFieldErrorMessage,
} from '@/features/auth/lib/profilePasswordValidationUi';
import type { AuthUser } from '@/features/auth/stores/authStore';
import { useAuthStore } from '@/features/auth/stores/authStore';
import EmployeeLeaveRequestDialog from '@/features/hr/pages/employees/EmployeeLeaveRequestDialog';
import { resolveMediaUrl, withMediaCacheBust } from '@/lib/mediaUrl';
import { formatPersonName } from '@/lib/personName';
import { createFormInvalidHandler, focusFirstFormError, useFormValidationDisplay } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import { isLibyanMobilePhone } from '@/lib/validation/contact';
import { cn } from '@/lib/utils';

import type { UserRead } from '../api';
import { toggleTwoFactor } from '../api';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useUploadAvatar } from '../hooks/useUploadAvatar';
import { authKeys, useMe } from '../queries';

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

function buildProfileSchema(t: (k: string) => string, tc: (k: string) => string) {
  return z.object({
    email: z.string().trim().email(tc('errors.validation_email_invalid')),
    first_name: z.string().trim().min(1, t('profile.first_name_required')),
    father_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    phone: z
      .string()
      .optional()
      .refine(
        (v) => {
          const s = v?.trim() ?? '';
          return s.length === 0 || isLibyanMobilePhone(s);
        },
        { message: t('profile.phone_invalid_ly') },
      ),
    city: z.string().optional(),
    /** Sentinel `__default__` maps to API `null` (no preference). */
    preferred_language: z.enum(['ar', 'en', '__default__']),
  });
}

type ProfileFormValues = z.infer<ReturnType<typeof buildProfileSchema>>;

export default function ProfilePage() {
  const { t, i18n } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { t: tHr } = useTranslation('hr');
  const { t: tInv } = useTranslation('inventory');
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const avatarCacheBust = useAuthStore((s) => s.avatarCacheBust);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const { data: me, isLoading, isError } = useMe();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const profileSchema = useMemo(() => buildProfileSchema(t, tCommon), [t, tCommon]);
  const passwordSchema = buildProfilePasswordSchema();

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

  const profileEditMode = useEditableFormMode({ form: profileForm, canEdit: true });
  const profileTextRo = (extra?: string) =>
    readOnlyTextInputProps(profileEditMode.fieldsEnabled, extra);

  const profileLanguageValue = profileForm.watch('preferred_language');
  const profileLanguageLabel = useMemo(() => {
    if (profileLanguageValue === 'ar') return t('profile.language_ar');
    if (profileLanguageValue === 'en') return t('profile.language_en');
    return t('profile.language_default');
  }, [profileLanguageValue, t]);
  const PROFILE_FORM_ID = 'auth-profile-form';

  const passwordForm = useForm<ProfilePasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_new_password: '',
    },
  });

  const onProfileInvalid = createFormInvalidHandler(profileForm, {
    fieldOrder: [
      'first_name',
      'father_name',
      'last_name',
      'email',
      'phone',
      'city',
      'preferred_language',
    ],
  });
  const {
    errors: passwordErrors,
    showError: showPasswordError,
    invalidClass: passwordInvalidClass,
  } = useFormValidationDisplay(passwordForm.control);

  const clearPasswordFieldError = useCallback(
    (field: (typeof PROFILE_PASSWORD_FIELD_ORDER)[number]) => {
      passwordForm.clearErrors(field);
    },
    [passwordForm],
  );

  const closePasswordChange = useCallback(() => {
    passwordForm.reset({
      current_password: '',
      new_password: '',
      confirm_new_password: '',
    });
    passwordForm.clearErrors();
    setPasswordChangeOpen(false);
  }, [passwordForm]);

  const onPasswordInvalid = (errs: FieldErrors<ProfilePasswordFormValues>) => {
    focusFirstFormError(passwordForm, errs, PROFILE_PASSWORD_FIELD_ORDER);
  };

  useEffect(() => {
    if (!me) return;
    profileForm.reset({
      email: me.email ?? '',
      first_name: me.first_name ?? '',
      father_name: me.father_name ?? '',
      last_name: me.family_name ?? '',
      phone: me.phone ?? '',
      city: me.city ?? '',
      preferred_language:
        me.preferred_language === 'en' || me.preferred_language === 'ar'
          ? me.preferred_language
          : '__default__',
    });
    profileEditMode.syncSnapshot();
  }, [me, profileForm, profileEditMode.syncSnapshot]);

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
  const displayName =
    (composedName ?? formatPersonName(me.first_name, me.father_name, me.family_name)) || me.email;
  const heroAvatarSrc =
    localPreview ??
    withMediaCacheBust(resolveMediaUrl(me.avatar_url), avatarCacheBust);
  const ini = initials(
    displayName === me.email ? null : displayName,
    emailWatch || me.email,
  );

  function onProfileSubmit(values: ProfileFormValues) {
    const phone =
      values.phone == null || values.phone.trim() === '' ? null : values.phone.trim();
    const city = values.city == null || values.city.trim() === '' ? null : values.city.trim();

    const payload: ProfileUpdate = {
      email: values.email.trim(),
      first_name: values.first_name?.trim() || null,
      father_name: values.father_name?.trim() || null,
      family_name: values.last_name?.trim() || null,
      phone,
      city,
      preferred_language:
        values.preferred_language === '__default__' ? null : values.preferred_language,
    };

    update.mutate(payload, {
      onSuccess: (next) => {
        setUser(next as AuthUser);
        toast.success(t('profile.saved'));
        profileEditMode.finishEdit();
      },
      onError: (err) => {
        const message = applyApiErrorToForm(profileForm, err);
        if (message) toast.error(message);
      },
    });
  }

  function onPasswordSubmit(values: ProfilePasswordFormValues) {
    update.mutate(
      {
        current_password: values.current_password,
        new_password: values.new_password.trim(),
      },
      {
        onSuccess: (next) => {
          setUser(next as AuthUser);
          closePasswordChange();
          toast.success(t('profile.password_updated'));
        },
        onError: (err) => {
          const message = applyApiErrorToForm(passwordForm, err);
          if (message) toast.error(message);
        },
      },
    );
  }

  function syncTwoFactorUser(updated: UserRead) {
    const current = useAuthStore.getState().user;
    if (current) {
      setUser({ ...current, ...updated } as AuthUser);
    }
    queryClient.setQueryData<UserRead>(authKeys.me(), (prev) =>
      prev ? { ...prev, ...updated } : updated,
    );
  }

  async function handleTwoFactorToggle(checked: boolean) {
    if (checked) {
      setTwoFactorPassword('');
      setTwoFactorDialogOpen(true);
      return;
    }
    setTwoFactorBusy(true);
    try {
      const updated = await toggleTwoFactor({ enabled: false });
      syncTwoFactorUser(updated);
      toast.success(t('profile.two_factor_disabled'));
    } catch (err) {
      notifyApiError(err, t('profile.two_factor_failed'));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmEnableTwoFactor() {
    if (!twoFactorPassword.trim()) {
      toast.error(t('profile.two_factor_password_required'));
      return;
    }
    setTwoFactorBusy(true);
    try {
      const updated = await toggleTwoFactor({
        enabled: true,
        current_password: twoFactorPassword,
      });
      syncTwoFactorUser(updated);
      setTwoFactorDialogOpen(false);
      setTwoFactorPassword('');
      toast.success(t('profile.two_factor_enabled'));
    } catch (err) {
      notifyApiError(err, t('profile.two_factor_failed'));
    } finally {
      setTwoFactorBusy(false);
    }
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

  const showLeaveRequest = me.employee_profile_id != null && me.employee_profile_id > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('profile.page_title')}
        actions={
          showLeaveRequest ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/my-leaves">{tHr('leave.my_title')}</Link>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/my-stock-count">{tInv('movement.stock_count.my_list_title')}</Link>
              </Button>
              <Button type="button" size="sm" onClick={() => setLeaveDialogOpen(true)}>
                {tHr('leave.dialog.trigger')}
              </Button>
            </div>
          ) : null
        }
      />

      {showLeaveRequest ? (
        <EmployeeLeaveRequestDialog
          employeeProfileId={me.employee_profile_id!}
          open={leaveDialogOpen}
          onOpenChange={setLeaveDialogOpen}
          selfService
        />
      ) : null}

      <div className="space-y-4">
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

      <div
        className={cn(
          'grid gap-5 lg:grid-cols-5',
          passwordChangeOpen ? 'lg:items-stretch' : 'lg:items-start',
        )}
      >
        <Card
          className={cn(
            'border-2 border-secondary/20 py-2.5 shadow-sm lg:col-span-3',
            passwordChangeOpen && 'flex h-full flex-col',
          )}
        >
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-secondary">
              <User className="size-5 shrink-0" aria-hidden />
              <CardTitle className="text-lg">{t('profile.personal_title')}</CardTitle>
            </div>
            <CardDescription>{t('profile.personal_subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form
                id={PROFILE_FORM_ID}
                noValidate
                onSubmit={profileForm.handleSubmit(onProfileSubmit, onProfileInvalid)}
                className="space-y-6"
              >
                <fieldset
                  disabled={update.isPending}
                  className="space-y-6 border-0 p-0 m-0 min-w-0"
                >
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
                      disabled={uploadAvatar.isPending || !profileEditMode.fieldsEnabled}
                    >
                      <Camera className="size-4" />
                      {uploadAvatar.isPending ? t('actions.loading') : t('profile.choose_photo')}
                    </Button>
                    <p className="text-muted-foreground text-xs">{t('profile.photo_hint')}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3" dir={i18n.dir()}>
                  <FormField
                    control={profileForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.first_name')}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="given-name" {...profileTextRo()} />
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
                          <Input {...field} autoComplete="additional-name" {...profileTextRo()} />
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
                          <Input {...field} autoComplete="family-name" {...profileTextRo()} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2" dir={i18n.dir()}>
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
                            {...profileTextRo('num-latin')}
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
                            dir="ltr"
                            {...profileTextRo('num-latin')}
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
                          <Input {...field} autoComplete="address-level2" {...profileTextRo()} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-4">
                    <FormField
                      control={profileForm.control}
                      name="preferred_language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('profile.language')}</FormLabel>
                          {profileEditMode.fieldsEnabled ? (
                            <Select
                              value={field.value}
                              onValueChange={(v) => field.onChange(v as 'ar' | 'en' | '__default__')}
                            >
                              <FormControl>
                                <SelectTrigger dir={i18n.dir()}>
                                  <SelectValue placeholder={t('profile.language')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent dir={i18n.dir()}>
                                <SelectItem value="__default__">{t('profile.language_default')}</SelectItem>
                                <SelectItem value="ar">{t('profile.language_ar')}</SelectItem>
                                <SelectItem value="en">{t('profile.language_en')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <FormControl>
                              <ReadOnlyCopyableField
                                value={profileLanguageLabel}
                                dir={i18n.dir()}
                              />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormValidationAlert />
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="hidden sm:block" aria-hidden />
                  <DetailFormActionBar
                    isEditing={profileEditMode.isEditing}
                    canEdit
                    isSubmitting={update.isPending}
                    formId={PROFILE_FORM_ID}
                    onStartEdit={profileEditMode.startEdit}
                    onCancelEdit={profileEditMode.cancelEdit}
                    className="w-full justify-end"
                  />
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'border-2 border-secondary/20 py-2.5 shadow-sm lg:col-span-2',
            passwordChangeOpen && 'flex h-full flex-col',
          )}
        >
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-secondary">
              <Lock className="size-5 shrink-0" aria-hidden />
              <CardTitle className="text-lg">{t('profile.password_section')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form
                noValidate
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit, onPasswordInvalid)}
                className="space-y-4"
              >
                {!passwordChangeOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-secondary"
                    onClick={() => setPasswordChangeOpen(true)}
                  >
                    <Lock className="size-4" aria-hidden="true" />
                    {t('profile.change_password_action')}
                  </Button>
                ) : null}

                <div
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
                    passwordChangeOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                  aria-hidden={!passwordChangeOpen}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-4">
                      <FormField
                        control={passwordForm.control}
                        name="current_password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('profile.current_password')}</FormLabel>
                            <FormControl>
                              <PasswordInput
                                {...field}
                                autoComplete="current-password"
                                className={cn(
                                  'transition-all duration-300 ease-out',
                                  passwordInvalidClass('current_password'),
                                )}
                                aria-invalid={showPasswordError('current_password') || undefined}
                                aria-describedby={
                                  showPasswordError('current_password')
                                    ? 'profile-current-password-error'
                                    : undefined
                                }
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearPasswordFieldError('current_password');
                                }}
                                onFocus={() => clearPasswordFieldError('current_password')}
                              />
                            </FormControl>
                            <FormMessage />
                            <AuthFieldError
                              id="profile-current-password-error"
                              message={
                                profilePasswordFieldErrorMessage(
                                  passwordErrors.current_password,
                                  t,
                                  tCommon,
                                ) ?? ''
                              }
                              visible={showPasswordError('current_password')}
                            />
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
                              <PasswordInput
                                {...field}
                                autoComplete="new-password"
                                className={cn(
                                  'transition-all duration-300 ease-out',
                                  passwordInvalidClass('new_password'),
                                )}
                                aria-invalid={showPasswordError('new_password') || undefined}
                                aria-describedby={
                                  showPasswordError('new_password')
                                    ? 'profile-new-password-error'
                                    : undefined
                                }
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearPasswordFieldError('new_password');
                                }}
                                onFocus={() => clearPasswordFieldError('new_password')}
                              />
                            </FormControl>
                            <FormMessage />
                            <AuthFieldError
                              id="profile-new-password-error"
                              message={
                                profilePasswordFieldErrorMessage(
                                  passwordErrors.new_password,
                                  t,
                                  tCommon,
                                ) ?? ''
                              }
                              visible={showPasswordError('new_password')}
                            />
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
                              <PasswordInput
                                {...field}
                                autoComplete="new-password"
                                className={cn(
                                  'transition-all duration-300 ease-out',
                                  passwordInvalidClass('confirm_new_password'),
                                )}
                                aria-invalid={showPasswordError('confirm_new_password') || undefined}
                                aria-describedby={
                                  showPasswordError('confirm_new_password')
                                    ? 'profile-confirm-password-error'
                                    : undefined
                                }
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearPasswordFieldError('confirm_new_password');
                                }}
                                onFocus={() => clearPasswordFieldError('confirm_new_password')}
                              />
                            </FormControl>
                            <FormMessage />
                            <AuthFieldError
                              id="profile-confirm-password-error"
                              message={
                                profilePasswordFieldErrorMessage(
                                  passwordErrors.confirm_new_password,
                                  t,
                                  tCommon,
                                ) ?? ''
                              }
                              visible={showPasswordError('confirm_new_password')}
                            />
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-col gap-2">
                        <Button
                          type="submit"
                          variant="outline"
                          className="w-full gap-2 border-secondary"
                          disabled={update.isPending}
                        >
                          <Lock className="size-4" aria-hidden="true" />
                          {update.isPending
                            ? t('actions.loading')
                            : t('profile.change_password_action')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full text-muted-foreground"
                          disabled={update.isPending}
                          onClick={closePasswordChange}
                        >
                          {t('profile.password_cancel')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </Form>

            <Separator className="my-6" />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-secondary">
                <Shield className="size-5 shrink-0" aria-hidden />
                <h3 className="text-base font-semibold">{t('profile.two_factor_section')}</h3>
              </div>
              <p className="text-muted-foreground text-sm">{t('profile.two_factor_hint')}</p>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="two-factor-toggle">{t('profile.two_factor_enable')}</Label>
                <Switch
                  id="two-factor-toggle"
                  checked={me.two_factor_enabled === true}
                  disabled={twoFactorBusy}
                  onCheckedChange={handleTwoFactorToggle}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>

      <FloatingFormDialog
        open={twoFactorDialogOpen}
        onOpenChange={(open) => {
          if (!open && !twoFactorBusy) {
            setTwoFactorPassword('');
          }
          setTwoFactorDialogOpen(open);
        }}
        title={t('profile.two_factor_confirm_title')}
        description={t('profile.two_factor_confirm_hint')}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTwoFactorDialogOpen(false)}
              disabled={twoFactorBusy}
              className={floatingFormCloseButtonClassName}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="submit"
              form="two-factor-enable-form"
              disabled={twoFactorBusy || !twoFactorPassword.trim()}
              className={floatingFormApproveButtonClassName}
            >
              {twoFactorBusy ? t('actions.loading') : t('profile.two_factor_confirm_action')}
            </Button>
          </>
        }
      >
        <form
          id="two-factor-enable-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmEnableTwoFactor();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="two-factor-dialog-password">{t('profile.current_password')}</Label>
            <PasswordInput
              id="two-factor-dialog-password"
              autoComplete="current-password"
              value={twoFactorPassword}
              onChange={(e) => setTwoFactorPassword(e.target.value)}
              disabled={twoFactorBusy}
              autoFocus
            />
          </div>
        </form>
      </FloatingFormDialog>
    </div>
  );
}
