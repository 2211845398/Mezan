import { Skeleton } from '@/components/ui/skeleton';

/** Lightweight list-page placeholder while route chunks or queries load. */
export function PageListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="rounded-md border">
        <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
