/** UUID v4 for `Idempotency-Key` headers (mutations / offline replay). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
