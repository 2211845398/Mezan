import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  value,
  footnote,
  description,
  sparkline,
  className,
  to,
  dir: dirOverride,
}: {
  title: string;
  value: ReactNode;
  /** Full-precision line shown under the headline number (e.g. exact money amount). */
  footnote?: string;
  description?: string;
  sparkline?: ReactNode;
  className?: string;
  to?: string;
  /** Override text direction (defaults to active i18n locale). */
  dir?: 'ltr' | 'rtl';
}) {
  const { i18n } = useTranslation();
  const dir = dirOverride ?? i18n.dir();

  const card = (
    <Card
      dir={dir}
      className={cn(
        'h-full transition-colors',
        to && 'hover:border-muted-foreground/30 hover:bg-muted/40',
        className,
      )}
    >
      <CardHeader className="space-y-1.5 pb-2">
        <p className="text-start text-sm font-medium leading-snug text-muted-foreground">{title}</p>
        <div className="text-start text-2xl font-semibold tabular-nums leading-none tracking-tight text-card-foreground num-latin">
          {value}
        </div>
        {footnote ? (
          <p className="text-start text-[11px] leading-snug text-muted-foreground num-latin">
            {footnote}
          </p>
        ) : null}
        {description ? (
          <p className="text-start text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      {sparkline ? <CardContent className="pt-0">{sparkline}</CardContent> : null}
    </Card>
  );

  if (!to) return card;

  return (
    <Link
      to={to}
      className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}
