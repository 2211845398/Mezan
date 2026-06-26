import { buttonVariants } from '@/components/ui/button-variants';
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

/** Compact outline danger — white surface, destructive label (e.g. close period). */
export const floatingFormDangerOutlineButtonSmClassName = cn(
  'h-9 min-h-9 rounded-lg border border-slate-300 bg-background px-3 text-sm font-medium text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive',
  'dark:border-border',
);

/** Same shell as `AlertDialogCancel` (`variant=outline`); colored label for dialogs. */
export const outlineCancelMatchPrimaryClassName = cn(
  buttonVariants({ variant: 'outline' }),
  'text-primary hover:bg-muted/60 hover:text-primary',
);

export const outlineCancelMatchDestructiveClassName = cn(
  buttonVariants({ variant: 'outline' }),
  'text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive',
);

/** Detail page header — h-10 primary approve (matches BackButton height). */
export const detailHeaderApproveButtonClassName = cn(
  'h-10 min-h-10 rounded-md px-4 font-medium shadow-sm',
  'bg-primary text-primary-foreground hover:bg-primary/90',
);

/** Detail page header — h-10 outline cancel (matches BackButton height). */
export const detailHeaderCancelButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'default' }),
  'h-10 min-h-10 border-slate-300 text-primary hover:bg-muted/60 hover:text-primary dark:border-border',
);

/** Detail page header — h-10 outline destructive label. */
export const detailHeaderDangerOutlineButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'default' }),
  'h-10 min-h-10 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive',
);

export const outlineCancelMatchPrimarySmClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'text-primary hover:bg-muted/60 hover:text-primary',
);

export const outlineCancelMatchDestructiveSmClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'text-destructive hover:bg-destructive/10 hover:text-destructive',
);
