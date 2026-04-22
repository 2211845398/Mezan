/**
 * ESLint rule: forbid physical-direction Tailwind utilities inside string
 * literals and template literals anywhere under `web/src/**`. The project is
 * RTL-first (`<html dir="rtl">` default) and must stay symmetric across ar/en
 * without a second pass — so every directional utility must be logical.
 *
 * Banned tokens (as whole Tailwind classes):
 *   ml-*  mr-*  pl-*  pr-*  left-*  right-*  text-left  text-right
 *   rounded-l-*  rounded-r-*  border-l  border-r  border-l-*  border-r-*
 *
 * Allow-list (documented exemptions only):
 *   - `components/ui/**` — shadcn primitives may carry the odd legacy token
 *     during migration; opt in per-token by appending `// TODO(rtl)` in a
 *     comment on the same line.
 *   - `e2e/**`           — Playwright asserts visual positions, not logical.
 *   - any `*.test.{ts,tsx}` — tests may set up layouts that probe physical sides.
 *
 * The rule fires on new violations outside the allow-list, failing CI.
 */

/*
 * Class-boundary definitions:
 *   (?<![\w-])  ensures the match is not the tail of a longer Tailwind class
 *              such as `slide-in-from-right-2` or `data-[side=left]`.
 *   (?![\w-])   ensures the match is not the head of a longer class name.
 */
const PHYSICAL_TOKEN_PATTERNS = [
  /(?<![\w-])m[lr]-[\w.[\]/%-]+/g,
  /(?<![\w-])p[lr]-[\w.[\]/%-]+/g,
  /(?<![\w-])(?:left|right)-[\w.[\]/%-]+/g,
  /(?<![\w-])text-(?:left|right)(?![\w-])/g,
  /(?<![\w-])rounded-(?:l|r)(?:-[\w.[\]/%-]+)?(?![\w-])/g,
  /(?<![\w-])border-(?:l|r)(?:-[\w.[\]/%-]+)?(?![\w-])/g,
];

function findBanned(value) {
  const hits = [];
  for (const re of PHYSICAL_TOKEN_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(value)) !== null) {
      hits.push(m[0]);
    }
  }
  return hits;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow physical-direction Tailwind utilities; use logical (ms/me/ps/pe/start/end/rounded-s/rounded-e/border-s/border-e/text-start/text-end).',
    },
    schema: [],
    messages: {
      physical:
        "Physical-direction Tailwind utility '{{token}}' is not allowed in RTL-first code. Use its logical counterpart (ms-/me-/ps-/pe-/start-/end-/rounded-s-/rounded-e-/border-s/border-e/text-start/text-end).",
    },
  },
  create(context) {
    function check(node, raw) {
      const hits = findBanned(raw);
      if (hits.length === 0) return;
      // Per-line escape hatch: a `// TODO(rtl)` comment on the same line
      // flags an intentional exemption.
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      const lineComments = sourceCode
        .getAllComments()
        .filter((c) => c.loc.start.line === node.loc.start.line && /TODO\(rtl\)/.test(c.value));
      if (lineComments.length > 0) return;
      for (const token of hits) {
        context.report({ node, messageId: 'physical', data: { token } });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        if (typeof node.value?.raw === 'string') check(node, node.value.raw);
      },
    };
  },
};

export default { rules: { 'no-physical-rtl': rule } };
