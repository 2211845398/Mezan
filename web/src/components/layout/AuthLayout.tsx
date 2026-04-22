import { cn } from '@/lib/utils';

/*
 * Centred card shell for sign-in / forgot / reset / onboarding screens.
 * Router wiring lands in Epic W-2 (which will pass `<Outlet />` as children);
 * today this component is intentionally standalone so we can smoke-test the
 * styles and fonts without pulling in a router.
 */

export type AuthLayoutProps = {
  logoSlot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function AuthLayout({ logoSlot, children, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12',
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
