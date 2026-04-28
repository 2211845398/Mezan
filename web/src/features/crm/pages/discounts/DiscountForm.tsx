import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

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
import { fromISO, now, toISOStringUtc } from '@/lib/date';

import { createDiscountRule, updateDiscountRule } from '../../api';
import { crmKeys, discountDetailQueryOptions } from '../../queries';

export default function DiscountForm() {
  const { discountId } = useParams<{ discountId: string }>();
  const location = useLocation();
  const did = discountId ? Number(discountId) : NaN;
  const isEdit = Boolean(discountId) && location.pathname.endsWith('/edit') && !Number.isNaN(did);
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    ...discountDetailQueryOptions(did),
    enabled: isEdit && did > 0,
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat' | 'bogo'>('percentage');
  const [value, setValue] = useState('10');
  const [buyQty, setBuyQty] = useState('2');
  const [getQty, setGetQty] = useState('1');
  const [startDate, setStartDate] = useState(() => toISOStringUtc(now()).slice(0, 16));
  const [endDate, setEndDate] = useState('');
  const [targetProducts, setTargetProducts] = useState('');

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCode(existing.code);
      setDiscountType(existing.discount_type as 'percentage' | 'flat' | 'bogo');
      setValue(String(existing.value));
      setBuyQty(String(existing.buy_qty ?? 2));
      setGetQty(String(existing.get_qty ?? 1));
      setStartDate(existing.start_date.slice(0, 16));
      setEndDate(existing.end_date ? existing.end_date.slice(0, 16) : '');
      setTargetProducts((existing.target_product_ids ?? []).join(','));
    }
  }, [existing]);

  const parseProducts = (): number[] | null => {
    const s = targetProducts.trim();
    if (!s) return null;
    const ids = s
      .split(',')
      .map((x) => Number.parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return ids.length ? ids : null;
  };

  const mCreate = useMutation({
    mutationFn: () => {
      const base = {
        name,
        code,
        discount_type: discountType,
        value,
        start_date: toISOStringUtc(fromISO(startDate)),
        end_date: endDate ? toISOStringUtc(fromISO(endDate)) : null,
        target_product_ids: parseProducts(),
        stackable: false,
        status: 'draft' as const,
        min_order_amount: null,
        max_discount_amount: null,
        usage_limit: null,
      };
      if (discountType === 'bogo') {
        return createDiscountRule({
          ...base,
          buy_qty: Number.parseInt(buyQty, 10) || 2,
          get_qty: Number.parseInt(getQty, 10) || 1,
        });
      }
      return createDiscountRule({ ...base, buy_qty: null, get_qty: null });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('discounts.saved'));
      void nav('/crm/discounts');
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const mUpdate = useMutation({
    mutationFn: () =>
      updateDiscountRule(did, {
        name,
        code,
        discount_type: discountType,
        value,
        start_date: toISOStringUtc(fromISO(startDate)),
        end_date: endDate ? toISOStringUtc(fromISO(endDate)) : null,
        target_product_ids: parseProducts(),
        buy_qty: discountType === 'bogo' ? Number.parseInt(buyQty, 10) || null : null,
        get_qty: discountType === 'bogo' ? Number.parseInt(getQty, 10) || null : null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('discounts.saved'));
      void nav('/crm/discounts');
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const submit = () => {
    if (!name.trim() || !code.trim()) {
      toast.error(t('discounts.required'));
      return;
    }
    if (isEdit) void mUpdate.mutate();
    else void mCreate.mutate();
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{isEdit ? t('discounts.edit_title') : t('discounts.new_title')}</h1>
      <div className="grid gap-1">
        <Label>{t('discounts.col.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.col.code')}</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} />
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.col.type')}</Label>
        <Select value={discountType} onValueChange={(v) => setDiscountType(v as typeof discountType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">{t('discounts.type.percentage')}</SelectItem>
            <SelectItem value="flat">{t('discounts.type.flat')}</SelectItem>
            <SelectItem value="bogo">{t('discounts.type.bogo')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.value')}</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      {discountType === 'bogo' ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label>{t('discounts.buy_qty')}</Label>
            <Input value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>{t('discounts.get_qty')}</Label>
            <Input value={getQty} onChange={(e) => setGetQty(e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label>{t('discounts.target_products')}</Label>
        <Input
          placeholder="1,2,3"
          value={targetProducts}
          onChange={(e) => setTargetProducts(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.start')}</Label>
        <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.end')}</Label>
        <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={mCreate.isPending || mUpdate.isPending} onClick={submit}>
          {tc('actions.save')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/crm/discounts">{tc('actions.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
