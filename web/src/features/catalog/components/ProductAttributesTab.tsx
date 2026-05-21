import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/shared/ContentSurface';

import type { VariantDraftRow } from '../api';
import type { VariantAxisLine } from '../lib/rebuildVariantAxes';
import { ProductVariantAxesEditor } from './ProductVariantAxesEditor';

type Props = {
  productId: number | null;
  productName: string;
  axes: VariantAxisLine[];
  onAxesChange: (axes: VariantAxisLine[]) => void;
  variantRows: VariantDraftRow[];
  onVariantRowsChange: (rows: VariantDraftRow[]) => void;
  disabled?: boolean | undefined;
};

export function ProductAttributesTab({
  productId,
  productName,
  axes,
  onAxesChange,
  variantRows,
  onVariantRowsChange,
  disabled,
}: Props) {
  const { t } = useTranslation('catalog');

  return (
    <SectionCard title={t('products.tabs.attributes_variants')}>
      <ProductVariantAxesEditor
        productId={productId}
        productName={productName}
        axes={axes}
        onAxesChange={onAxesChange}
        variantRows={variantRows}
        onVariantRowsChange={onVariantRowsChange}
        disabled={disabled}
      />
    </SectionCard>
  );
}
