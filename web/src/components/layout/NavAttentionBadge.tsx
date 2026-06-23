import { Badge } from '@/components/ui/badge';
import type { NavBadgeKind } from '@/config/navigation';
import { cn } from '@/lib/utils';

type Props = {
  count: number;
  className?: string;
  /** Current route matches this nav item (green active row). */
  navItemActive?: boolean;
  kind?: NavBadgeKind;
};

function badgeVariant(kind: NavBadgeKind | undefined): 'successSoft' | 'attention' {
  return kind === 'commercial_restock' ? 'attention' : 'successSoft';
}

/** Sidebar count: soft green (default) or attention (commercial restock). */
export function NavAttentionBadge({ count, className, navItemActive, kind }: Props) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <Badge
      variant={badgeVariant(kind)}
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
