import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { SectionCard } from '@/components/shared/ContentSurface';
import { formatMoney } from '@/lib/format';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SupplierCombobox } from '@/features/purchasing/components/SupplierCombobox';
import { suppliersPickerQueryOptions } from '@/features/purchasing/queries';
import { usePermission } from '@/hooks/usePermission';
import { useQuery } from '@tanstack/react-query';

import type { InventoryPolicyRead } from '../../types';
import {
  useInventoryPolicyQuery,
  usePatchInventoryPolicyMutation,
  useStockOnHandQuery,
} from '../../queries';

const REORDER_POLICY_FORM_ID = 'inventory-reorder-policy-form';

const schema = z.object({
  reorder_point: z.coerce.number().int().min(0),
  reorder_qty: z.coerce.number().int().min(0),
  preferred_supplier_id: z.number().nullable(),
  lead_time_days: z.coerce.number().int().min(0).nullable(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

type StockSnapshot = {
  available: number;
  reserved: number;
  damaged: number;
  unit_cost: string | null;
};

function toFormValues(policy: InventoryPolicyRead | null | undefined): FormValues {
  const isDefault = policy != null && policy.is_custom_policy === false;
  return {
    reorder_point: policy?.reorder_point ?? 0,
    reorder_qty: policy?.reorder_qty ?? 0,
    preferred_supplier_id: policy?.preferred_supplier_id ?? null,
    lead_time_days: policy?.lead_time_days ?? null,
    is_active: isDefault ? true : (policy?.is_active ?? false),
  };
}

function StockSnapshotAside({
  snapshot,
  isLoading,
}: {
  snapshot: StockSnapshot | null;
  isLoading: boolean;
}) {
  const { t, i18n } = useTranslation('inventory');

  const rows = [
    { label: t('stock.col.available'), value: snapshot != null ? String(snapshot.available) : '—' },
    { label: t('stock.col.reserved'), value: snapshot != null ? String(snapshot.reserved) : '—' },
    { label: t('stock.col.damaged'), value: snapshot != null ? String(snapshot.damaged) : '—' },
    {
      label: t('stock.col.unit_cost'),
      value:
        snapshot?.unit_cost != null && snapshot.unit_cost !== ''
          ? formatMoney(snapshot.unit_cost)
          : '—',
    },
  ];

  return (
    <aside className="space-y-3 rounded-lg border bg-muted/30 p-4 lg:col-span-1">
      <h3 className="text-sm font-medium">{t('reorderPolicy.stock.title')}</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : (
        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="num-latin tabular-nums text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}

export type ReorderPolicyPanelProps = {
  branchId: number;
  productId: number;
  variantId?: number | null;
};

export function ReorderPolicyPanel({ branchId, productId, variantId = null }: ReorderPolicyPanelProps) {
  const { t, i18n } = useTranslation('inventory');
  const canUpdate = usePermission('inventory', 'update');
  const { data: policy, isLoading: policyLoading } = useInventoryPolicyQuery(branchId, productId);
  const { data: stockRows = [], isLoading: stockLoading } = useStockOnHandQuery({
    branch_id: branchId,
    ...(variantId != null ? { variant_id: variantId } : {}),
    limit: 200,
  });
  const patchMutation = usePatchInventoryPolicyMutation();

  const stockSnapshot = useMemo((): StockSnapshot | null => {
    const productRows = stockRows.filter((r) => r.product_id === productId);
    if (productRows.length === 0) return null;

    if (variantId != null) {
      const row = productRows.find((r) => r.variant_id === variantId);
      if (!row) return null;
      return {
        available: row.available,
        reserved: row.reserved,
        damaged: row.damaged,
        unit_cost: row.unit_cost,
      };
    }

    return {
      available: productRows.reduce((sum, r) => sum + r.available, 0),
      reserved: productRows.reduce((sum, r) => sum + r.reserved, 0),
      damaged: productRows.reduce((sum, r) => sum + r.damaged, 0),
      unit_cost: productRows[0]?.unit_cost ?? null,
    };
  }, [stockRows, productId, variantId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(null),
  });

  const { isEditing, fieldsEnabled, startEdit, cancelEdit, finishEdit, syncSnapshot } =
    useEditableFormMode({ form, canEdit: canUpdate });
  const textRo = (extra?: string) => readOnlyTextInputProps(fieldsEnabled, extra);
  const { data: supplierOptions = [] } = useQuery(suppliersPickerQueryOptions());
  const preferredSupplierId = form.watch('preferred_supplier_id');
  const preferredSupplierLabel = useMemo(() => {
    if (preferredSupplierId == null) return '—';
    const supplier = supplierOptions.find((row) => row.id === preferredSupplierId);
    if (!supplier) return `#${preferredSupplierId}`;
    const name = [supplier.first_name, supplier.father_name, supplier.family_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || supplier.code || `#${preferredSupplierId}`;
  }, [preferredSupplierId, supplierOptions]);

  useEffect(() => {
    if (policyLoading) return;
    const values = toFormValues(policy);
    form.reset(values);
    syncSnapshot();
  }, [policy, policyLoading, form, syncSnapshot]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await patchMutation.mutateAsync({
        branchId,
        productId,
        body: {
          reorder_point: values.reorder_point,
          reorder_qty: values.reorder_qty,
          preferred_supplier_id: values.preferred_supplier_id,
          lead_time_days: values.lead_time_days,
          is_active: values.is_active,
        },
      });
      toast.success(t('reorderPolicy.saved'));
      finishEdit();
    } catch (error) {
      notifyApiError(error);
    }
  });

  if (policyLoading) {
    return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <SectionCard title={t('reorderPolicy.title')}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StockSnapshotAside snapshot={stockSnapshot} isLoading={stockLoading} />

        <div className="lg:col-span-2">
          <FormProvider {...form}>
            <form
              id={REORDER_POLICY_FORM_ID}
              className="space-y-4"
              dir={i18n.dir()}
              onSubmit={onSubmit}
              onKeyDown={handleFormEnterSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="reorder_point">{t('reorderPolicy.field.reorder_point')}</Label>
                  <Input
                    id="reorder_point"
                    type="number"
                    min={0}
                    {...textRo()}
                    {...form.register('reorder_point')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('reorderPolicy.field.reorder_point_hint')}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reorder_qty">{t('reorderPolicy.field.reorder_qty')}</Label>
                  <Input
                    id="reorder_qty"
                    type="number"
                    min={0}
                    {...textRo()}
                    {...form.register('reorder_qty')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('reorderPolicy.field.reorder_qty_hint')}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>{t('reorderPolicy.field.preferred_supplier')}</Label>
                  {fieldsEnabled ? (
                    <SupplierCombobox
                      value={preferredSupplierId}
                      onChange={(id) =>
                        form.setValue('preferred_supplier_id', id, { shouldDirty: true })
                      }
                      allowClear
                    />
                  ) : (
                    <ReadOnlyCopyableField
                      value={preferredSupplierLabel}
                      dir={i18n.dir()}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_time_days">{t('reorderPolicy.field.lead_time_days')}</Label>
                  <Input
                    id="lead_time_days"
                    type="number"
                    min={0}
                    {...textRo()}
                    value={form.watch('lead_time_days') ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      form.setValue('lead_time_days', raw === '' ? null : Number(raw), {
                        shouldDirty: true,
                      });
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="policy_active"
                  checked={form.watch('is_active')}
                  disabled={!fieldsEnabled}
                  onCheckedChange={(v) => form.setValue('is_active', v === true, { shouldDirty: true })}
                />
                <Label htmlFor="policy_active" className="font-normal">
                  {t('reorderPolicy.field.is_active')}
                </Label>
              </div>

              {canUpdate ? (
                <DetailFormActionBar
                  formId={REORDER_POLICY_FORM_ID}
                  isEditing={isEditing}
                  isSubmitting={patchMutation.isPending}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                />
              ) : null}
            </form>
          </FormProvider>
        </div>
      </div>
    </SectionCard>
  );
}
