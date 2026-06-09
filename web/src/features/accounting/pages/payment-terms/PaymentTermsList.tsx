import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  FloatingFormDialog,
  FloatingFormDialogFooter,
} from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';

import type { PaymentTermRead } from '../../api';
import { createPaymentTerm, updatePaymentTerm } from '../../api';
import { accountingKeys, paymentTermsQueryOptions } from '../../queries';

const PAYMENT_TERM_FORM_ID = 'accounting-payment-term-form';

function PaymentTermForm({
  existing,
  onDone,
}: {
  existing: PaymentTermRead | null;
  onDone: () => void;
}) {
  const { t } = useTranslation('accounting');
  const qc = useQueryClient();
  const [code, setCode] = useState(existing?.code ?? '');
  const [nameEn, setNameEn] = useState(existing?.name_en ?? '');
  const [nameAr, setNameAr] = useState(existing?.name_ar ?? '');
  const [days, setDays] = useState(existing ? String(existing.days) : '0');

  const save = useMutation({
    mutationFn: async () => {
      const d = Number.parseInt(days, 10);
      if (existing) {
        return updatePaymentTerm(existing.id, {
          name_en: nameEn.trim(),
          name_ar: nameAr.trim(),
          days: Number.isFinite(d) ? d : 0,
        });
      }
      return createPaymentTerm({
        code: code.trim().toUpperCase(),
        name_en: nameEn.trim(),
        name_ar: nameAr.trim(),
        days: Number.isFinite(d) ? d : 0,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountingKeys.paymentTerms() });
      toast.success(t('payment_terms.saved'));
      onDone();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <form
      id={PAYMENT_TERM_FORM_ID}
      className="flex flex-col gap-3 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {!existing ? (
        <div className="grid gap-2">
          <Label>{t('payment_terms.form.code')}</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NET_30" />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label>{t('payment_terms.form.name_en')}</Label>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('payment_terms.form.name_ar')}</Label>
        <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
      </div>
      <div className="grid gap-2">
        <Label>{t('payment_terms.form.days')}</Label>
        <Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
    </form>
  );
}

export default function PaymentTermsList() {
  const { t, i18n } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const isAr = i18n.language.startsWith('ar');
  const canUpdate = usePermission('accounting', 'update');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<PaymentTermRead | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery(paymentTermsQueryOptions(false));

  const columns = useMemo(
    () =>
      defineColumns<PaymentTermRead>()([
        { id: 'code', accessorKey: 'code', header: t('payment_terms.col.code') },
        {
          id: 'name',
          header: t('payment_terms.col.name'),
          cell: ({ row }) => (isAr ? row.original.name_ar : row.original.name_en),
        },
        { id: 'days', accessorKey: 'days', header: t('payment_terms.col.days') },
        {
          id: 'active',
          accessorKey: 'active',
          header: t('payment_terms.col.active'),
          cell: ({ row }) => (row.original.active ? t('currencies.yes') : t('currencies.no')),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(row.original);
                  setDialogKey((k) => k + 1);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
            ) : null,
        },
      ]),
    [canUpdate, isAr, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('payment_terms.title')}
        description={t('payment_terms.description')}
        actions={
          canUpdate ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setDialogKey((k) => k + 1);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t('payment_terms.add')}
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyMessage={t('payment_terms.empty')}
      />

      <FloatingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? t('payment_terms.edit') : t('payment_terms.add')}
        key={dialogKey}
        footer={
          <FloatingFormDialogFooter
            formId={PAYMENT_TERM_FORM_ID}
            onCancel={() => setDialogOpen(false)}
            saveLabel={t('payment_terms.form.save')}
            cancelLabel={tc('actions.cancel')}
          />
        }
      >
        <PaymentTermForm existing={editing} onDone={() => setDialogOpen(false)} />
      </FloatingFormDialog>
    </div>
  );
}
