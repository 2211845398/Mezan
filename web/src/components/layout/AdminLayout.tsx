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
      {/* h-[100dvh] + overflow-hidden: document/body must not scroll — only sidebar nav + main scroll */}
      <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default AdminLayout;
