/** Trigger a browser download from a Blob with an optional filename hint. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Parse filename from Content-Disposition when present. */
export function filenameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const match = disposition?.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}
