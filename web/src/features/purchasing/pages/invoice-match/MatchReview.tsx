import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

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
import { newIdempotencyKey } from '@/lib/idempotency';

import { applyCatalogMatches, type InvoiceMatchResponse,postInvoiceMatch } from '../../api';
import { invoiceScanQueryOptions, purchasingKeys } from '../../queries';

type LineMatch = InvoiceMatchResponse['line_matches'][number];

export default function MatchReview() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ? Number(id) : NaN;
  const { t } = useTranslation('purchasing');
  const qc = useQueryClient();

  const { data: scan, refetch: refetchScan } = useQuery(invoiceScanQueryOptions(scanId));

  const [suggestions, setSuggestions] = useState<InvoiceMatchResponse | null>(null);
  /** line_no -> chosen product_id or null (skip) */
  const [choices, setChoices] = useState<Record<number, number | null>>({});

  const loadSuggestions = useMutation({
    mutationFn: () => postInvoiceMatch({ invoice_scan_id: scanId, max_candidates_per_line: 5 }),
    onSuccess: (res) => {
      setSuggestions(res);
      const init: Record<number, number | null> = {};
      for (const lm of res.line_matches) {
        init[lm.line_no] =
          lm.best_match_product_id ??
          (lm.candidates[0] ? lm.candidates[0].product_id : null);
      }
      setChoices(init);
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const approveAll = useMutation({
    mutationFn: async () => {
      const line_matches = Object.entries(choices).map(([line_no, product_id]) => ({
        line_no: Number(line_no),
        product_id,
      }));
      return applyCatalogMatches(scanId, {
        idempotency_key: newIdempotencyKey(),
        line_matches,
      });
    },
    onSuccess: async () => {
      toast.success(t('match.review_page.apply_ok'));
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      void refetchScan();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const rows: LineMatch[] = suggestions?.line_matches ?? [];

  const parsedItems = useMemo(() => {
    const payload = (scan?.override_output ?? scan?.parsed_output) as
      | { line_items?: { line_no?: number; description?: string; product_id?: number }[] }
      | undefined;
    return payload?.line_items ?? [];
  }, [scan]);

  if (Number.isNaN(scanId) || !scan) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('match.review')} #{scanId}
        </h1>
        <Button type="button" variant="outline" asChild>
          <Link to="/purchasing/invoice-match">{t('match.title')}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => loadSuggestions.mutate()} disabled={loadSuggestions.isPending}>
          {t('match.review_page.load_suggestions')}
        </Button>
        <Button
          type="button"
          onClick={() => void approveAll.mutate()}
          disabled={approveAll.isPending || !suggestions}
        >
          {t('match.review_page.approve_all')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/catalog/products" target="_blank" rel="noreferrer">
            {t('match.review_page.create_product')}
          </a>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">{t('match.review_page.parsed')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Desc</TableHead>
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
        </section>

        <section>
          <h2 className="mb-2 font-medium">{t('match.review_page.suggestions')}</h2>
          {!suggestions ? (
            <p className="text-sm text-muted-foreground">{t('match.review_page.load_suggestions')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('match.review_page.change')}</TableHead>
                  <TableHead>{t('match.review_page.confidence')}</TableHead>
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
                              choices[lm.line_no] == null
                                ? '__skip__'
                                : String(choices[lm.line_no])
                            }
                            onValueChange={(v) =>
                              setChoices((prev) => ({
                                ...prev,
                                [lm.line_no]: v === '__skip__' ? null : Number(v),
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">{t('match.review_page.skip')}</SelectItem>
                              {lm.candidates.map((c) => (
                                <SelectItem key={c.product_id} value={String(c.product_id)}>
                                  {c.product_name} ({c.product_id}) — {c.confidence.toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {lm.candidates.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {t('match.review_page.no_candidates')}
                            </span>
                          ) : null}
                          {best ? (
                            <span className="text-xs text-muted-foreground">{best.rationale}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{best ? best.confidence.toFixed(2) : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
