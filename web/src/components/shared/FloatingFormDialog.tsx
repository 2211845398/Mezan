import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Save / Approve — white label on primary (green) */
export const floatingFormApproveButtonClassName = cn(
  'h-11 min-h-11 rounded-xl px-7 font-medium shadow-sm',
  'bg-primary text-primary-foreground hover:bg-primary/90',
);

/** Delete / risky confirm — white label on destructive red */
export const floatingFormDangerButtonClassName = cn(
  'h-11 min-h-11 rounded-xl px-7 font-medium shadow-sm',
  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
);

/** Close / Cancel — primary-colored label, white surface, light gray border */
export const floatingFormCloseButtonClassName = cn(
  'h-11 min-h-11 rounded-xl px-7 font-medium shadow-none',
  'border border-slate-300 bg-background text-primary hover:bg-muted/60 hover:text-primary',
  'dark:border-border',
);

/** Compact row actions — same palette as footer buttons, `h-9` */
export const floatingFormApproveButtonSmClassName = cn(
  'h-9 min-h-9 rounded-lg px-3 text-sm font-medium shadow-sm',
  'bg-primary text-primary-foreground hover:bg-primary/90',
);

export const floatingFormDangerButtonSmClassName = cn(
  'h-9 min-h-9 rounded-lg px-3 text-sm font-medium shadow-sm',
  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
);

export const floatingFormCloseButtonSmClassName = cn(
  'h-9 min-h-9 rounded-lg border border-slate-300 bg-background px-3 text-sm font-medium text-primary shadow-none hover:bg-muted/60 hover:text-primary',
  'dark:border-border',
);

export type FloatingFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
};

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

/**
 * Centered floating form dialog matching the UI screenshot style.
 * - Centered white surface with rounded corners
 * - Dark overlay
 * - RTL-first text alignment
 * - Vertical field rhythm
 * - Primary action: green approve (`floatingFormApproveButtonClassName`)
 * - Cancel/Close: outlined green label (`floatingFormCloseButtonClassName`)
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
      <DialogContent
        motionless
        className={cn(
          'flex max-h-[min(90dvh,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:rounded-lg',
          maxWidthClasses[maxWidth],
        )}
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pt-6">
          <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4 [scrollbar-gutter:stable]">
          {children}
        </div>
        {footer ? (
          <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">{footer}</DialogFooter>
        ) : null}
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
      <Button type="submit" disabled={isSubmitting || submitDisabled} className={floatingFormApproveButtonClassName}>
        {submitLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
        className={floatingFormCloseButtonClassName}
      >
        {cancelLabel}
      </Button>
    </>
  );
}
