import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type TableCategoryTagsProps = {
  /** Visible labels in order (first = primary). Typically 1–2 items in tables. */
  tags: string[];
  className?: string;
  /** Tooltip on the wrapper (e.g. full category list when chips are truncated). */
  title?: string;
};

/**
 * Category chips for data tables (`/catalog/products`, `/inventory/stock`).
 * First tag = primary (pale emerald + deep green); additional tags = muted slate (sub-category).
 */
export function TableCategoryTags({ tags, className, title }: TableCategoryTagsProps) {
  const list = tags.map((s) => s.trim()).filter((s) => s.length > 0);
  if (list.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div
      className={cn('flex flex-row flex-nowrap items-center justify-start gap-1.5', className)}
      title={title}
    >
      {list.map((label, i) => {
        const isPrimary = i === 0;
        return (
          <Badge
            key={`${label}-${i}`}
            variant="outline"
            title={label}
            className={cn(
              'max-w-[9.5rem] shrink-0 truncate border font-medium shadow-none',
              isPrimary
                ? 'border-emerald-200/60 bg-emerald-100/50 text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-100 dark:hover:bg-emerald-950/50'
                : 'border-slate-200/90 bg-slate-100 font-normal text-slate-600 hover:bg-slate-200/70 dark:border-slate-600 dark:bg-muted dark:text-muted-foreground dark:hover:bg-slate-800/80',
            )}
          >
            {label}
          </Badge>
        );
      })}
    </div>
  );
}
