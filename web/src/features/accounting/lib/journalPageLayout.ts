import { cn } from '@/lib/utils';

/** Wide journal form/detail shell: full width, pinned to inline-start (right in RTL, left in LTR). */
export function journalPageShellClass(isRtl: boolean) {
  return cn(
    'flex w-full min-w-0 flex-col gap-6 p-6',
    'max-w-[min(100%,96rem)]',
    isRtl ? 'me-auto ms-0' : 'ms-0 me-auto',
  );
}
