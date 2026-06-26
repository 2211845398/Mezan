import { useTranslation } from 'react-i18next';

import { MezanLogoWhite } from '@/components/shared/MezanLogoWhite';
import { cn } from '@/lib/utils';

export type AuthLayoutProps = {
  children?: React.ReactNode;
  className?: string;
};

/**
 * Split-screen shell for sign-in / forgot / reset / onboarding screens.
 * - Brand sidebar (~38%): Palm Green with white wordmark
 * - Form pane: off-white canvas with elevated login card
 * - Mobile: brand banner stacks above the form
 */
export function AuthLayout({ children, className }: AuthLayoutProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className={cn('flex h-full min-h-0 w-full flex-col md:flex-row', className)}
      dir={i18n.dir()}
    >
      <aside
        aria-hidden="true"
        className="flex shrink-0 flex-col items-center justify-center bg-primary px-6 py-10 md:w-[38%] md:py-0"
      >
        <MezanLogoWhite title={t('layout.app_name')} className="max-w-[160px] md:max-w-[200px]" />
        <p className="mt-6 max-w-xs text-center text-sm font-medium leading-relaxed text-primary-foreground/85">
          {t('auth:brand.tagline')}
        </p>
      </aside>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-[#F8F9FA] px-4 py-8 md:py-12">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-lg">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
