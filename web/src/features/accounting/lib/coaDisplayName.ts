/** Resolve bilingual CoA label for the active UI locale. */

import { COA_SEED_AR_BY_CODE } from './coaSeedArByCode';

export type CoaNameFields = {
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  code?: string;
};

export function resolveCoaDisplayName(node: CoaNameFields, locale: string): string {
  const useAr = locale.toLowerCase().startsWith('ar');
  if (useAr) {
    const ar = node.name_ar?.trim();
    if (ar) return ar;
    const code = node.code?.trim();
    if (code && COA_SEED_AR_BY_CODE[code]) {
      return COA_SEED_AR_BY_CODE[code];
    }
  } else {
    const en = node.name_en?.trim();
    if (en) return en;
  }
  return node.name;
}
