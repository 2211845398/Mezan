import { Outlet } from 'react-router-dom';

import AdminLayout from './AdminLayout';

/**
 * Thin router-aware wrapper around the owner-maintained `AdminLayout`.
 * Keeps `AdminLayout` router-free (so it can still be rendered in isolation
 * from Storybook or a test) while giving the data-router a pure outlet shell.
 */
export default function AdminLayoutOutlet() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
