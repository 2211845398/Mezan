import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';

import {
  cancelStockCountSession,
  downloadMyStockCountSessionPdf,
  downloadStockCountSessionPdf,
  getMyStockCountSession,
  getStockCountSession,
  patchMyStockCountLines,
  patchStockCountLines,
  postStockCountSession,
  type StockCountLineRead,
} from '../../api';
import { inventoryKeys } from '../../queries';

type LineDraft = {
  counted_qty: string;
  damaged_counted: string;
  notes: string;
};

function linesToDraft(lines: StockCountLineRead[]): Record<number, LineDraft> {
  const d: Record<number, LineDraft> = {};
  for (const ln of lines) {
    d[ln.id] = {
      counted_qty: ln.counted_qty != null ? String(ln.counted_qty) : '',
      damaged_counted: ln.damaged_counted != null ? String(ln.damaged_counted) : '',
      notes: ln.notes ?? '',
    };
  }
  return d;
}

function parseNonNegInt(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function isLineComplete(d: LineDraft): boolean {
  if (parseNonNegInt(d.counted_qty) == null) return false;
  const damagedTrimmed = d.damaged_counted.trim();
  if (damagedTrimmed === '') return true;
  return parseNonNegInt(d.damaged_counted) != null;
}

const thText =
  'align-middle px-2 py-2.5 text-start text-xs font-medium text-muted-foreground whitespace-nowrap';
const thNum =
  'align-middle px-2 py-2.5 text-end text-xs font-medium tabular-nums text-muted-foreground whitespace-nowrap';
const thInput =
  'align-middle px-2 py-2.5 text-center text-xs font-medium text-muted-foreground whitespace-nowrap';
const tdText = 'align-middle px-2 py-2.5 min-w-0';
const tdNum = 'align-middle px-2 py-2.5 text-end tabular-nums num-latin whitespace-nowrap';
const tdInput = 'align-middle px-2 py-2.5';

function QtyInputCell({
  value,
  onChange,
  invalid,
  readOnlyValue,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  readOnlyValue: number | null | undefined;
  readOnly: boolean;
}) {
  if (readOnly) {
    return (
      <span className="block text-center tabular-nums num-latin">{readOnlyValue ?? '—'}</span>
    );
  }
  return (
    <div className="mx-auto w-[5.25rem]">
      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        className={cn(
          'h-9 w-full px-2 text-center tabular-nums num-latin',
          invalid && 'ring-1 ring-destructive/40',
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function StockCountFillPage() {
  const { t, i18n } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const selfService = location.pathname.startsWith('/my-stock-count');
  const canIssue = usePermission('inventory', 'update');
  const qc = useQueryClient();
  const sessionId = Number(useParams().sessionId);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: session, isLoading, isError, refetch } = useQuery({
    queryKey: [...inventoryKeys.root, selfService ? 'my-stock-count-session' : 'stock-count-session', sessionId],
    queryFn: () =>
      selfService ? getMyStockCountSession(sessionId) : getStockCountSession(sessionId),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });

  const [draft, setDraft] = useState<Record<number, LineDraft>>({});

  const mergedDraft = useMemo(() => {
    if (!session?.lines) return draft;
    const base = linesToDraft(session.lines);
    for (const [id, val] of Object.entries(draft)) {
      base[Number(id)] = { ...base[Number(id)], ...val };
    }
    return base;
  }, [session?.lines, draft]);

  const canPost = useMemo(() => {
    if (!session?.lines.length) return false;
    return session.lines.every((ln) =>
      isLineComplete(mergedDraft[ln.id] ?? { counted_qty: '', damaged_counted: '', notes: '' }),
    );
  }, [session?.lines, mergedDraft]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('session');
      const lines = session.lines.map((ln) => {
        const d = mergedDraft[ln.id];
        const counted = d?.counted_qty?.trim();
        const damaged = d?.damaged_counted?.trim();
        return {
          id: ln.id,
          counted_qty: counted === '' || counted == null ? null : Number(counted),
          damaged_counted: damaged === '' || damaged == null ? null : Number(damaged),
          notes: d?.notes?.trim() || null,
        };
      });
      return selfService
        ? patchMyStockCountLines(sessionId, lines)
        : patchStockCountLines(sessionId, lines);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.stock_count.saved'));
      void refetch();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const pdfM = useMutation({
    mutationFn: () =>
      selfService ? downloadMyStockCountSessionPdf(sessionId) : downloadStockCountSessionPdf(sessionId),
    onSuccess: (filename) => {
      toast.success(t('movement.stock_count.exported', { filename }));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const postM = useMutation({
    mutationFn: async () => {
      await saveM.mutateAsync();
      return postStockCountSession(sessionId);
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.stock_count.posted', { count: res.movements_posted }));
      navigate(selfService ? '/my-stock-count' : '/inventory/stock-count');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: () => cancelStockCountSession(sessionId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      setCancelOpen(false);
      toast.success(t('movement.stock_count.cancelled'));
      navigate('/inventory/stock-count');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const readOnly =
    session?.status === 'posted' || session?.status === 'cancelled';
  const canCancel =
    !selfService &&
    canIssue &&
    (session?.status === 'draft' || session?.status === 'in_progress');

  const handlePost = () => {
    if (!canPost) {
      toast.error(t('movement.stock_count.post_requires_all_lines'));
      return;
    }
    void postM.mutate();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={
          session
            ? t('movement.stock_count.fill_title', { version: session.version_no })
            : t('movement.stock_count.fill')
        }
        subtitle={session ? `${session.branch_name} · ${session.responsible_name}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pdfM.isPending || !session}
              onClick={() => void pdfM.mutate()}
            >
              <FileDown className="me-1 size-4" />
              {t('movement.stock_count.download_pdf')}
            </Button>
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saveM.isPending || isLoading}
                  onClick={() => void saveM.mutate()}
                >
                  {t('movement.stock_count.save')}
                </Button>
                {!selfService ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={postM.isPending || isLoading || !canPost}
                  title={!canPost ? t('movement.stock_count.post_requires_all_lines') : undefined}
                  onClick={handlePost}
                >
                  {t('movement.stock_count.post')}
                </Button>
                ) : null}
              </>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={cancelM.isPending}
                onClick={() => setCancelOpen(true)}
              >
                {tc('actions.cancel')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(selfService ? '/my-stock-count' : '/inventory/stock-count')}
            >
              {tc('actions.back')}
            </Button>
          </div>
        }
      />

      {isLoading ? <p className="text-sm text-muted-foreground">…</p> : null}
      {isError ? (
        <p className="text-sm text-destructive">{t('errors.generic')}</p>
      ) : null}

      {session ? (
        <div className="overflow-x-auto rounded-lg border bg-card" dir={i18n.dir()}>
          <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '19%' }} />
            </colgroup>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={thText}>{t('movement.stock_count.col_product')}</th>
                <th className={thText}>{t('movement.stock_count.col_variant')}</th>
                <th className={thInput}>{t('stock.col.reference_code')}</th>
                <th className={thNum}>{t('movement.stock_count.col_on_hand')}</th>
                <th className={thNum}>{t('movement.stock_count.col_reserved')}</th>
                <th className={thInput}>{t('movement.stock_count.col_counted')}</th>
                <th className={thInput}>{t('movement.stock_count.col_damaged')}</th>
                <th className={thNum}>{t('movement.stock_count.col_variance')}</th>
                <th className={thText}>{t('movement.stock_count.col_notes')}</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map((ln) => {
                const d = mergedDraft[ln.id] ?? { counted_qty: '', damaged_counted: '', notes: '' };
                const countedNum = parseNonNegInt(d.counted_qty);
                const countedInvalid = d.counted_qty.trim() !== '' && countedNum == null;
                const countedMissing = d.counted_qty.trim() === '';
                const damagedTrimmed = d.damaged_counted.trim();
                const damagedInvalid = damagedTrimmed !== '' && parseNonNegInt(d.damaged_counted) == null;
                const variance =
                  countedNum != null ? countedNum - ln.system_on_hand : null;
                return (
                  <tr key={ln.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className={tdText}>
                      <span className="block truncate text-start" title={ln.product_name}>
                        {ln.product_name}
                      </span>
                    </td>
                    <td className={tdText}>
                      <span className="block truncate text-start" title={ln.variant_name}>
                        {ln.variant_name}
                      </span>
                    </td>
                    <td className={tdInput}>
                      <span
                        className="mx-auto block max-w-full truncate text-center num-latin tabular-nums"
                        dir="ltr"
                        title={ln.reference_code || undefined}
                      >
                        {ln.reference_code || '—'}
                      </span>
                    </td>
                    <td className={tdNum}>{ln.system_on_hand}</td>
                    <td className={tdNum}>{ln.system_reserved}</td>
                    <td className={tdInput}>
                      <QtyInputCell
                        readOnly={readOnly}
                        readOnlyValue={ln.counted_qty}
                        value={d.counted_qty}
                        invalid={countedMissing || countedInvalid}
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            [ln.id]: { ...d, counted_qty: v },
                          }))
                        }
                      />
                    </td>
                    <td className={tdInput}>
                      <QtyInputCell
                        readOnly={readOnly}
                        readOnlyValue={ln.damaged_counted}
                        value={d.damaged_counted}
                        invalid={damagedInvalid}
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            [ln.id]: { ...d, damaged_counted: v },
                          }))
                        }
                      />
                    </td>
                    <td
                      className={cn(
                        tdNum,
                        'font-medium',
                        variance != null && variance > 0 && 'text-emerald-700 dark:text-emerald-400',
                        variance != null && variance < 0 && 'text-destructive',
                      )}
                    >
                      {variance != null ? (variance > 0 ? `+${variance}` : String(variance)) : '—'}
                    </td>
                    <td className={tdText}>
                      {readOnly ? (
                        <span className="block truncate text-start" title={ln.notes || undefined}>
                          {ln.notes || '—'}
                        </span>
                      ) : (
                        <Input
                          className="h-9 w-full min-w-0"
                          value={d.notes}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [ln.id]: { ...d, notes: e.target.value },
                            }))
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('movement.stock_count.cancel_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('movement.stock_count.cancel_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelM.isPending}
              onClick={() => void cancelM.mutate()}
            >
              {cancelM.isPending ? t('movement.stock_count.cancel_pending') : t('movement.stock_count.cancel_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
