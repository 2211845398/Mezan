import { TooltipProvider } from '@/components/ui/tooltip';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

/*
 * Admin shell: sidebar + topbar + content slot. Tooltips power collapsed
 * sidebar labels (`web/docs/SHELL_CONTRACT.md`).
 */

export type AdminLayoutProps = {
  children?: React.ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-screen bg-background">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default AdminLayout;
