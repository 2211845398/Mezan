import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

function tabButtonClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
  );
}

type TabLabelProps = {
  label: string;
  icon?: LucideIcon | undefined;
  badge?: ReactNode;
};

function TabLabel({ label, icon: Icon, badge }: TabLabelProps) {
  return (
    <>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {label}
      {badge}
    </>
  );
}

export type PageTabNavLinkItem = TabLabelProps & {
  to: string;
};

export type PageTabNavButtonItem = TabLabelProps & {
  id: string;
};

type PageTabNavBaseProps = {
  className?: string | undefined;
};

export type PageTabNavNavLinkProps = PageTabNavBaseProps & {
  mode: 'navlink';
  items: PageTabNavLinkItem[];
};

export type PageTabNavButtonProps = PageTabNavBaseProps & {
  mode: 'button';
  items: PageTabNavButtonItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export type PageTabNavProps = PageTabNavNavLinkProps | PageTabNavButtonProps;

export function PageTabNav(props: PageTabNavProps) {
  const navClass = cn('flex flex-wrap gap-2 border-b border-border pb-2', props.className);

  if (props.mode === 'navlink') {
    return (
      <nav className={navClass}>
        {props.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => tabButtonClass(isActive)}
          >
            <TabLabel label={item.label} icon={item.icon} badge={item.badge} />
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className={navClass}>
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={tabButtonClass(props.activeId === item.id)}
          onClick={() => props.onSelect(item.id)}
        >
          <TabLabel label={item.label} icon={item.icon} badge={item.badge} />
        </button>
      ))}
    </nav>
  );
}
