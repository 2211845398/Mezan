import { z } from 'zod';

/*
 * Typed access to `import.meta.env`. Parsing runs at module load so a misspelt
 * VITE_* variable fails loudly at boot instead of silently rendering a broken
 * screen later. Only `VITE_*` names are visible to the browser — anything else
 * is filtered out by Vite before this parser ever sees it.
 */

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_ENVIRONMENT: z.enum(['dev', 'staging', 'prod']).default('dev'),
  VITE_SENTRY_DSN: z.string().optional().default(''),
  VITE_POSTHOG_KEY: z.string().optional().default(''),
  VITE_ENABLE_MOCK_API: booleanString.optional().default('false'),
  VITE_LOCALE_NUMBERS: z.enum(['ar-EG', 'ar-SA', 'en-US']).optional().default('ar-EG'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  // Fail fast at module load so a typo in an env name surfaces immediately.

  console.error('[env] Invalid VITE_* configuration:', parsed.error.flatten());
  throw new Error('Invalid environment configuration — see console for details.');
}

export const env: Env = parsed.data;
