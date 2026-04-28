import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  value,
  footnote,
  description,
  sparkline,
  className,
  to,
}: {
  title: string;
  value: ReactNode;
  /** Full-precision line shown under the headline number (e.g. exact money amount). */
  footnote?: string;
  description?: string;
  sparkline?: ReactNode;
  className?: string;
  to?: string;
}) {
  const card = (
    <Card
      className={cn(
        'h-full transition-colors',
        to && 'hover:border-muted-foreground/30 hover:bg-muted/40',
        className,
      )}
    >
      <CardHeader className="space-y-2 pb-2">
        <p className="text-sm font-medium leading-snug text-muted-foreground">{title}</p>
        <div className="flex min-h-[2.75rem] items-start gap-2">
          <CardTitle className="min-w-0 flex-1 text-start text-2xl tabular-nums leading-none tracking-tight text-card-foreground num-latin">
            {value}
          </CardTitle>
        </div>
        {footnote ? (
          <p className="text-[11px] leading-snug text-muted-foreground num-latin">{footnote}</p>
        ) : null}
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
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
