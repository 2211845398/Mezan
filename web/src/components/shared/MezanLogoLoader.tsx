import { cn } from '@/lib/utils';

import { MezanLogo } from './MezanLogo';

export type MezanLogoLoaderProps = {
  /** Pixel size (width & height) of the logo glyph. */
  size?: number;
  /** Optional caption rendered under the logo (e.g. the app name). */
  label?: string;
  className?: string;
};

/**
 * Full-screen-friendly loading indicator: the Mezan logo stays static with a
 * gentle opacity pulse. Keyframes live in `styles/index.css`
 * (`.mezan-logo-pulse`) and are disabled under `prefers-reduced-motion`.
 */
export function MezanLogoLoader({ size = 96, label, className }: MezanLogoLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 text-primary', className)}>
      <MezanLogo size={size} className="mezan-logo-pulse" />
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );
}

export default MezanLogoLoader;
