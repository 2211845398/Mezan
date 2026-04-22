import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
        },
      ],
      // W-3.2: RTL-first guard. Ban physical-direction Tailwind utilities in
      // application code. The allow-list is applied via per-file overrides
      // below (shadcn primitives may carry a token during migration if
      // annotated with `// TODO(rtl)` on the same line).
      'mezan/no-physical-rtl': 'error',
      // Plan §7.3: every date parse / format flows through `lib/date.ts`.
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
    files: ['src/api/client.ts', 'src/api/interceptors/**/*.ts'],
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
    // Tests may probe physical layout explicitly.
    files: ['e2e/**', 'src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
    rules: {
      'mezan/no-physical-rtl': 'off',
    },
  },
  prettierConfig,
);
