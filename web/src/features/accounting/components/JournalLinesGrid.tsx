import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { PostableChartAccountRead, SubledgerKind } from '../api';
import {
  balanceDiff,
  isBalanced,
  sumCredit,
  sumDebit,
} from '../lib/journalLineBalance';
import PostableAccountPicker from './PostableAccountPicker';
import SubledgerEntityPicker from './SubledgerEntityPicker';

export type JournalGridLine = {
  key: string;
  account_id: number;
  subledger_kind: SubledgerKind;
  branch_id: number;
  debit: string;
  credit: string;
  memo: string;
  customer_id: number | null;
  supplier_id: number | null;
  employee_id: number | null;
};

type BranchOption = { id: number; name: string };

type Props = {
  lines: JournalGridLine[];
  branches: BranchOption[];
  defaultBranchId: number;
  onChange: (lines: JournalGridLine[]) => void;
};

function patchLine(lines: JournalGridLine[], key: string, patch: Partial<JournalGridLine>) {
  return lines.map((ln) => (ln.key === key ? { ...ln, ...patch } : ln));
}

export default function JournalLinesGrid({ lines, branches, defaultBranchId, onChange }: Props) {
  const { t } = useTranslation('accounting');

  const addLine = () => {
    onChange([
      ...lines,
      {
        key: crypto.randomUUID(),
        account_id: 0,
        subledger_kind: 'none',
        branch_id: defaultBranchId || branches[0]?.id || 0,
        debit: '0',
        credit: '0',
        memo: '',
        customer_id: null,
        supplier_id: null,
        employee_id: null,
      },
    ]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 2) return;
    onChange(lines.filter((ln) => ln.key !== key));
  };

  const onAccountPick = (key: string, account: PostableChartAccountRead | null) => {
    onChange(
      patchLine(lines, key, {
        account_id: account?.id ?? 0,
        subledger_kind: account?.subledger_kind ?? 'none',
        customer_id: null,
        supplier_id: null,
        employee_id: null,
      }),
    );
  };

  const balanced = isBalanced(lines);
  const diff = balanceDiff(lines);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">{t('manual.account')}</TableHead>
              <TableHead className="min-w-[180px]">{t('manual.subledger.entity')}</TableHead>
              <TableHead className="min-w-[160px]">{t('journal.line.memo')}</TableHead>
              <TableHead className="min-w-[120px]">{t('manual.branch')}</TableHead>
              <TableHead className="min-w-[110px] text-end">{t('journal.col.debit')}</TableHead>
              <TableHead className="min-w-[110px] text-end">{t('journal.col.credit')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((ln) => (
              <TableRow key={ln.key}>
                <TableCell className="align-top py-2">
                  <PostableAccountPicker
                    value={ln.account_id || null}
                    onChange={(a) => onAccountPick(ln.key, a)}
                  />
                </TableCell>
                <TableCell className="align-top py-2">
                  {ln.subledger_kind !== 'none' ? (
                    <SubledgerEntityPicker
                      kind={ln.subledger_kind}
                      value={
                        ln.subledger_kind === 'customer'
                          ? ln.customer_id
                          : ln.subledger_kind === 'supplier'
                            ? ln.supplier_id
                            : ln.employee_id
                      }
                      onChange={(id) => {
                        if (ln.subledger_kind === 'customer') {
                          onChange(patchLine(lines, ln.key, { customer_id: id }));
                        } else if (ln.subledger_kind === 'supplier') {
                          onChange(patchLine(lines, ln.key, { supplier_id: id }));
                        } else {
                          onChange(patchLine(lines, ln.key, { employee_id: id }));
                        }
                      }}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top py-2">
                  <Input
                    value={ln.memo}
                    onChange={(e) =>
                      onChange(patchLine(lines, ln.key, { memo: e.target.value }))
                    }
                    className="h-9"
                  />
                </TableCell>
                <TableCell className="align-top py-2">
                  <Select
                    value={String(ln.branch_id || '')}
                    onValueChange={(v) =>
                      onChange(patchLine(lines, ln.key, { branch_id: Number(v) }))
                    }
                  >
                    <SelectTrigger className="h-9">
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
                </TableCell>
                <TableCell className="align-top py-2">
                  <MoneyInput
                    value={ln.debit}
                    onChange={(x) =>
                      onChange(
                        patchLine(lines, ln.key, {
                          debit: x,
                          credit: x !== '0' && x !== '0.00' ? '0' : ln.credit,
                        }),
                      )
                    }
                    className="h-9 text-end"
                  />
                </TableCell>
                <TableCell className="align-top py-2">
                  <MoneyInput
                    value={ln.credit}
                    onChange={(x) =>
                      onChange(
                        patchLine(lines, ln.key, {
                          credit: x,
                          debit: x !== '0' && x !== '0.00' ? '0' : ln.debit,
                        }),
                      )
                    }
                    className="h-9 text-end"
                  />
                </TableCell>
                <TableCell className="align-top py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    disabled={lines.length <= 2}
                    onClick={() => removeLine(ln.key)}
                    aria-label="remove"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-medium">
                {t('manual.totals')}
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {formatMoney(sumDebit(lines))}
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {formatMoney(sumCredit(lines))}
              </TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell colSpan={7}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {t('manual.difference')}: {formatMoney(diff)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      balanced
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {balanced ? t('journal.col.balanced') : t('tb.unbalanced')}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={addLine}>
        <Plus className="me-1 size-4" />
        {t('manual.add_line')}
      </Button>
    </div>
  );
}
