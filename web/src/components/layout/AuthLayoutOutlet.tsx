import { Outlet } from 'react-router-dom';

import AuthLayout from './AuthLayout';

export default function AuthLayoutOutlet() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
