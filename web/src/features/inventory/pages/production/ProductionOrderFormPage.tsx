import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { useAuthStore } from '@/features/auth/stores/authStore';

import { createProductionOrder } from '../../api/production';
import { bomsQueryOptions, inventoryKeys } from '../../queries';

export default function ProductionOrderFormPage() {
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const defaultBranch = useAuthStore((s) => s.activeBranchId);
  const [branchId, setBranchId] = useState<number | null>(defaultBranch);
  const [bomId, setBomId] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const boms = useQuery(bomsQueryOptions());

  const saveMut = useMutation({
    mutationFn: () =>
      createProductionOrder({
        bom_id: Number(bomId),
        branch_id: branchId!,
        qty_to_produce: qty,
        notes: notes.trim() || null,
      }),
    onSuccess: async (order) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.productionOrders({}) });
      toast.success(t('production.order_created'));
      navigate(`/inventory/production/orders/${order.id}`);
    },
    onError: (err) => notifyApiError(err, t('production.save_error')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('production.new_order')}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory/production">{t('production.back')}</Link>
          </Button>
        }
      />

      <SectionCard title={t('production.order_header')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <Label>{t('production.col.branch')}</Label>
            <BranchCombobox value={branchId} onChange={setBranchId} />
          </div>
          <div className="grid gap-1">
            <Label>{t('production.col.bom_name')}</Label>
            <Select value={bomId || '__none'} onValueChange={(v) => setBomId(v === '__none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('production.select_bom')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t('production.select_bom')}</SelectItem>
                {(boms.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} — {b.finished_product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>{t('production.col.qty')}</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="grid gap-1 md:col-span-2">
            <Label>{t('production.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <Button
        type="button"
        disabled={saveMut.isPending || !bomId || branchId == null}
        onClick={() => saveMut.mutate()}
      >
        {t('production.create_order')}
      </Button>
    </div>
  );
}
