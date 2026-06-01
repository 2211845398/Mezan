/** Center-aligned money columns (RTL-safe; avoids text-end pushing numbers left). */
export const accountingMoneyCell = 'block w-full text-center tabular-nums num-latin';
export const accountingMoneyHead = 'text-center';

/** Journal list: full-width cell content under column headers. */
export const journalListCellWrap = 'block w-full min-w-0';

/** Journal line grids (manual entry + detail read). */
export const journalLineHead = 'align-middle py-3 text-sm font-medium';
export const journalLineCell = 'align-middle py-3';
export const journalLineMoneyHead = `${journalLineHead} text-end`;
export const journalLineMoneyCell = `${journalLineCell} text-end tabular-nums num-latin`;
