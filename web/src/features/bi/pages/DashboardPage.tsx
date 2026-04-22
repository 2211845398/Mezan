import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { MoneyInput } from '@/components/shared/form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { navigation, type NavItem } from '@/config/navigation';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { formatCurrency, formatNumber } from '@/lib/format';

/*
 * W-3 showcase dashboard. No backend calls yet — the numbers and rows are
 * local fixtures so reviewers can see every shared component working
 * together in both light and dark modes, RTL and LTR.
 *
 * Epic W-5.8 replaces this with real BI widgets.
 */

type DashboardRow = {
  id: string;
  supplier: string;
  status: 'paid' | 'pending' | 'overdue';
  amount: number;
};

const SHOWCASE_ROWS: readonly DashboardRow[] = [
  { id: 'INV-0001', supplier: 'ميزان للمواد الغذائية', status: 'paid', amount: 1234.5 },
  { id: 'INV-0002', supplier: 'شركة النور', status: 'pending', amount: 780 },
  { id: 'INV-0003', supplier: 'مستودعات الشرق', status: 'paid', amount: 5500.25 },
  { id: 'INV-0004', supplier: 'شركة الأمل', status: 'overdue', amount: 320 },
  { id: 'INV-0005', supplier: 'الرياض للتوريد', status: 'pending', amount: 4120.75 },
];

function flattenAccessible(
  items: NavItem[],
  has: (resource: string, action: string) => boolean,
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const accessibleChildren = flattenAccessible(item.children, has);
      out.push(...accessibleChildren);
    } else if (!item.permission) {
      out.push(item);
    } else if (has(item.permission.resource, item.permission.action)) {
      out.push(item);
    }
  }
  return out;
}

const miniFormSchema = z.object({
  amount: z.string().min(1),
});
type MiniFormValues = z.infer<typeof miniFormSchema>;

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const branchId = useAuthStore((s) => s.activeBranchId);
  const permissions = useAuthStore((s) => s.permissions);

  const accessible = useMemo(() => {
    const has = (resource: string, action: string) =>
      permissions.has(`${resource}:${action}`);
    return flattenAccessible(navigation, has);
  }, [permissions]);

  const totals = useMemo(() => {
    const paid = SHOWCASE_ROWS.filter((r) => r.status === 'paid').reduce(
      (sum, r) => sum + r.amount,
      0,
    );
    const outstanding = SHOWCASE_ROWS.filter((r) => r.status !== 'paid').reduce(
      (sum, r) => sum + r.amount,
      0,
    );
    return { paid, outstanding, count: SHOWCASE_ROWS.length };
  }, []);

  const columns = useMemo(
    () =>
      defineColumns<DashboardRow>()([
        {
          id: 'id',
          accessorKey: 'id',
          header: t('dashboard.cols.ref'),
          cell: ({ getValue }) => <span className="num-latin">{String(getValue())}</span>,
        },
        {
          id: 'supplier',
          accessorKey: 'supplier',
          header: t('dashboard.cols.supplier'),
          cell: ({ getValue }) => String(getValue()),
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('dashboard.cols.status'),
          cell: ({ getValue }) => {
            const v = String(getValue()) as DashboardRow['status'];
            const variant: 'default' | 'secondary' | 'destructive' =
              v === 'paid' ? 'secondary' : v === 'pending' ? 'default' : 'destructive';
            return <Badge variant={variant}>{t(`dashboard.status.${v}`)}</Badge>;
          },
        },
        {
          id: 'amount',
          accessorKey: 'amount',
          header: t('dashboard.cols.amount'),
          cell: ({ getValue }) => (
            <span className="text-end font-medium tabular-nums">
              {formatCurrency(Number(getValue()), 'EGP')}
            </span>
          ),
        },
      ]),
    [t],
  );

  const miniForm = useForm<MiniFormValues>({
    resolver: zodResolver(miniFormSchema),
    defaultValues: { amount: '0.00' },
  });
  const previewValue = miniForm.watch('amount');

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('auth:dashboard.hello', {
            name: user?.full_name ?? user?.email ?? t('auth:dashboard.user_fallback'),
          })}
        </h1>
        <p className="text-muted-foreground">
          {branchId === null
            ? t('auth:dashboard.no_branch')
            : t('auth:dashboard.branch', { id: branchId })}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t('dashboard.kpi.paid')}</CardDescription>
            <CardTitle className="text-3xl">
              {formatCurrency(totals.paid, 'EGP')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('dashboard.kpi.outstanding')}</CardDescription>
            <CardTitle className="text-3xl">
              {formatCurrency(totals.outstanding, 'EGP')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('dashboard.kpi.invoices')}</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(totals.count)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.latest_invoices')}</CardTitle>
            <CardDescription>{t('dashboard.showcase_body')}</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={SHOWCASE_ROWS as DashboardRow[]}
              totalRows={SHOWCASE_ROWS.length}
              mode="client"
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.mini_form')}</CardTitle>
              <CardDescription>{t('dashboard.mini_form_body')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="text-sm font-medium" htmlFor="showcase-amount">
                {t('dashboard.amount_label')}
              </label>
              <MoneyInput
                id="showcase-amount"
                currency="EGP"
                value={previewValue}
                onChange={(v) => miniForm.setValue('amount', v, { shouldDirty: true })}
              />
              <p className="text-xs text-muted-foreground">
                {t('dashboard.canonical_preview', { value: previewValue })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.chart_placeholder_title')}</CardTitle>
              <CardDescription>{t('dashboard.chart_placeholder_body')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full rounded-md border border-dashed border-border bg-muted/30" />
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('auth:dashboard.your_access')}</h2>
        {accessible.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t('auth:dashboard.no_access')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accessible.map((item) => (
              <li
                key={item.key}
                className="rounded-md border border-border p-3 text-sm hover:bg-accent"
              >
                <a href={item.href} className="flex items-center gap-3">
                  <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
