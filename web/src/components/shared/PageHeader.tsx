import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: string | undefined;
  /** Alias for `subtitle` (accounting list pages). */
  description?: string | undefined;
  actions?: ReactNode;
  className?: string;
};

/**
 * Consistent page header for CRUD screens.
 * Uses logical margin/padding for RTL-first layouts.
 */
export function PageHeader({ title, subtitle, description, actions, className }: PageHeaderProps) {
  const sub = subtitle ?? description;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold leading-tight">{title}</h1>
        {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? (
        <div dir="ltr" className="flex flex-wrap items-center gap-[5px]">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export type CreateButtonProps = {
  to: string;
  label: string;
  visible?: boolean;
};

/**
 * Standard "Create" action button for list pages.
 * Hidden when visible=false (convenient for permission checks).
 */
export function CreateButton({ to, label, visible = true }: CreateButtonProps) {
  if (!visible) return null;
  return (
    <Button asChild>
      <Link to={to}>
        <Plus className="me-2 size-4" />
        {label}
      </Link>
    </Button>
  );
}

export type BackButtonProps = {
  to: string;
  label: string;
};

/**
 * Standard back navigation for form/detail pages.
 */
export function BackButton({ to, label }: BackButtonProps) {
  return (
    <Button variant="outline" asChild>
      <Link to={to}>{label}</Link>
    </Button>
  );
}
