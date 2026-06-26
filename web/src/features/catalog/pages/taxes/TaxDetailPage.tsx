import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { FormContainer } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import RouteLoader from '@/routes/RouteLoader';

import { listTaxDefinitions } from '../../api';
import { catalogKeys } from '../../queries';
import TaxForm, { TAX_DETAIL_FORM_ID } from './TaxForm';

export default function TaxDetailPage() {
  const { t } = useTranslation('catalog');
  const { id } = useParams();
  const taxId = Number(id);
  const navigate = useNavigate();
  const canUpdate = usePermission('catalog', 'update');
  const [isEditing, setIsEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: catalogKeys.taxDefinitions(true),
    queryFn: () => listTaxDefinitions(true),
    enabled: Number.isFinite(taxId),
  });

  const tax = rows.find((r) => r.id === taxId);

  if (!Number.isFinite(taxId)) {
    return <p className="p-4 text-destructive">{t('products.not_found')}</p>;
  }
  if (isLoading) {
    return <RouteLoader />;
  }
  if (!tax) {
    return <p className="p-4 text-destructive">{t('products.not_found')}</p>;
  }

  const secondaryActions =
    canUpdate && tax.is_active
      ? [
          {
            id: 'archive',
            label: t('taxes.archive'),
            variant: 'destructive' as const,
            onClick: () => setArchiveOpen(true),
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={tax.name}
        actions={
          <>
            <BackButton to="/catalog/taxes" label={t('taxes.title')} />
            <DetailFormActionBar
              isEditing={isEditing}
              canEdit={canUpdate}
              formId={TAX_DETAIL_FORM_ID}
              onStartEdit={() => setIsEditing(true)}
              onCancelEdit={() => setIsEditing(false)}
              secondaryActions={secondaryActions}
            />
          </>
        }
      />
      <FormContainer maxWidth="lg">
        <TaxForm
          variant="page"
          existing={tax}
          fieldsEnabled={isEditing}
          hideFooter
          formId={TAX_DETAIL_FORM_ID}
          archiveOpen={archiveOpen}
          onArchiveOpenChange={setArchiveOpen}
          onSaved={() => {
            setIsEditing(false);
          }}
          onArchived={() => navigate('/catalog/taxes')}
        />
      </FormContainer>
    </div>
  );
}
