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
import type { NavItem, NavSection } from '@/config/navigation';
import { navBadgeCount, useNavBadges, type NavBadgeCounts } from '@/hooks/useNavBadges';
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
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
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
    const n = navBadgeCount(badges, item.badge);
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
            <NavAttentionBadge count={n} navItemActive={isActive} />
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
          <NavAttentionBadge count={navBadgeCount(badges, item.badge)} />
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
                      <NavAttentionBadge
                        count={navBadgeCount(badges, child.badge)}
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
    const n = navBadgeCount(badges, item.badge);
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
              <>
                <Icon className="size-5 shrink-0" />
                {n > 0 ? (
                  <span className="absolute end-0 top-0 z-[3] -translate-y-1/2 translate-x-1/4">
                    <NavAttentionBadge
                      count={n}
                      navItemActive={isActive}
                      className="h-4 min-w-4 px-1 text-[9px]"
                    />
                  </span>
                ) : null}
              </>
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
          <Icon className="size-5 shrink-0" />
          {navBadgeCount(badges, item.badge) > 0 ? (
            <span className="absolute end-0 top-0 z-[3] -translate-y-1/2 translate-x-1/4">
              <NavAttentionBadge
                count={navBadgeCount(badges, item.badge)}
                navItemActive={active}
                className="h-4 min-w-4 px-1 text-[9px]"
              />
            </span>
          ) : null}
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
                  <NavAttentionBadge
                    count={navBadgeCount(badges, child.badge)}
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
