import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CreateButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';

import { postDispatchTransfer, postReceiveTransfer, type TransferRead } from '../../api';
import { inventoryKeys, useTransfersListQuery } from '../../queries';

const BOARD_COLUMNS = [
  { key: 'draft', title: 'طلبات التسليم', hint: 'بانتظار اعتماد الإرسال', tone: 'border-amber-200 bg-amber-50/60' },
  { key: 'in_transit', title: 'في الطريق', hint: 'بانتظار استلام الفرع', tone: 'border-blue-200 bg-blue-50/60' },
  { key: 'received', title: 'تم التسليم', hint: 'مقفلة ومستلمة', tone: 'border-emerald-200 bg-emerald-50/60' },
] as const;

function columnFor(row: TransferRead): (typeof BOARD_COLUMNS)[number]['key'] {
  const status = String(row.status);
  if (['dispatched', 'in_transit'].includes(status)) return 'in_transit';
  if (['received', 'delivered', 'completed'].includes(status)) return 'received';
  return 'draft';
}

export default function TransfersList() {
  const { t } = useTranslation('inventory');
  const canUpdate = usePermission('inventory', 'update');
  const qc = useQueryClient();
  const { data: rows = [], isLoading, isError, refetch } = useTransfersListQuery({ limit: 200, offset: 0 });

  const dispatch = useMutation({
    mutationFn: postDispatchTransfer,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      notify.success('تم اعتماد خروج البضاعة');
    },
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });
  const receive = useMutation({
    mutationFn: postReceiveTransfer,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      notify.success('تم تأكيد الاستلام');
    },
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title={t('transfers.title')}
        subtitle="لوحة متابعة بثلاث مراحل تفصل اعتماد المرسل عن تأكيد المستلم."
        actions={<CreateButton to="/inventory/transfers/new" label={t('transfers.new')} visible={canUpdate} />}
      />
      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذر تحميل التحويلات.
          <Button type="button" variant="outline" size="sm" className="ms-3" onClick={() => void refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        {BOARD_COLUMNS.map((column) => {
          const cards = rows.filter((row) => columnFor(row) === column.key);
          return (
            <section key={column.key} className={cn('min-h-96 rounded-2xl border p-3', column.tone)}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{column.title}</h2>
                  <p className="text-xs text-muted-foreground">{column.hint}</p>
                </div>
                <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium">{cards.length}</span>
              </div>
              <div className="space-y-3">
                {isLoading ? <p className="text-sm text-muted-foreground">...</p> : null}
                {cards.map((row) => (
                  <article key={row.id} className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">TR-{row.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('transfers.col.from')} #{row.from_branch_id} → {t('transfers.col.to')} #{row.to_branch_id}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {row.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatIso(String(row.created_at), 'yyyy-MM-dd HH:mm')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <Link to={`/inventory/transfers/${row.id}`}>{t('actions.open')}</Link>
                      </Button>
                      {canUpdate && column.key === 'draft' ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => dispatch.mutate(row.id)}
                          disabled={dispatch.isPending}
                        >
                          اعتماد الإرسال
                        </Button>
                      ) : null}
                      {canUpdate && column.key === 'in_transit' ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => receive.mutate(row.id)}
                          disabled={receive.isPending}
                        >
                          تأكيد الاستلام
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!isLoading && !cards.length ? (
                  <div className="rounded-xl border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground">
                    لا توجد تحويلات هنا
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
