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
