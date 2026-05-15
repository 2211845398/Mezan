import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { FileDrop } from '@/components/shared/FileDrop';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';

import type { InvoiceMatchResponse } from '../api';
import {
  applyCatalogMatches,
  patchInvoiceScanOverride,
  postInvoiceMatch,
  postInvoiceScan,
  postValidateInvoiceScan,
} from '../api';
import { invoiceScanDetailQueryOptions,invoiceScanKeys } from '../queries';

type LineMatch = InvoiceMatchResponse['line_matches'][number];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

export default function InvoiceScanDetail() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ? Number(id) : NaN;
  const { t } = useTranslation('invoiceScans');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canValidate = usePermission('invoice_scans', 'validate');
  const canUpdate = usePermission('invoice_scans', 'update');
  const canCreate = usePermission('invoice_scans', 'create');
  const canAiMatch = usePermission('ai_advisory', 'run');
  const canLoadSuggestions = canValidate || canAiMatch;

  const { data: scan, isLoading, refetch } = useQuery(invoiceScanDetailQueryOptions(scanId));
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [jsonText, setJsonText] = useState('');
  const [branchId, setBranchId] = useState('');
  const [suggestions, setSuggestions] = useState<InvoiceMatchResponse | null>(null);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [lineConfirmed, setLineConfirmed] = useState<Record<number, boolean>>({});
  const applyIdempotencyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scan) return;
    const base = (scan.override_output ?? scan.parsed_output ?? scan.raw_output ?? {}) as object;
    setJsonText(JSON.stringify(base, null, 2));
  }, [scan]);

  const saveOverride = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        throw new Error('json');
      }
      await patchInvoiceScanOverride(scanId, { override_output: parsed });
      await refetch();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      toast.success(t('detail.override_ok'));
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'json') {
        toast.error(t('detail.json_invalid'));
      } else {
        notifyApiError(e, t('errors.generic'));
      }
    },
  });

  const validateM = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('branch');
      return postValidateInvoiceScan(scanId, { branch_id: Number(branchId) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      toast.success(t('detail.validated'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const reupload = useMutation({
    mutationFn: async (file: File) => {
      const data = await readFileAsDataUrl(file);
      return postInvoiceScan({ source_type: 'image', data, provider: 'basic' });
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      toast.success(t('detail.reuploaded'));
      navigate(`/purchasing/invoice-match/${s.id}`, { replace: true });
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const loadSuggestions = useMutation({
    mutationFn: () => postInvoiceMatch({ invoice_scan_id: scanId, max_candidates_per_line: 5 }),
    onSuccess: (res) => {
      setSuggestions(res);
      const init: Record<number, number | null> = {};
      const initConf: Record<number, boolean> = {};
      for (const lm of res.line_matches) {
        init[lm.line_no] =
          lm.best_match_product_id ?? (lm.candidates[0] ? lm.candidates[0].product_id : null);
        initConf[lm.line_no] = false;
      }
      setChoices(init);
      setLineConfirmed(initConf);
      applyIdempotencyRef.current = null;
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const approveAll = useMutation({
    mutationFn: async () => {
      if (!applyIdempotencyRef.current) {
        applyIdempotencyRef.current = newIdempotencyKey();
      }
      const idem = applyIdempotencyRef.current;
      const line_matches = Object.entries(choices).map(([line_no, product_id]) => ({
        line_no: Number(line_no),
        product_id,
      }));
      return applyCatalogMatches(scanId, {
        idempotency_key: idem,
        line_matches,
      });
    },
    onSuccess: async () => {
      applyIdempotencyRef.current = null;
      toast.success(t('detail.apply_ok'));
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const rows: LineMatch[] = suggestions?.line_matches ?? [];

  const parsedItems = useMemo(() => {
    const payload = (scan?.override_output ?? scan?.parsed_output) as
      | { line_items?: { line_no?: number; description?: string; product_id?: number }[] }
      | undefined;
    return payload?.line_items ?? [];
  }, [scan]);

  if (Number.isNaN(scanId)) {
    return <p className="p-4 text-destructive">Invalid</p>;
  }

  if (isLoading && !scan) {
    return <p className="p-4 text-muted-foreground">Loading…</p>;
  }

  if (!scan) {
    return <p className="p-4 text-destructive">{t('errors.generic')}</p>;
  }

  const imageUrl =
    scan.raw_input_ref && typeof (scan.raw_input_ref as { url?: string }).url === 'string'
      ? (scan.raw_input_ref as { url: string }).url
      : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">
          {t('detail.review_title')} #{scanId}
        </h1>
        <Button type="button" variant="outline" asChild>
          <Link to="/purchasing/invoice-match">{t('detail.back_queue')}</Link>
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('detail.section_document')}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            {imageUrl ? (
              <div className="overflow-auto rounded border">
                <img src={imageUrl} alt="" className="max-h-[70vh] w-auto min-w-0" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('detail.no_preview')}</p>
            )}
            {canCreate ? (
              <div className="mt-4">
                <FileDrop
                  onFile={(f) => void reupload.mutate(f)}
                  aria-label={t('detail.reupload')}
                  disabled={reupload.isPending}
                />
              </div>
            ) : null}
          </div>

          {canUpdate ? (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{t('detail.parsed_json')}</p>
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="min-h-64 font-mono text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void saveOverride.mutate()} disabled={saveOverride.isPending}>
                  {t('detail.save_override')}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{t('detail.parsed_json')}</p>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">{jsonText}</pre>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('detail.section_catalog')}</h2>
        {canLoadSuggestions ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => loadSuggestions.mutate()}
              disabled={loadSuggestions.isPending}
            >
              {t('detail.load_suggestions')}
            </Button>
            {canValidate ? (
              <Button
                type="button"
                onClick={() => void approveAll.mutate()}
                disabled={approveAll.isPending || !suggestions}
              >
                {t('detail.approve_all')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" asChild>
              <Link to="/catalog/products" target="_blank" rel="noreferrer">
                {t('detail.create_product')}
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-medium">{t('detail.parsed')}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('detail.desc_col')}</TableHead>
                  <TableHead>product_id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedItems.map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{it.line_no ?? idx + 1}</TableCell>
                    <TableCell>{String(it.description ?? '—')}</TableCell>
                    <TableCell>{it.product_id ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="mb-2 font-medium">{t('detail.suggestions')}</h3>
            {!suggestions ? (
              <p className="text-sm text-muted-foreground">{t('detail.load_suggestions')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t('detail.change')}</TableHead>
                    <TableHead>{t('detail.confidence')}</TableHead>
                    <TableHead>{t('detail.confirm')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((lm) => {
                    const best = lm.candidates.find((c) => c.product_id === choices[lm.line_no]);
                    return (
                      <TableRow key={lm.line_no}>
                        <TableCell>{lm.line_no}</TableCell>
                        <TableCell>
                          <div className="grid gap-1">
                            <Label className="text-xs">{lm.raw_description}</Label>
                            <Select
                              value={
                                choices[lm.line_no] == null ? '__skip__' : String(choices[lm.line_no])
                              }
                              onValueChange={(v) =>
                                setChoices((prev) => ({
                                  ...prev,
                                  [lm.line_no]: v === '__skip__' ? null : Number(v),
                                }))
                              }
                              disabled={!canValidate}
                            >
                              <SelectTrigger aria-label={`${t('detail.change')} #${lm.line_no}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">{t('detail.skip')}</SelectItem>
                                {lm.candidates.map((c) => (
                                  <SelectItem key={c.product_id} value={String(c.product_id)}>
                                    {c.product_name} ({c.product_id}) — {c.confidence.toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {lm.candidates.length === 0 ? (
                              <span className="text-xs text-muted-foreground">{t('detail.no_candidates')}</span>
                            ) : null}
                            {best ? (
                              <span className="text-xs text-muted-foreground">{best.rationale}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{best ? best.confidence.toFixed(2) : '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={lineConfirmed[lm.line_no] ? 'secondary' : 'outline'}
                              onClick={() => setLineConfirmed((prev) => ({ ...prev, [lm.line_no]: true }))}
                              disabled={!canValidate}
                            >
                              {t('detail.confirm')}
                            </Button>
                            {lineConfirmed[lm.line_no] ? (
                              <span className="text-xs text-muted-foreground" data-testid={`confirmed-${lm.line_no}`}>
                                {t('detail.line_confirmed')}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </section>

      {canValidate ? (
        <section className="space-y-2 border-t pt-6">
          <h2 className="text-lg font-medium">{t('detail.section_finalize')}</h2>
          <div className="max-w-md space-y-2">
            <Label>{t('detail.validate_branch')}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger aria-label={t('detail.validate_branch')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={() => void validateM.mutate()} disabled={validateM.isPending}>
              {t('detail.approve_validate')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('detail.validate_gl_note')}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
