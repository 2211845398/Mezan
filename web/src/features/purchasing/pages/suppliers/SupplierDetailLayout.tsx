import { useQuery } from '@tanstack/react-query';
import { FileText, FolderCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';

import { PageTabNav } from '@/components/shared/PageTabNav';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { formatPersonName } from '@/lib/personName';
import RouteLoader from '@/routes/RouteLoader';

import { supplierQueryOptions } from '../../queries';

export default function SupplierDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { t } = useTranslation('purchasing');

  const { data: supplier, isLoading } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !Number.isNaN(supplierId) && supplierId > 0,
  });

  const navItems = [
    {
      to: `/purchasing/suppliers/${id}/data`,
      label: t('suppliers.tabs.data'),
      icon: FolderCog,
    },
    {
      to: `/purchasing/suppliers/${id}/statement`,
      label: t('suppliers.tabs.statement'),
      icon: FileText,
    },
  ];

  if (Number.isNaN(supplierId)) return null;

  if (isLoading || !supplier) {
    return <RouteLoader />;
  }

  const displayName = formatPersonName(
    supplier.first_name,
    supplier.father_name,
    supplier.family_name,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={displayName || supplier.code}
        subtitle={t('suppliers.statement.subtitle', { code: supplier.code })}
        actions={<BackButton to="/purchasing/suppliers" label={t('suppliers.statement.back')} />}
      />

      <PageTabNav mode="navlink" items={navItems} className="mb-0" />

      <Outlet />
    </div>
  );
}
