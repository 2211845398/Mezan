import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { Button } from '@/components/ui/button';

import AdhocReceiptFields from '../../components/AdhocReceiptFields';

export default function AdhocReceiptPage() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader
        title={t('movement.receipt.title')}
        subtitle={t('movement.receipt.subtitle')}
        actions={
          <Button type="button" variant="outline" onClick={() => navigate('/inventory/stock')}>
            {tc('actions.back')}
          </Button>
        }
      />
      <SectionCard title={t('movement.receipt.section')}>
        <AdhocReceiptFields onCancel={() => navigate('/inventory/stock')} />
      </SectionCard>
    </div>
  );
}
