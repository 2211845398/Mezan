import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { createAccrualRule, updateAccrualRule } from '../../api';
import { accrualRuleQueryOptions, crmKeys } from '../../queries';

export default function AccrualRuleForm() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const location = useLocation();
  const rid = ruleId ? Number(ruleId) : NaN;
  const isEdit = Boolean(ruleId) && location.pathname.endsWith('/edit') && !Number.isNaN(rid);
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    ...accrualRuleQueryOptions(rid),
    enabled: isEdit && rid > 0,
  });
  const [name, setName] = useState('');
  const [pointsPerUnit, setPointsPerUnit] = useState('1');
  const [currencyPerPoint, setCurrencyPerPoint] = useState('10');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setPointsPerUnit(String(existing.points_per_unit));
      setCurrencyPerPoint(String(existing.currency_per_point));
      setActive(existing.is_active);
    }
  }, [existing]);

  const mCreate = useMutation({
    mutationFn: () =>
      createAccrualRule({
        name,
        points_per_unit: Number.parseInt(pointsPerUnit, 10) || 1,
        currency_per_point: currencyPerPoint,
        is_active: active,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.loyaltyRules() });
      toast.success(t('loyalty.rule.saved'));
      void nav('/crm/loyalty');
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const mUpdate = useMutation({
    mutationFn: () =>
      updateAccrualRule(rid, {
        name,
        points_per_unit: Number.parseInt(pointsPerUnit, 10) || 1,
        currency_per_point: currencyPerPoint,
        is_active: active,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.loyaltyRules() });
      toast.success(t('loyalty.rule.saved'));
      void nav('/crm/loyalty');
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error(t('loyalty.rule.name_required'));
      return;
    }
    if (isEdit) void mUpdate.mutate();
    else void mCreate.mutate();
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{isEdit ? t('loyalty.rule.edit_title') : t('loyalty.rule.new_title')}</h1>
      <div className="grid gap-1">
        <Label>{t('loyalty.rule.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('loyalty.rule.points_per_unit')}</Label>
        <Input value={pointsPerUnit} onChange={(e) => setPointsPerUnit(e.target.value)} inputMode="numeric" />
      </div>
      <div className="grid gap-1">
        <Label>{t('loyalty.rule.currency_per_point')}</Label>
        <Input value={currencyPerPoint} onChange={(e) => setCurrencyPerPoint(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="act" checked={active} onCheckedChange={setActive} />
        <Label htmlFor="act">{t('loyalty.rule.active')}</Label>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={mCreate.isPending || mUpdate.isPending} onClick={submit}>
          {tc('actions.save')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/crm/loyalty">{tc('actions.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
