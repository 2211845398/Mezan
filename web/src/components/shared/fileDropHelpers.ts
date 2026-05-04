/** Build multipart `FormData` with a single file field (and optional text fields). */
export function toFormDataWithFile(
  file: File,
  fieldName: string,
  extra?: Record<string, string>,
): FormData {
  const fd = new FormData();
  fd.append(fieldName, file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      fd.append(k, v);
    }
  }
  return fd;
}
