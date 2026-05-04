import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { newIdempotencyKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';

import { postPurchaseReorder, type PurchaseReorderResponse } from '../api';

export type ReorderLineState = {
  product_id: number;
  qty: number;
  unit_cost: string;
  supplier_id?: number | null;
};

export default function PurchaseReorderAdvisor() {
  const { t } = useTranslation('ai');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [branchId, setBranchId] = useState('');
  const [lookback, setLookback] = useState(30);
  const [leadTime, setLeadTime] = useState(7);
  const [safety, setSafety] = useState(3);
  const [result, setResult] = useState<PurchaseReorderResponse | null>(null);
  const runKeyRef = useRef<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const run = useMutation({
    mutationFn: async () => {
      const key = runKeyRef.current ?? newIdempotencyKey();
      runKeyRef.current = key;
      return postPurchaseReorder(
        {
          branch_id: branchId ? Number(branchId) : null,
          lookback_days: lookback,
          lead_time_days: leadTime,
          safety_stock_days: safety,
          max_suggestions: 50,
        },
        key,
      );
    },
    onSuccess: (r) => {
      setResult(r);
      runKeyRef.current = null;
      notify.success(tc('toasts.analysis_complete'));
    },
    onError: () => {
      runKeyRef.current = null;
      toast.error(t('reorder.error'));
    },
  });

  const createPoFromSuggestion = (productId: number, qty: number) => {
    const lines: ReorderLineState[] = [{ product_id: productId, qty, unit_cost: '0' }];
    navigate('/purchasing/orders/new', { state: { reorderLines: lines } });
  };

  const createPoFromAll = () => {
    if (!result?.suggestions.length) return;
    const lines: ReorderLineState[] = result.suggestions.map((s) => {
      const line: ReorderLineState = {
        product_id: s.product_id,
        qty: s.recommended_order_qty,
        unit_cost: '0',
      };
      if (s.recommended_supplier_id != null) {
        line.supplier_id = s.recommended_supplier_id;
      }
      return line;
    });
    navigate('/purchasing/orders/new', { state: { reorderLines: lines } });
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t('reorder.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('reorder.subtitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('reorder.idempotency_note')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="br">{t('reorder.branch')}</Label>
          <select
            id="br"
            className="flex h-10 w-48 rounded-md border border-input bg-background px-3 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">{t('reorder.branch_all')}</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="lb">{t('reorder.lookback')}</Label>
          <Input
            id="lb"
            type="number"
            min={7}
            max={365}
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value) || 30)}
            className="w-24"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="lt">{t('reorder.lead_time')}</Label>
          <Input
            id="lt"
            type="number"
            min={1}
            max={180}
            value={leadTime}
            onChange={(e) => setLeadTime(Number(e.target.value) || 7)}
            className="w-24"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sf">{t('reorder.safety')}</Label>
          <Input
            id="sf"
            type="number"
            min={0}
            max={60}
            value={safety}
            onChange={(e) => setSafety(Number(e.target.value) || 0)}
            className="w-24"
          />
        </div>
        <Button
          type="button"
          onClick={() => void run.mutate()}
          disabled={run.isPending}
        >
          {t('reorder.run')}
        </Button>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t('reorder.meta', { model: result.model, at: result.generated_at })}
            </p>
            {result.suggestions.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={createPoFromAll}>
                {t('reorder.create_po_all')}
              </Button>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('reorder.col.product')}</TableHead>
                <TableHead>{t('reorder.col.qty')}</TableHead>
                <TableHead>{t('reorder.col.urgency')}</TableHead>
                <TableHead>{t('reorder.col.rationale')}</TableHead>
                <TableHead className="w-[140px]">{t('reorder.col.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.suggestions.map((s) => (
                <TableRow key={`${s.product_id}-${s.branch_id ?? 'x'}`}>
                  <TableCell>{s.product_name}</TableCell>
                  <TableCell className="tabular-nums num-latin">{s.recommended_order_qty}</TableCell>
                  <TableCell>{s.urgency}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">{s.rationale}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => createPoFromSuggestion(s.product_id, s.recommended_order_qty)}
                    >
                      {t('reorder.create_po')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reorder.empty')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
