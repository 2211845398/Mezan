/*
 * POS runs full-screen, deliberately outside `AdminLayout`. This file is a
 * minimal W-1 placeholder — the real POS shell (shift bar, cart, tender,
 * offline badge) is built in W-5.1 against the Epic 12 sync contracts.
 * W-2.1 will pass `<Outlet />` as children once the router lands.
 */

export type PosLayoutProps = {
  children?: React.ReactNode;
};

export function PosLayout({ children }: PosLayoutProps) {
  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

export default PosLayout;
