import type { RefinementCtx } from 'zod';

import { isValidLibyanIban, normalizeLibyanIban } from './libyanIban';
import { digitsOnlyNationalId, isValidLibyanNationalId } from './libyanNationalId';

export type EmployeeHrFieldValues = {
  identity_document_type: string;
  identity_document_number: string;
  bank_account?: string | null | undefined;
  annual_leave_entitlement_days?: string | undefined;
};

export function refineEmployeeHrFields(data: EmployeeHrFieldValues, ctx: RefinementCtx): void {
  const docType = data.identity_document_type?.trim() ?? '';
  const docNum = digitsOnlyNationalId(data.identity_document_number ?? '');
  if (docType === 'national_id' && docNum && !isValidLibyanNationalId(docNum)) {
    ctx.addIssue({
      code: 'custom',
      message: 'national_id_invalid',
      path: ['identity_document_number'],
    });
  }
  const bank = data.bank_account?.trim() ?? '';
  if (bank && !isValidLibyanIban(bank)) {
    ctx.addIssue({
      code: 'custom',
      message: 'iban_invalid',
      path: ['bank_account'],
    });
  }
  const al = data.annual_leave_entitlement_days?.trim() ?? '';
  if (al !== '' && (!/^\d+$/.test(al) || Number(al) < 0)) {
    ctx.addIssue({
      code: 'custom',
      message: 'annual_leave_invalid',
      path: ['annual_leave_entitlement_days'],
    });
  }
}

export function normalizeEmployeeHrPayload<T extends EmployeeHrFieldValues>(v: T): T {
  return {
    ...v,
    identity_document_number:
      v.identity_document_type?.trim() === 'national_id'
        ? digitsOnlyNationalId(v.identity_document_number ?? '')
        : (v.identity_document_number ?? '').trim(),
    bank_account: v.bank_account?.trim() ? normalizeLibyanIban(v.bank_account.trim()) : v.bank_account,
  };
}
