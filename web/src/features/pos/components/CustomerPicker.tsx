import { useTranslation } from 'react-i18next';

/**
 * W-5.1: attaching a customer mid-cart is not exposed in the POS cart API;
 * this is a read-only walk-in label until a dedicated customer endpoint lands.
 */
export function CustomerPicker() {
  const { t } = useTranslation('pos');
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      {t('customer.walk_in')}
    </div>
  );
}
