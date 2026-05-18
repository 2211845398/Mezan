import { cn } from '@/lib/utils';

type StatusKey =
  | 'draft'
  | 'sent'
  | 'open'
  | 'tracked'
  | 'pending_dispatch'
  | 'soft_closed'
  | 'in_transit'
  | 'closed'
  | 'received'
  | 'cancelled'
  | 'out_of_stock'
  | 'below_reorder'
  | 'ok'
  | 'none'
  | string;

const STATUS_CLASS: Record<string, string> = {
  draft: 'border-border bg-muted/60 text-muted-foreground',
  sent: 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  open: 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  tracked: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  pending_dispatch: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  soft_closed: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  in_transit: 'border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200',
  closed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  received: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  cancelled: 'border-destructive/40 bg-destructive/10 text-destructive',
  out_of_stock: 'border-destructive/40 bg-destructive/10 text-destructive',
  below_reorder: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  none: 'border-border bg-muted/40 text-muted-foreground',
};

type Props = {
  status: StatusKey;
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: Props) {
  const cls = STATUS_CLASS[status] ?? 'border-border bg-muted/40 text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        cls,
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}
