import Decimal from 'decimal.js';

export type JournalLineAmounts = { debit: string; credit: string };

export function sumDebit(lines: JournalLineAmounts[]): string {
  return lines
    .reduce((acc, ln) => acc.add(new Decimal(ln.debit || '0')), new Decimal(0))
    .toFixed(2);
}

export function sumCredit(lines: JournalLineAmounts[]): string {
  return lines
    .reduce((acc, ln) => acc.add(new Decimal(ln.credit || '0')), new Decimal(0))
    .toFixed(2);
}

export function balanceDiff(lines: JournalLineAmounts[]): string {
  return new Decimal(sumDebit(lines)).sub(sumCredit(lines)).toFixed(2);
}

export function isBalanced(lines: JournalLineAmounts[]): boolean {
  return balanceDiff(lines) === '0.00' || balanceDiff(lines) === '0';
}
