import type { Density } from './types';

export const DENSITY_ROW_CLASS: Record<Density, string> = {
  compact: 'h-8',
  normal: 'h-10',
  comfortable: 'h-14',
};

export const DENSITY_CELL_CLASS: Record<Density, string> = {
  compact: 'py-1 px-3 text-xs',
  normal: 'py-2 px-4 text-sm',
  comfortable: 'py-3 px-4 text-sm',
};
