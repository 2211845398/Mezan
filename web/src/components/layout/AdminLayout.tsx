import Sidebar from './Sidebar';
import Topbar from './Topbar';

/*
 * Admin shell: sidebar + topbar + content slot. In W-2.1 the content slot
 * becomes a `<Outlet />` from React Router; until then App.tsx passes
 * children directly.
 */

export type AdminLayoutProps = {
  children?: React.ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex h-full min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
