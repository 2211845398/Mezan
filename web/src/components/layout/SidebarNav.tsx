import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { NavItem, NavSection, NavBadgeKind } from '@/config/navigation';
import { navBadgeCount, type NavBadgeCounts, useNavBadges } from '@/hooks/useNavBadges';
import { cn } from '@/lib/utils';

import { NavAttentionBadge } from './NavAttentionBadge';

const SECTION_LABEL_KEYS: Record<NavSection, string> = {
  ops: 'layout.nav_section_ops',
  finance: 'layout.nav_section_finance',
  people: 'layout.nav_section_people',
  growth: 'layout.nav_section_growth',
  system: 'layout.nav_section_system',
};

export type SidebarNavVariant = 'expanded' | 'collapsed' | 'sheet';

export type SidebarNavProps = {
  items: NavItem[];
  variant: SidebarNavVariant;
  /** Close mobile sheet after navigation. */
  onItemNavigate?: () => void;
};

type NavLeafLinkProps = {
  to: string;
  className?: string | ((state: { isActive: boolean }) => string);
  activeClassName?: string;
  children: React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode);
  onNavigate?: () => void;
};

const NavLeafLink = React.forwardRef<HTMLAnchorElement, NavLeafLinkProps>(function NavLeafLink(
  { to, className, activeClassName, children, onNavigate },
  ref,
) {
  return (
    <NavLink
      ref={ref}
      to={to}
      onClick={() => onNavigate?.()}
      className={(state) =>
        cn(typeof className === 'function' ? className(state) : className, state.isActive && activeClassName)
      }
    >
      {(state) => (typeof children === 'function' ? children(state) : children)}
    </NavLink>
  );
});
NavLeafLink.displayName = 'NavLeafLink';

function isItemActive(item: NavItem, pathname: string): boolean {
  if (
    item.key === 'pos' &&
    (pathname === '/pos' || pathname.startsWith('/pos/'))
  ) {
    return true;
  }
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
}

function navItemBadgeKinds(item: NavItem): NavBadgeKind[] {
  if (item.badges?.length) return item.badges;
  if (item.badge) return [item.badge];
  return [];
}

function NavBadgeGroup({
  kinds,
  badges,
  navItemActive,
  className,
}: {
  kinds: NavBadgeKind[];
  badges: NavBadgeCounts;
  navItemActive?: boolean;
  className?: string;
}) {
  const visible = kinds
    .map((kind) => ({ kind, count: navBadgeCount(badges, kind) }))
    .filter((entry) => entry.count > 0);
  if (!visible.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {visible.map(({ kind, count }) => (
        <NavAttentionBadge
          key={kind}
          kind={kind}
          count={count}
          navItemActive={navItemActive}
          className={className}
        />
      ))}
    </span>
  );
}

function NavRowExpanded({
  item,
  onItemNavigate,
  badges,
}: {
  item: NavItem;
  onItemNavigate?: () => void;
  badges: NavBadgeCounts;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const Icon = item.icon;
  const [open, setOpen] = React.useState(false);
  const label = t(item.labelKey);
  const active = isItemActive(item, location.pathname);

  React.useEffect(() => {
    if (item.children?.length) setOpen(active);
  }, [active, item.children?.length]);

  if (!item.children?.length) {
    const kinds = navItemBadgeKinds(item);
    return (
      <NavLeafLink
        to={item.href}
        {...(onItemNavigate ? { onNavigate: onItemNavigate } : {})}
        className="relative flex items-center gap-3 overflow-visible rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted"
        activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
      >
        {({ isActive }) => (
          <>
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <NavBadgeGroup kinds={kinds} badges={badges} navItemActive={isActive} />
          </>
        )}
      </NavLeafLink>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-muted',
          active && 'bg-muted text-sidebar-foreground',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <NavBadgeGroup kinds={navItemBadgeKinds(item)} badges={badges} />
          <ChevronDown className={cn('size-4 shrink-0 transition-transform', open ? 'rotate-180' : '')} />
        </span>
      </button>
      {open && (
        <ul className="ms-6 space-y-1 border-s border-sidebar-border ps-2">
          {item.children.map((child) => {
            const ChildIcon = child.icon;
            return (
              <li key={child.key}>
                <NavLeafLink
                  to={child.href}
                  {...(onItemNavigate ? { onNavigate: onItemNavigate } : {})}
                  className="relative flex items-center gap-2 overflow-visible rounded-md px-3 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-muted"
                  activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
                >
                  {({ isActive }) => (
                    <>
                      <ChildIcon className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t(child.labelKey)}</span>
                      <NavBadgeGroup
                        kinds={navItemBadgeKinds(child)}
                        badges={badges}
                        navItemActive={isActive}
                      />
                    </>
                  )}
                </NavLeafLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NavRowCollapsed({
  item,
  onItemNavigate,
  badges,
}: {
  item: NavItem;
  onItemNavigate?: () => void;
  badges: NavBadgeCounts;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const active = isItemActive(item, location.pathname);

  if (!item.children?.length) {
    const kinds = navItemBadgeKinds(item);
    const collapsedCount = kinds.reduce((sum, kind) => sum + navBadgeCount(badges, kind), 0);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLeafLink
            to={item.href}
            {...(onItemNavigate ? { onNavigate: onItemNavigate } : {})}
            className={({ isActive }) =>
              cn(
                'relative flex items-center justify-center overflow-visible rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-muted',
                isActive && 'z-[1]',
              )
            }
            activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
          >
            {({ isActive }) => (
              <span className="relative inline-flex size-9 shrink-0 items-center justify-center">
                <Icon className="size-5 shrink-0" aria-hidden />
                <NavAttentionBadge
                  count={collapsedCount}
                  navItemActive={isActive}
                  className={cn(
                    'absolute z-20 h-4 min-w-4 px-1 text-[9px] -end-1 -top-1',
                  )}
                />
              </span>
            )}
          </NavLeafLink>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex w-full items-center justify-center overflow-visible rounded-md p-2 text-sidebar-foreground transition-colors hover:bg-muted',
            active && 'z-[1] bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary',
          )}
          aria-label={label}
          title={label}
        >
          <span className="relative inline-flex size-9 shrink-0 items-center justify-center">
            <Icon className="size-5 shrink-0" aria-hidden />
            <NavAttentionBadge
              count={navItemBadgeKinds(item).reduce(
                (sum, kind) => sum + navBadgeCount(badges, kind),
                0,
              )}
              navItemActive={active}
              className={cn(
                'absolute z-20 h-4 min-w-4 px-1 text-[9px] -end-1 -top-1',
              )}
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="bottom" sideOffset={6}>
        {item.children.map((child) => (
          <DropdownMenuItem key={child.key} asChild>
            <NavLink
              to={child.href}
              onClick={() => onItemNavigate?.()}
              className={({ isActive }) =>
                cn(
                  'relative flex cursor-pointer items-center justify-between gap-2 overflow-visible',
                  isActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{t(child.labelKey)}</span>
                  <NavBadgeGroup
                    kinds={navItemBadgeKinds(child)}
                    badges={badges}
                    navItemActive={isActive}
                  />
                </>
              )}
            </NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * RBAC-filtered tree is passed in from the parent (`useFilteredNavigation`).
 */
export function SidebarNav({ items, variant, onItemNavigate }: SidebarNavProps) {
  const { t } = useTranslation();
  const badges = useNavBadges();
  let lastSection: NavSection | undefined;

  return (
    <nav
      className={cn(
        'mezan-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto p-3',
        variant === 'collapsed' && 'px-2',
      )}
    >
      {items.map((item) => {
        const showSectionHeader = item.section != null && item.section !== lastSection;
        if (item.section != null) {
          lastSection = item.section;
        }
        const header = showSectionHeader ? (
          <p
            key={`sec-${item.section}-${item.key}`}
            className={cn(
              'px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
              variant === 'collapsed' && 'sr-only',
            )}
          >
            {item.section ? t(SECTION_LABEL_KEYS[item.section]) : null}
          </p>
        ) : null;

        return (
          <React.Fragment key={item.key}>
            {header}
            {variant === 'collapsed' ? (
              <NavRowCollapsed
                item={item}
                badges={badges}
                {...(onItemNavigate ? { onItemNavigate } : {})}
              />
            ) : (
              <NavRowExpanded
                item={item}
                badges={badges}
                {...(onItemNavigate ? { onItemNavigate } : {})}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
