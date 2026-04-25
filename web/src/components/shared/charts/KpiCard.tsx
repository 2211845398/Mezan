import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  value,
  description,
  sparkline,
  className,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  sparkline?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <CardTitle className="text-2xl tabular-nums tracking-tight num-latin">{value}</CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      {sparkline ? <CardContent className="pt-0">{sparkline}</CardContent> : null}
    </Card>
  );
}
