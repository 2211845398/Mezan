import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
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
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';

import {
  createTransferBatch,
  getTransferBatch,
  postDispatchTransfer,
  postReceiveTransfer,
} from '../../api';
import { inventoryKeys } from '../../queries';

export default function TransferForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const isNew = !id || id === 'new';
  const batchId = id && !isNew ? Number(id) : null;

  const { data: batch, refetch } = useQuery({
    queryKey: inventoryKeys.transfer(batchId ?? 0),
    queryFn: () => getTransferBatch(batchId!),
    enabled: batchId != null && !Number.isNaN(batchId),
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [linePid, setLinePid] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lines, setLines] = useState<{ product_id: number; qty: number }[]>([]);

  const createM = useMutation({
    mutationFn: () =>
      createTransferBatch({
        from_branch_id: Number(from),
        to_branch_id: Number(to),
        lines,
      }),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.created'));
      navigate(`/inventory/transfers/${b.id}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const disp = useMutation({
    mutationFn: () => postDispatchTransfer(batchId!),
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });
  const recv = useMutation({
    mutationFn: () => postReceiveTransfer(batchId!),
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  if (isNew) {
    return (
      <div className="max-w-lg space-y-4 p-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('transfers.new')}</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('transfers.from')}</Label>
            <Select value={from} onValueChange={setFrom}>
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
          </div>
          <div>
            <Label>{t('transfers.to')}</Label>
            <Select value={to} onValueChange={setTo}>
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
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>{t('transfers.line.product_id')}</Label>
            <Input value={linePid} onChange={(e) => setLinePid(e.target.value)} className="w-28" />
          </div>
          <div>
            <Label>{t('transfers.line.qty')}</Label>
            <Input value={lineQty} onChange={(e) => setLineQty(e.target.value)} className="w-24" type="number" min={1} />
          </div>
          <Button
            type="button"
            onClick={() => {
              const p = Number(linePid);
              const q = Number(lineQty);
              if (p > 0 && q > 0) {
                setLines([...lines, { product_id: p, qty: q }]);
                setLinePid('');
              }
            }}
          >
            {t('actions.add_line')}
          </Button>
        </div>
        <ul className="text-sm">
          {lines.map((l, i) => (
            <li key={i}>
              product {l.product_id} × {l.qty}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              if (from && to && from !== to && lines.length) {
                void createM.mutate();
              }
            }}
          >
            {t('actions.create')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/inventory/transfers">{t('actions.cancel')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (batch == null) {
    return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <div className="max-w-lg space-y-4 p-4">
      <h1 className="text-2xl font-semibold">
        {t('transfers.title')} #{batch.id}
      </h1>
      <p>
        {t('transfers.col.status')}: <strong>{batch.status}</strong>
      </p>
      <p className="text-sm text-muted-foreground">
        {t('transfers.wavg_note')}
      </p>
      <ul className="text-sm">
        {(batch.lines ?? []).map((ln) => (
          <li key={ln.id}>
            product {ln.product_id} × {ln.qty}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {batch.status === 'pending_dispatch' ? (
          <Button type="button" onClick={() => void disp.mutate()}>
            {t('transfers.dispatch')}
          </Button>
        ) : null}
        {batch.status === 'in_transit' ? (
          <Button type="button" onClick={() => void recv.mutate()}>
            {t('transfers.receive')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" asChild>
          <Link to="/inventory/transfers">{t('actions.back')}</Link>
        </Button>
      </div>
    </div>
  );
}
