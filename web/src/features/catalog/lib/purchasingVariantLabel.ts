import type { ProductVariantPurchasingSearchItem } from '@/features/catalog/api';

function humanLabelsFromAttributeValues(
  attributeValues: Record<string, unknown> | null | undefined,
): string {
  if (!attributeValues) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attributeValues).sort(([a], [b]) => a.localeCompare(b))) {
    if (k === '_default') continue;
    const text = v != null ? String(v).trim() : '';
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}

export function formatPurchasingVariantOption(item: {
  display_name: string;
  sku: string;
  barcode?: string | null;
  variant_label?: string;
  attribute_values?: Record<string, unknown> | null;
}): string {
  const code = (item.barcode || item.sku || '').trim();
  const name = item.display_name.trim();
  const suffix =
    (item.variant_label ?? '').trim() ||
    humanLabelsFromAttributeValues(item.attribute_values ?? null);
  if (suffix) return `[${code}] ${name} — ${suffix}`;
  return `[${code}] ${name}`;
}

/** Variant-only label (no barcode/SKU prefix) for PO line picker when product is already chosen. */
export function formatPurchasingVariantNameLabel(item: {
  display_name: string;
  sku: string;
  variant_label?: string;
  attribute_values?: Record<string, unknown> | null;
}): string {
  const suffix =
    (item.variant_label ?? '').trim() ||
    humanLabelsFromAttributeValues(item.attribute_values ?? null);
  if (suffix) return suffix;
  const name = item.display_name.trim();
  if (name) return name;
  return (item.sku || '').trim() || '—';
}

export function purchasingVariantOptionLabel(v: ProductVariantPurchasingSearchItem): string {
  return formatPurchasingVariantOption(v);
}

export function purchasingVariantNameLabel(v: ProductVariantPurchasingSearchItem): string {
  return formatPurchasingVariantNameLabel(v);
}

function variantNamePart(item: {
  variant_label?: string;
  attribute_values?: Record<string, unknown> | null;
  display_label?: string | null;
}): string {
  const fromDisplay = (item.display_label ?? '').trim();
  if (fromDisplay) return fromDisplay;
  const fromLabel = (item.variant_label ?? '').trim();
  if (fromLabel) return fromLabel;
  return humanLabelsFromAttributeValues(item.attribute_values ?? null);
}

/** Transfer/PO picker: ``Product (Variant) - customer code`` — no barcode/SKU. */
export function formatPurchasingVariantSearchLabel(item: {
  display_name: string;
  sku: string;
  variant_label?: string;
  attribute_values?: Record<string, unknown> | null;
  reference_code?: string | null;
  display_label?: string | null;
}): string {
  const productName = item.display_name.trim() || '—';
  const variantName = variantNamePart(item);
  const ref = (item.reference_code ?? '').trim();
  let core = productName;
  if (variantName && variantName !== productName) {
    core = `${productName} (${variantName})`;
  }
  return ref ? `${core} - ${ref}` : core;
}

export function purchasingVariantSearchLabel(v: ProductVariantPurchasingSearchItem): string {
  return formatPurchasingVariantSearchLabel(v);
}

/** Goods receipt / readonly lines — same display format as search pickers. */
export function formatPurchasingVariantReceiveLabel(item: {
  display_name: string;
  sku: string;
  variant_label?: string;
  attribute_values?: Record<string, unknown> | null;
  reference_code?: string | null;
  display_label?: string | null;
}): string {
  return formatPurchasingVariantSearchLabel(item);
}

export function purchasingVariantReceiveLabel(v: ProductVariantPurchasingSearchItem): string {
  return formatPurchasingVariantReceiveLabel(v);
}
