import { Outlet } from 'react-router-dom';

import PosLayout from './PosLayout';

export default function PosLayoutOutlet() {
  return (
    <PosLayout>
      <Outlet />
    </PosLayout>
  );
}
