import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';

import {
  addPriceListLine,
  createPriceList,
  deletePriceListLine,
  getPriceList,
  updatePriceList,
} from '../../api';
import { catalogKeys } from '../../queries';

export default function PriceListEdit() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const listId = id && !isNew ? Number(id) : null;
  const canUpdate = usePermission('catalog', 'update');

  const { data: pl, isLoading } = useQuery({
    queryKey: catalogKeys.priceList(listId ?? 0),
    queryFn: () => getPriceList(listId!),
    enabled: listId != null,
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [name, setName] = useState('');
  const [from, setFrom] = useState(() => utcCalendarDayKey(now()));
  const [to, setTo] = useState('');
  const [active, setActive] = useState(true);
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [newPid, setNewPid] = useState('');
  const [newPrice, setNewPrice] = useState('');

  useEffect(() => {
    if (!pl) {
      return;
    }
    setName(pl.name);
    setFrom(pl.effective_from);
    setTo(pl.effective_to ?? '');
    setActive(pl.is_active);
    setBranchIds(pl.branch_ids);
  }, [pl]);

  const saveMeta = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const created = await createPriceList({
          name,
          effective_from: from,
          effective_to: to || null,
          is_active: active,
          branch_ids: branchIds,
          lines: [],
        });
        await qc.invalidateQueries({ queryKey: catalogKeys.root });
        navigate(`/catalog/price-lists/${created.id}`, { replace: true });
        return;
      }
      if (listId == null) {
        return;
      }
      await updatePriceList(listId, {
        name,
        effective_from: from,
        effective_to: to || null,
        is_active: active,
        branch_ids: branchIds,
      });
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('priceLists.save_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const addLine = useMutation({
    mutationFn: async () => {
      if (listId == null || !newPid.trim()) {
        return;
      }
      await addPriceListLine(listId, {
        product_id: Number(newPid),
        unit_price: String(Number(newPrice || 0)),
      });
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      setNewPid('');
      setNewPrice('');
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const lines = useMemo(() => pl?.lines ?? [], [pl]);

  if (!isNew && (listId == null || Number.isNaN(listId))) {
    return <p className="p-4 text-destructive">{t('errors.not_found')}</p>;
  }

  return (
    <div className="space-y-6 p-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {isNew ? t('priceLists.create') : t('priceLists.edit')}
        </h1>
        <Button type="button" variant="ghost" asChild>
          <Link to="/catalog/price-lists">{t('actions.back')}</Link>
        </Button>
      </div>
      {isLoading && !isNew ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      <div className="space-y-2">
        <Label>{t('priceLists.field.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>{t('priceLists.field.from')}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!canUpdate} />
        </div>
        <div>
          <Label>{t('priceLists.field.to')}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!canUpdate} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="price-list-active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          disabled={!canUpdate}
        />
        <Label htmlFor="price-list-active">{t('priceLists.field.active')}</Label>
      </div>
      <div>
        <Label className="mb-1 block">{t('priceLists.field.branches')}</Label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={branchIds.includes(b.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setBranchIds([...branchIds, b.id]);
                  } else {
                    setBranchIds(branchIds.filter((x) => x !== b.id));
                  }
                }}
                disabled={!canUpdate}
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>
      {canUpdate ? (
        <Button type="button" onClick={() => void saveMeta.mutate()}>
          {t('actions.save_meta')}
        </Button>
      ) : null}
      {listId != null && pl ? (
        <div className="space-y-2 border-t pt-4">
          <h2 className="text-lg font-medium">{t('priceLists.lines')}</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>{t('priceLists.line.product_id')}</Label>
              <Input value={newPid} onChange={(e) => setNewPid(e.target.value)} className="w-32" />
            </div>
            <div>
              <Label>{t('priceLists.line.unit_price')}</Label>
              <MoneyInput value={newPrice} onChange={setNewPrice} className="w-40" />
            </div>
            <Button type="button" onClick={() => void addLine.mutate()}>
              {t('actions.add_line')}
            </Button>
          </div>
          <ul className="space-y-2">
            {lines.map((ln) => (
              <li key={ln.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm">
                <span>
                  #{ln.id} product {ln.product_id} — {String(ln.unit_price)}
                </span>
                {canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await deletePriceListLine(listId, ln.id);
                        await qc.invalidateQueries({ queryKey: catalogKeys.root });
                      } catch (error) {
                        notifyApiError(error, t('errors.generic'));
                      }
                    }}
                  >
                    {t('actions.delete')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {isNew ? (
        <p className="text-sm text-muted-foreground">{t('priceLists.hint')}</p>
      ) : null}
    </div>
  );
}
