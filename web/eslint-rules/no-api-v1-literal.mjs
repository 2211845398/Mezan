/** Disallow `/api/v1/…` string literals outside approved modules (MSW, api layer, feature api/queries typings). */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban raw `/api/v1/` URL literals outside approved paths.' },
    schema: [],
    messages: {
      disallowed:
        "Do not embed `/api/v1/` URL literals here — use `apiClient` paths (no prefix) or feature `api.ts` / `queries.ts` typing imports.",
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');

    function allowedFile() {
      if (filename.includes('src/api/generated')) return true;
      if (filename.includes('src/test/msw/')) return true;
      if (filename.includes('src/dev/')) return true;
      if (filename.startsWith('src/api/') || filename.includes('/src/api/')) return true;
      if (filename.includes('src/config/env.ts')) return true;
      if (/\/src\/features\/[^/]+\/(api|queries)\.ts$/.test(filename)) return true;
      if (/\/src\/features\/[^/]+\/(api|queries)\.tsx$/.test(filename)) return true;
      if (/\.(test|spec)\.(ts|tsx)$/.test(filename)) return true;
      if (filename.includes('/e2e/')) return true;
      return false;
    }

    function check(node, raw) {
      if (!raw.includes('/api/v1')) return;
      if (allowedFile()) return;
      context.report({ node, messageId: 'disallowed' });
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value?.cooked ?? node.value?.raw;
        if (typeof raw === 'string') check(node, raw);
      },
    };
  },
};

export default { rules: { 'no-api-v1-literal': rule } };
