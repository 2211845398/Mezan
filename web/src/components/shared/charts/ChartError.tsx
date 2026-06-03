import { Button } from '@/components/ui/button';

export function ChartError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-[240px] w-full flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
