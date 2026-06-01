import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  journalLineCell,
  journalLineHead,
  journalLineMoneyCell,
  journalLineMoneyHead,
} from '../lib/accountingTableClasses';
import {
  balanceDiff,
  isBalanced,
  sumCredit,
  sumDebit,
} from '../lib/journalLineBalance';
import { JournalLineBranchPicker } from './JournalLineBranchPicker';
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
    <div className="w-full min-w-0 space-y-3">
      <div className="w-full min-w-0 overflow-x-auto rounded-md border">
        <Table className="w-full min-w-[52rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className={cn(journalLineHead, 'w-[22%]')}>{t('manual.account')}</TableHead>
              <TableHead className={cn(journalLineHead, 'w-[16%]')}>
                {t('manual.subledger.entity')}
              </TableHead>
              <TableHead className={cn(journalLineHead, 'w-[18%]')}>{t('journal.line.memo')}</TableHead>
              <TableHead className={cn(journalLineHead, 'w-[14%]')}>{t('manual.branch')}</TableHead>
              <TableHead className={cn(journalLineMoneyHead, 'w-[11%]')}>
                {t('journal.col.debit')}
              </TableHead>
              <TableHead className={cn(journalLineMoneyHead, 'w-[11%]')}>
                {t('journal.col.credit')}
              </TableHead>
              <TableHead className={cn(journalLineHead, 'w-[8%]')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((ln) => (
              <TableRow key={ln.key}>
                <TableCell className={journalLineCell}>
                  <PostableAccountPicker
                    value={ln.account_id || null}
                    onChange={(a) => onAccountPick(ln.key, a)}
                  />
                </TableCell>
                <TableCell className={journalLineCell}>
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
                <TableCell className={journalLineCell}>
                  <Input
                    value={ln.memo}
                    onChange={(e) =>
                      onChange(patchLine(lines, ln.key, { memo: e.target.value }))
                    }
                    className="h-9"
                  />
                </TableCell>
                <TableCell className={journalLineCell}>
                  <JournalLineBranchPicker
                    value={ln.branch_id || null}
                    onChange={(branchId) =>
                      onChange(patchLine(lines, ln.key, { branch_id: branchId }))
                    }
                  />
                </TableCell>
                <TableCell className={journalLineMoneyCell}>
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
                <TableCell className={journalLineMoneyCell}>
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
                <TableCell className={journalLineCell}>
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
              <TableCell colSpan={4} className={cn(journalLineCell, 'font-medium')}>
                {t('manual.totals')}
              </TableCell>
              <TableCell className={cn(journalLineMoneyCell, 'font-medium')}>
                {formatMoney(sumDebit(lines))}
              </TableCell>
              <TableCell className={cn(journalLineMoneyCell, 'font-medium')}>
                {formatMoney(sumCredit(lines))}
              </TableCell>
              <TableCell className={journalLineCell} />
            </TableRow>
            <TableRow>
              <TableCell colSpan={7} className={journalLineCell}>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'border-secondary bg-background text-secondary hover:border-secondary hover:bg-secondary/10 hover:text-secondary',
        )}
        onClick={addLine}
      >
        <Plus className="me-2 size-4" />
        {t('manual.add_line')}
      </Button>
    </div>
  );
}
