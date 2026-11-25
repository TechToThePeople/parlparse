/**
 * A converted document keeps its horizontal rules as a run of underscores —
 * the PDF/DOCX line that separates a text from its footnotes comes out as
 * `______` or, once markitdown escapes it, `\_\_\_\_\_\_`. Markdown shows that
 * as noise, so it becomes a rule.
 */
const RULE = /(?:\s*(?:\\_){3,}\s*|_{5,})/g;

function toRules(text) {
  return String(text || "")
    .replace(RULE, "\n\n---\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = { toRules };
