import { cn } from '@/lib/utils';

type Props = {
  value: string;
  className?: string;
  title?: string;
};

/** Read-only field styled like an input (variant / unit on receive). */
export default function ReceiveLineReadonlyValue({ value, className, title }: Props) {
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center truncate rounded-md border bg-muted/40 px-3 text-sm',
        className,
      )}
      title={title ?? value}
    >
      {value || '—'}
    </div>
  );
}
