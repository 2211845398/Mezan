import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Grid row matching `/marketing/analytics` KPI cards. */
export const kpiCardGridClassName = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4';

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
        'h-full border-border/80 shadow-sm transition-colors',
        to && 'hover:border-muted-foreground/30 hover:bg-muted/40',
        className,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-start text-2xl font-semibold tabular-nums leading-none tracking-tight text-card-foreground num-latin">
          {value}
        </div>
        {footnote ? (
          <p className="text-start text-xs leading-snug text-muted-foreground num-latin">{footnote}</p>
        ) : null}
        {description ? (
          <p className="text-start text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {sparkline ? <div className="pt-2">{sparkline}</div> : null}
      </CardContent>
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
