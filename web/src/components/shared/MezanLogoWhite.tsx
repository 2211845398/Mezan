import logoWhite from '@/assets/branding/logoWhite.svg';

import { cn } from '@/lib/utils';

export type MezanLogoWhiteProps = {
  className?: string;
  title?: string;
};

/** White Mezan wordmark lockup for dark / brand-coloured surfaces (auth sidebar). */
export function MezanLogoWhite({ className, title }: MezanLogoWhiteProps) {
  return (
    <img
      src={logoWhite}
      alt={title ?? ''}
      className={cn('w-full max-w-[200px]', className)}
      draggable={false}
    />
  );
}

export default MezanLogoWhite;
