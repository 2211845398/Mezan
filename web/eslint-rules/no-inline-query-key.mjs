/** Forbid inline `queryKey: [ ... ]` arrays inside `useQuery({ ... })` outside `queries.ts` factories. */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Centralize TanStack Query keys in `features/*/queries.ts`.' },
    schema: [],
    messages: {
      inline:
        'Use a query-key factory from `queries.ts` (e.g. `productKeys.list(params)`) instead of a literal `queryKey: [...]` array.',
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    const isQueriesFile = /\/src\/features\/[^/]+\/queries\.ts$/.test(filename);

    return {
      Property(node) {
        if (isQueriesFile) return;
        const key =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal' && typeof node.key.value === 'string'
              ? node.key.value
              : null;
        if (key !== 'queryKey') return;
        if (node.value.type !== 'ArrayExpression') return;

        const source = context.sourceCode ?? context.getSourceCode();
        const ancestors = source.getAncestors(node);
        const inUseQuery = ancestors.some(
          (a) =>
            a.type === 'CallExpression' &&
            a.callee.type === 'Identifier' &&
            a.callee.name === 'useQuery',
        );
        if (!inUseQuery) return;

        context.report({ node: node.value, messageId: 'inline' });
      },
    };
  },
};

export default { rules: { 'no-inline-query-key': rule } };
