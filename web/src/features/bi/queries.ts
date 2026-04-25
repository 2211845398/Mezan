import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const biKeys = {
  root: ['bi'] as const,
  executive: (q: { period_start?: string; period_end?: string; branch_id?: number }) =>
    [...biKeys.root, 'executive-kpis', q] as const,
};

export function executiveKpisQueryOptions(args: {
  period_start?: string;
  period_end?: string;
  branch_id?: number;
}) {
  return queryOptions({
    queryKey: biKeys.executive(args),
    queryFn: () => api.getExecutiveKpis(args),
  });
}
