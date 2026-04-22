import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/*
 * W-2 branch-picker stub. `<RequireBranchContext />` redirects here when the
 * authenticated user has neither a `branch_id` on `/auth/me` nor a branch
 * selected in the UI store. The real picker (listing the user's branch
 * memberships from `/auth/me`) ships with W-5.
 */

export default function SelectBranchPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md space-y-4 text-center">
        <Building2 className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:branch.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:branch.stub_body')}</p>
      </div>
    </div>
  );
}
