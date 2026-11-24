/**
 * Review-independence rule for active specifications in `.ai/specs/` (AGENTS.md section 3, `.ai/docs/review-protocol.md`
 * section 9). Used by `scripts/check-context.mjs`; pure functions, no I/O. No dependencies.
 *
 * The front-matter field `review_independence` says how independent of the author the review of the specification was.
 * It never holds a model identifier: the repository does not record model identifiers in artifacts.
 *
 *   none               no independent review (or no trace of one)
 *   different-session  another session of the same model, fresh context
 *   different-model    another model of the same family
 *   different-family   a model of another family (recommended for `risk-high`)
 *
 * Rule:
 *  - an invalid value is an error in any specification (also a draft);
 *  - a specification with status `approved` or `in-progress` whose file name date is on or after
 *    REVIEW_INDEPENDENCE_SINCE must have a value other than `none` and a heading "Przegląd niezależny" (error);
 *  - an older one without the field only gets a warning, so the specifications that already exist do not turn CI red.
 */

// The day the rule takes effect (the date in the file name, Europe/Warsaw). Changing it changes who gets an error.
export const REVIEW_INDEPENDENCE_SINCE = '2026-11-25';
export const REVIEW_INDEPENDENCE_VALUES = ['none', 'different-session', 'different-model', 'different-family'];
const ACTIVE_STATUSES = new Set(['approved', 'in-progress']);

const FRONT_MATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const SECTION = /^#{1,6}[ \t]+Przegląd niezależny/m;

/** Value of a top-level front-matter key without a trailing `# comment` and surrounding quotes; null when absent. */
function field(frontMatter, key) {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontMatter);
  if (!m) return null;
  return m[1].replace(/\s+#.*$/, '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

/**
 * @param {string} name  file name, `YYYY-MM-DD-slug.md`
 * @param {string} text  file content (LF line endings, no BOM)
 * @returns {{ level: 'error' | 'warning', missing?: boolean, message: string }[]}
 */
export function checkReviewIndependence(name, text) {
  const fm = FRONT_MATTER.exec(text);
  if (!fm) return [];
  const status = field(fm[1], 'status');
  const value = field(fm[1], 'review_independence');
  const present = value !== null && value !== '';
  const findings = [];
  if (present && !REVIEW_INDEPENDENCE_VALUES.includes(value)) {
    findings.push({ level: 'error', message: `review_independence "${value}" is not one of: ${REVIEW_INDEPENDENCE_VALUES.join(' | ')}` });
  }
  if (!ACTIVE_STATUSES.has(status ?? '')) return findings;
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
  if (!date) return findings; // the file name itself is reported by the name check
  if (date < REVIEW_INDEPENDENCE_SINCE) {
    if (!present) findings.push({ level: 'warning', missing: true, message: `brak review_independence (specification older than ${REVIEW_INDEPENDENCE_SINCE}: warning only)` });
    return findings;
  }
  if (!present) findings.push({ level: 'error', message: `brak review_independence: a ${status} specification from ${REVIEW_INDEPENDENCE_SINCE} on needs the field (none | different-session | different-model | different-family)` });
  else if (value === 'none') findings.push({ level: 'error', message: `review_independence is "none": a ${status} specification from ${REVIEW_INDEPENDENCE_SINCE} on needs an independent review (at least different-session; write the honest level)` });
  if (!SECTION.test(text.slice(fm[0].length))) findings.push({ level: 'error', message: `a ${status} specification from ${REVIEW_INDEPENDENCE_SINCE} on needs a "Przegląd niezależny" section (heading)` });
  return findings;
}
