import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type FloatingFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
};

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * Centered floating form dialog matching the UI screenshot style.
 * - Centered white surface with rounded corners
 * - Dark overlay
 * - RTL-first text alignment
 * - Vertical field rhythm
 * - Primary action (dark) + outline cancel pattern
 *
 * Use with the shared Form component and form primitives for consistent UX.
 */
export function FloatingFormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: FloatingFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('gap-6 overflow-hidden p-0', maxWidthClasses[maxWidth])}>
        <DialogHeader className="space-y-2 px-6 pt-6">
          <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="max-h-[calc(100dvh-14rem)] space-y-4 overflow-y-auto px-6">{children}</div>
        {footer ? <DialogFooter className="gap-2 border-t px-6 py-4 sm:justify-between">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export type FloatingFormActionsProps = {
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
};

/**
 * Standard footer actions for floating form dialogs.
 * Primary action is dark (default variant), cancel is outline.
 * RTL-safe button order via flex row-reverse on small screens (which respects dir).
 */
export function FloatingFormActions({
  submitLabel,
  cancelLabel,
  onCancel,
  isSubmitting = false,
  submitDisabled = false,
}: FloatingFormActionsProps) {
  return (
    <>
      <button
        type="submit"
        disabled={isSubmitting || submitDisabled}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {cancelLabel}
      </button>
    </>
  );
}
