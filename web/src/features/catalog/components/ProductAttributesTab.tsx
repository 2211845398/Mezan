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
  const { t, i18n } = useTranslation('catalog');

  return (
    <SectionCard
      dir={i18n.dir()}
      title={t('products.tabs.attributes_variants')}
      className="w-full max-w-full overflow-hidden text-start"
      contentClassName="min-w-0 p-4 md:p-6"
    >
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
