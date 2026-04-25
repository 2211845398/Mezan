import { cn } from '@/lib/utils';

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-[240px] w-full animate-pulse rounded-md border border-border bg-muted/40', className)}
      role="status"
      aria-label="Loading chart"
    />
  );
}
