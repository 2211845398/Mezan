import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

type RetryConfig = InternalAxiosRequestConfig & { _mezan5xxRetryCount?: number };

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

function isIdempotent(method: string | undefined): boolean {
  if (!method) return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

function computeDelayMs(attempt: number): number {
  // Exponential backoff with ±30% jitter.
  const exp = BASE_DELAY_MS * 2 ** attempt;
  const jitter = exp * 0.3 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

/**
 * Retries 5xx responses on GET/HEAD only with jittered exponential backoff,
 * up to 2 attempts. Non-idempotent methods fail fast — backend
 * Idempotency-Keys are the correct mitigation for those.
 */
export function installHandle5xx(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const status = error.response?.status;
      if (!status || status < 500 || status >= 600) {
        throw error;
      }

      const original = error.config as RetryConfig | undefined;
      if (!original || !isIdempotent(original.method)) {
        throw error;
      }

      const count = original._mezan5xxRetryCount ?? 0;
      if (count >= MAX_RETRIES) {
        throw error;
      }

      original._mezan5xxRetryCount = count + 1;
      await new Promise((resolve) => {
        setTimeout(resolve, computeDelayMs(count));
      });

      return instance.request(original);
    },
  );
}
