import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
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
import { Textarea } from '@/components/ui/textarea';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';

import { getInvoiceScan, patchInvoiceScanOverride, postInvoiceScan, postValidateInvoiceScan } from '../../api';
import { inventoryKeys } from '../../queries';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

export default function ScanReview() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ? Number(id) : NaN;
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const canValidate = usePermission('invoice_scans', 'validate');
  const { data: scan, refetch } = useQuery({
    queryKey: inventoryKeys.scan(scanId),
    queryFn: () => getInvoiceScan(scanId),
    enabled: !Number.isNaN(scanId),
  });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [jsonText, setJsonText] = useState('');
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    if (!scan) {
      return;
    }
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
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('scans.override_ok'));
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'json') {
        toast.error(t('scans.json_invalid'));
      } else {
        notifyApiError(e, t('errors.generic'));
      }
    },
  });

  const validateM = useMutation({
    mutationFn: async () => {
      if (!branchId) {
        throw new Error('branch');
      }
      return postValidateInvoiceScan(scanId, { branch_id: Number(branchId) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('scans.validated'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const reupload = useMutation({
    mutationFn: async (file: File) => {
      const data = await readFileAsDataUrl(file);
      return postInvoiceScan({ source_type: 'image', data, provider: 'basic' });
    },
    onSuccess: (s) => {
      toast.success(t('scans.reuploaded'));
      window.location.href = `/inventory/scans/${s.id}`;
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  if (Number.isNaN(scanId)) {
    return <p className="p-4 text-destructive">Invalid</p>;
  }

  const imageUrl = scan?.raw_input_ref && typeof (scan.raw_input_ref as { url?: string }).url === 'string'
    ? (scan.raw_input_ref as { url: string }).url
    : null;

  return (
    <div className="grid max-w-6xl gap-6 p-4 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-semibold">
          {t('scans.review_title')} #{scanId}
        </h1>
        {imageUrl ? (
          <div className="mt-2 overflow-auto rounded border">
            <img src={imageUrl} alt="" className="max-h-[70vh] w-auto min-w-0" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('scans.no_preview')}</p>
        )}
        <div className="mt-4">
          <FileDrop
            onFile={(f) => {
              void reupload.mutate(f);
            }}
            aria-label={t('scans.reupload')}
          />
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t('scans.parsed_json')}</p>
        <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="min-h-64 font-mono text-sm" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void saveOverride.mutate()}>
            {t('scans.save_override')}
          </Button>
        </div>
        {canValidate ? (
          <div className="mt-6 space-y-2 border-t pt-4">
            <Label>{t('scans.validate_branch')}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
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
            <Button type="button" onClick={() => void validateM.mutate()}>
              {t('scans.approve_validate')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('scans.validate_gl_note')}</p>
          </div>
        ) : null}
        <div className="mt-4">
          <Button type="button" variant="link" asChild>
            <Link to="/inventory/scans">{t('actions.back')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
