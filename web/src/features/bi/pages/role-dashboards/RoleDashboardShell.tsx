import type { ReactNode } from 'react';

import { PageHeader } from '@/components/shared/PageHeader';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function RoleDashboardShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeader title={title} {...(subtitle != null && subtitle !== '' ? { subtitle } : {})} actions={actions} />
      {children}
    </div>
  );
}
