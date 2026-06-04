import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { balanceSheetQueryOptions } from '../../queries';

function buildLink(path: string, asOf: string, branchId: string | null): string {
  const qs = new URLSearchParams();
  qs.set('as_of', asOf);
  if (branchId && branchId !== '__all') {
    qs.set('branch_id', branchId);
  }
  return `${path}?${qs.toString()}`;
}

export default function BalanceDiagnostics() {
  const { t } = useTranslation('accounting');
  const [searchParams] = useSearchParams();
  const asOf = searchParams.get('as_of') ?? '';
  const branchRaw = searchParams.get('branch_id');
  const branchId = branchRaw && branchRaw !== '__all' ? branchRaw : null;

  const applied =
    asOf.length > 0
      ? branchId != null
        ? { as_of: asOf, branch_id: Number(branchId) }
        : { as_of: asOf }
      : null;

  const { data, isLoading } = useQuery({
    ...balanceSheetQueryOptions(applied ?? { as_of: asOf || '1970-01-01' }),
    enabled: applied != null,
  });

  const imbalance = data ? Number(data.assets_minus_liabilities_equity ?? 0) : 0;
  const balanced = Math.abs(imbalance) < 0.01;

  const checklist = [
    t('bs.diagnostics.check_opening'),
    t('bs.diagnostics.check_equity'),
    t('bs.diagnostics.check_unposted'),
    t('bs.diagnostics.check_branch'),
    t('bs.diagnostics.check_period'),
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('bs.diagnostics.title')}
        actions={
          <BackButton
            to={buildLink('/accounting/balance-sheet', asOf, branchRaw ?? '__all')}
            label={t('bs.title')}
          />
        }
      />

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <>
          <div
            className={cn(
              'rounded-lg border p-4',
              balanced
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-destructive/40 bg-destructive/10',
            )}
          >
            <p className="text-sm font-medium">{t('bs.diagnostics.imbalance_heading')}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums num-latin text-destructive">
              {formatMoney(imbalance)}
            </p>
            {!balanced ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('bs.diagnostics.imbalance_hint')}</p>
            ) : (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                {t('bs.balanced')}
              </p>
            )}
          </div>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-base font-semibold">{t('bs.diagnostics.checklist_title')}</h2>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to={buildLink('/accounting/operations', asOf, branchRaw ?? '__all')}>
                {t('bs.diagnostics.action_opening')}
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/accounting/journal">{t('bs.diagnostics.action_journal')}</Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to={buildLink('/accounting/trial-balance', asOf, branchRaw ?? '__all')}>
                {t('bs.diagnostics.action_trial_balance')}
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/accounting/chart-accounts">{t('bs.diagnostics.action_coa')}</Link>
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
