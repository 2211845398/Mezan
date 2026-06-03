import { cn } from '@/lib/utils';

export type AuthLayoutProps = {
  logoSlot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Centred card shell for sign-in / forgot / reset / onboarding screens.
 * Matches the floating-form UI reference style:
 * - Centered white surface with rounded corners
 * - Muted background
 * - RTL-safe layout
 */
export function AuthLayout({ logoSlot, children, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-muted/40 px-4 py-12',
        className,
      )}
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        {logoSlot ? <div className="mb-6 flex justify-center">{logoSlot}</div> : null}
        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
