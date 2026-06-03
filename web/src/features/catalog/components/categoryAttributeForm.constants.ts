/** Maps to API `sort_order`; lower sorts first. */
export const DISPLAY_PRIORITY_SORT = { high: 0, mid: 50, low: 100 } as const;

export type DisplayPriority = keyof typeof DISPLAY_PRIORITY_SORT;

export const CATEGORY_ATTR_PRESET_KEYS = [
  'COLOR',
  'SIZE',
  'EXPIRATION_DATE',
  'WEIGHT',
  'VOLUME',
  'LENGTH',
  'WIDTH',
  'CAPACITY',
] as const;

export type CategoryAttrPresetKey = (typeof CATEGORY_ATTR_PRESET_KEYS)[number];

type PresetSpec = {
  key: CategoryAttrPresetKey;
  /** Default field type when adding this property */
  type: 'text' | 'float' | 'date' | 'select';
};

export const CATEGORY_ATTR_PRESETS: readonly PresetSpec[] = [
  { key: 'COLOR', type: 'text' },
  { key: 'SIZE', type: 'select' },
  { key: 'EXPIRATION_DATE', type: 'date' },
  { key: 'WEIGHT', type: 'float' },
  { key: 'VOLUME', type: 'float' },
  { key: 'LENGTH', type: 'float' },
  { key: 'WIDTH', type: 'float' },
  { key: 'CAPACITY', type: 'float' },
];

export function sortOrderToPriority(sortOrder: number): DisplayPriority {
  if (sortOrder <= 25) return 'high';
  if (sortOrder <= 75) return 'mid';
  return 'low';
}
