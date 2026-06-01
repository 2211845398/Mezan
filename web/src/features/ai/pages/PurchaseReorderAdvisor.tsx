import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { isAxiosError } from '@/api/client';
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

const FALLBACK_TOAST_CLASS =
  '!border-amber-400/70 !bg-amber-50 !text-amber-950 shadow-sm dark:!border-amber-600 dark:!bg-amber-950/40 dark:!text-amber-50';

export type ReorderLineState = {
  product_id: number;
  qty: number;
  unit_cost: string;
  supplier_id?: number | null;
};

function reorderUrgencyLabel(t: (k: string) => string, raw: string): string {
  const k = raw?.toLowerCase?.() ?? '';
  if (k === 'high' || k === 'medium' || k === 'low') {
    return t(`reorder.urgency_level.${k}`);
  }
  return raw;
}

export default function PurchaseReorderAdvisor() {
  const { t } = useTranslation('ai');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [branch, setBranch] = useState('__all');
  const [lookback, setLookback] = useState(30);
  const [leadTime, setLeadTime] = useState(7);
  const [safety, setSafety] = useState(3);
  const [result, setResult] = useState<PurchaseReorderResponse | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
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
          branch_id: branch === '__all' ? null : Number(branch),
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
      setFriendlyError(null);
      runKeyRef.current = null;
      if (r.model === 'deterministic_fallback') {
        notify.warning(t('reorder.fallback_notice_toast'), {
          id: 'purchase-reorder-fallback',
          durationMs: 9000,
          className: FALLBACK_TOAST_CLASS,
        });
      } else {
        notify.success(tc('toasts.analysis_complete'));
      }
    },
    onError: (e) => {
      setResult(null);
      runKeyRef.current = null;
      if (isAxiosError(e)) {
        const d = e.response?.data as { detail?: unknown } | undefined;
        const msg =
          typeof d?.detail === 'string'
            ? d.detail
            : Array.isArray(d?.detail)
              ? d.detail.map((x: { msg?: string }) => x.msg).join(', ')
              : t('reorder.error_generic');
        setFriendlyError(msg);
      } else {
        setFriendlyError(t('reorder.error_generic'));
      }
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

  const isFallback = result?.model === 'deterministic_fallback';
  const hasSuggestions = (result?.suggestions.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('reorder.title')}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('reorder.hint')}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('reorder.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('reorder.branch_all')}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            className="w-[120px]"
            inputMode="numeric"
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
            className="w-[120px]"
            inputMode="numeric"
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
            className="w-[120px]"
            inputMode="numeric"
          />
        </div>
        <Button type="button" onClick={() => void run.mutate()} disabled={run.isPending}>
          {t('reorder.run')}
        </Button>
      </div>

      {friendlyError ? <p className="text-sm text-destructive">{friendlyError}</p> : null}

      {result && !hasSuggestions ? (
        <p className="text-sm text-muted-foreground">{t('reorder.empty')}</p>
      ) : null}

      {result && hasSuggestions ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={createPoFromAll}>
              {t('reorder.create_po_all')}
            </Button>
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
                  <TableCell>{reorderUrgencyLabel(t, s.urgency)}</TableCell>
                  <TableCell
                    className="max-w-md text-sm text-muted-foreground"
                    dir={isFallback ? 'rtl' : 'auto'}
                  >
                    {s.rationale}
                  </TableCell>
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
        </div>
      ) : null}
    </div>
  );
}
