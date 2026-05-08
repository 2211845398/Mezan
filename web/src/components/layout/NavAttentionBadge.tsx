import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  count: number;
  className?: string;
  /** Current route matches this nav item (green active row). */
  navItemActive?: boolean;
};

/** Sidebar count: soft green; stronger ring/shadow when the row is active. */
export function NavAttentionBadge({ count, className, navItemActive }: Props) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <Badge
      variant="successSoft"
      className={cn(
        'pointer-events-none h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none',
        navItemActive
          ? cn(
              'relative z-[2] -translate-y-1 shadow-md',
              'ring-2 ring-sidebar-primary-foreground/35 dark:ring-sidebar-primary-foreground/25',
            )
          : null,
        className,
      )}
      aria-hidden
    >
      {label}
    </Badge>
  );
}
