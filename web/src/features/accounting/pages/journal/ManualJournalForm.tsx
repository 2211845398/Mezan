import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
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
import { usePermission } from '@/hooks/usePermission';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { newIdempotencyKey } from '@/lib/idempotency';

import { createManualJournal, type ManualJournalCreate } from '../../api';
import { accountingKeys } from '../../queries';
import AccountPicker from '../../components/AccountPicker';

const lineSchema = z.object({
  account_id: z.number().int().positive(),
  branch_id: z.number().int().positive(),
  debit: z.string(),
  credit: z.string(),
  memo: z.string().optional(),
});

const formSchema = z.object({
  entry_date: z.string().min(1),
  description: z.string().min(1).max(512),
  lines: z.array(lineSchema).min(2),
});

type FormV = z.infer<typeof formSchema>;

const emptyLine = (): FormV['lines'][0] => ({
  account_id: 0,
  branch_id: 0,
  debit: '0',
  credit: '0',
  memo: '',
});

export default function ManualJournalForm() {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const can = usePermission('accounting', 'create');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const form = useForm<FormV>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entry_date: new Date().toISOString().slice(0, 10),
      description: '',
      lines: [emptyLine(), emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });

  const m = useMutation({
    mutationFn: async (body: ManualJournalCreate) => {
      const key = newIdempotencyKey();
      return createManualJournal(body, key);
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('manual.saved'));
      void nav(`/accounting/journal/${r.id}`);
    },
    onError: () => toast.error(t('errors.generic')),
  });

  if (!can) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('errors.forbidden')}{' '}
        <Link className="underline" to="/accounting/journal">
          {t('journal.back')}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-3xl flex-col gap-4 p-4"
      onSubmit={form.handleSubmit((v) => {
        const lines = v.lines.map((ln) => ({
          account_id: ln.account_id,
          branch_id: ln.branch_id,
          debit: ln.debit,
          credit: ln.credit,
          memo: ln.memo || null,
        }));
        m.mutate({ entry_date: v.entry_date, description: v.description, lines });
      })}
    >
      <h1 className="text-xl font-semibold">{t('manual.title')}</h1>
      <div className="grid gap-1">
        <Label>{t('manual.entry_date')}</Label>
        <DateField
          value={form.watch('entry_date')}
          onChange={(d) => form.setValue('entry_date', d)}
        />
      </div>
      <div className="grid gap-1">
        <Label>{t('manual.description')}</Label>
        <Input {...form.register('description')} />
      </div>
      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>{t('manual.account')}</Label>
              <AccountPicker
                value={form.watch(`lines.${i}.account_id`) || null}
                onChange={(id) => form.setValue(`lines.${i}.account_id`, id ?? 0)}
              />
            </div>
            <div>
              <Label>{t('manual.branch')}</Label>
              <Select
                value={String(form.watch(`lines.${i}.branch_id`) || '')}
                onValueChange={(v) => form.setValue(`lines.${i}.branch_id`, Number(v))}
              >
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
              <Label>{t('journal.col.debit')}</Label>
              <MoneyInput
                value={form.watch(`lines.${i}.debit`)}
                onChange={(x) => form.setValue(`lines.${i}.debit`, x)}
              />
            </div>
            <div>
              <Label>{t('journal.col.credit')}</Label>
              <MoneyInput
                value={form.watch(`lines.${i}.credit`)}
                onChange={(x) => form.setValue(`lines.${i}.credit`, x)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                disabled={fields.length <= 2}
                aria-label="remove"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="md:col-span-6">
              <Label>{t('journal.line.memo')}</Label>
              <Input {...form.register(`lines.${i}.memo`)} />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(emptyLine())}
        >
          <Plus className="me-1 size-4" />
          {t('manual.add_line')}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={m.isPending}>
          {t('manual.submit')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/accounting/journal">{tc('actions.cancel')}</Link>
        </Button>
      </div>
    </form>
  );
}
