import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import mezanApiV1 from './eslint-rules/no-api-v1-literal.mjs';
import mezanInlineQk from './eslint-rules/no-inline-query-key.mjs';
import mezanRtl from './eslint-rules/no-physical-rtl.mjs';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      '.vite',
      'playwright-report',
      'src/api/generated/**',
      'node_modules',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'simple-import-sort': simpleImportSort,
      mezan: mezanRtl,
      'mezan-api': mezanApiV1,
      'mezan-qk': mezanInlineQk,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message:
                "Import the configured Axios instance from '@/api/client' instead of 'axios' directly.",
            },
          ],
          patterns: [
            {
              group: ['@/test/msw/**'],
              message:
                'MSW lives under `src/test/msw/**`; import it only from tests, `src/test/setup.ts`, or `src/dev/mockApi.ts`.',
            },
          ],
        },
      ],
      // W-3.2: RTL-first guard. Ban physical-direction Tailwind utilities in
      // application code. The allow-list is applied via per-file overrides
      // below (shadcn primitives may carry a token during migration if
      // annotated with `// TODO(rtl)` on the same line).
      'mezan/no-physical-rtl': 'error',
      'mezan-api/no-api-v1-literal': 'error',
      'mezan-qk/no-inline-query-key': 'error',
      // Plan §7.3: every date parse / format flows through `lib/date.ts`.
      // W-4: `Intl` / implicit `toLocale*` banned outside `lib/format.ts` + `lib/date.ts`.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use the helpers in '@/lib/date' instead of `new Date(...)` so locale + timezone formatting stays uniform.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
          message: "Use `@/lib/format` instead of `new Intl.NumberFormat`.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message: "Use `@/lib/format` or `@/lib/date` instead of `new Intl.DateTimeFormat`.",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleString(` (implicit locale).',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleDateString(` (implicit locale).',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleTimeString(` (implicit locale).',
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "Use `@/api/client` (or `api/health.ts`) instead of `fetch` for API calls.",
        },
      ],
    },
  },
  {
    files: ['src/lib/format.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use the helpers in '@/lib/date' instead of `new Date(...)` so locale + timezone formatting stays uniform.",
        },
      ],
    },
  },
  {
    // The date facade and its own tests are the one place `new Date(` lives.
    files: ['src/lib/date.ts', 'src/lib/date.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/api/client.ts', 'src/api/interceptors/**/*.ts', 'src/api/mapError.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // shadcn copy-ins: the generator occasionally ships a `side: "left"`
    // cva variant whose name is intentionally physical. Those stay lint-
    // warnings (not errors) and are exempted per-line with `// TODO(rtl)`.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'mezan/no-physical-rtl': 'warn',
    },
  },
  {
    files: [
      'e2e/**',
      'src/dev/mockApi.ts',
      'src/test/**',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    rules: {
      'mezan/no-physical-rtl': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message:
                "Import the configured Axios instance from '@/api/client' instead of 'axios' directly.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use the helpers in '@/lib/date' instead of `new Date(...)` so locale + timezone formatting stays uniform.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
          message: "Use `@/lib/format` instead of `new Intl.NumberFormat`.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message: "Use `@/lib/format` or `@/lib/date` instead of `new Intl.DateTimeFormat`.",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleString(` (implicit locale).',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleDateString(` (implicit locale).',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']",
          message:
            'Use `@/lib/format` / `@/lib/date` instead of `.toLocaleTimeString(` (implicit locale).',
        },
      ],
    },
  },
  prettierConfig,
);
