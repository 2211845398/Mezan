import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
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
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { ProductSearch } from '@/features/pos/components/ProductSearch';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { newIdempotencyKey } from '@/lib/idempotency';

import { addBomLine, createBom } from '../../api/production';
import { inventoryKeys } from '../../queries';

type ComponentRow = { productId: number | null; qty: string };

export default function BomFormPage() {
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.activeBranchId);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0');
  const [finishedProductId, setFinishedProductId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([{ productId: null, qty: '1' }]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!finishedProductId || !name.trim()) {
        throw new Error('missing fields');
      }
      const bom = await createBom({
        name: name.trim(),
        finished_product_id: finishedProductId,
        version: version.trim() || '1.0',
        notes: notes.trim() || null,
      });
      const branch = branchId ?? 1;
      for (const row of components) {
        if (!row.productId || !row.qty) continue;
        await addBomLine(bom.id, branch, {
          component_product_id: row.productId,
          qty_required: row.qty,
        });
      }
      return bom;
    },
    onSuccess: async (bom) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.boms() });
      toast.success(t('production.bom_created'));
      navigate(`/inventory/production/boms/${bom.id}`);
    },
    onError: (err) => notifyApiError(err, t('production.save_error')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('production.new_bom')}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory/production">{t('production.back')}</Link>
          </Button>
        }
      />

      <SectionCard title={t('production.bom_header')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <Label>{t('production.col.bom_name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>{t('production.col.version')}</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="grid gap-1 md:col-span-2">
            <Label>{t('production.col.finished_product')}</Label>
            <ProductSearch
              value={finishedProductId}
              onChange={(id) => setFinishedProductId(id)}
            />
          </div>
          <div className="grid gap-1 md:col-span-2">
            <Label>{t('production.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('production.components_section')}>
        <div className="space-y-3">
          {components.map((row, idx) => (
            <div key={idx} className="grid gap-3 md:grid-cols-[1fr_120px_40px] items-end">
              <div className="grid gap-1">
                <Label>{t('production.col.component')}</Label>
                <ProductSearch
                  value={row.productId}
                  onChange={(id) =>
                    setComponents((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, productId: id } : r)),
                    )
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>{t('production.col.qty')}</Label>
                <Input
                  value={row.qty}
                  onChange={(e) =>
                    setComponents((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={components.length <= 1}
                onClick={() => setComponents((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setComponents((prev) => [...prev, { productId: null, qty: '1' }])}
          >
            <Plus className="size-4" />
            {t('production.add_component')}
          </Button>
        </div>
      </SectionCard>

      <Button
        type="button"
        disabled={saveMut.isPending || !name.trim() || !finishedProductId}
        onClick={() => saveMut.mutate()}
      >
        {t('production.save_bom')}
      </Button>
    </div>
  );
}
