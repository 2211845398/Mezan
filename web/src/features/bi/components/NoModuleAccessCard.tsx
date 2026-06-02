import { ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type NoModuleAccessCardProps = {
  className?: string;
};

/**
 * Empty dashboard for authenticated users with no RBAC module access yet.
 */
export function NoModuleAccessCard({ className }: NoModuleAccessCardProps) {
  const { t } = useTranslation('bi');
  const { t: tCommon } = useTranslation('common');

  return (
    <div
      className={cn(
        'mx-auto flex max-w-lg flex-col items-center rounded-xl border border-border/80 bg-muted/40 px-6 py-10 text-center shadow-sm',
        className,
      )}
    >
      <div
        className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <ShieldOff className="size-7" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{t('home.no_access_title')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('home.no_access_body')}</p>
      <Button
        variant="outline"
        className="mt-6 border-secondary bg-transparent text-secondary hover:border-secondary hover:bg-secondary/10 hover:text-secondary"
        asChild
      >
        <Link to="/profile">{tCommon('layout.open_profile')}</Link>
      </Button>
    </div>
  );
}
