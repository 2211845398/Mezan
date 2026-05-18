import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ContentSurfaceProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Simple bordered surface for page content.
 * Use inside AdminLayout main areas for consistent padding/borders.
 */
export function ContentSurface({ children, className }: ContentSurfaceProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

export type SectionCardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Card with optional header for form sections or grouped content.
 */
export function SectionCard({
  title,
  description,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={className}>
      {title ? (
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('p-6', title ? 'pt-0' : '', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export type FormContainerProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: '',
};

/**
 * Centered container for standalone forms (create/edit pages).
 * Constrains width and centers on the page with consistent padding.
 */
export function FormContainer({ children, className, maxWidth = 'md' }: FormContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6', maxWidthClasses[maxWidth], className)}>
      {children}
    </div>
  );
}
