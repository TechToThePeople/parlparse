/**
 * Document references as the EP writes them — and as the EP writes them *about*
 * them. The labels mix en and em dashes into what should be a hyphen
 * ("A10–0008/2024 – …"), which then fails to join against `reports.reference`.
 */
const DASH = /[\u2010-\u2015\u2212]/g;

/**
 * A document reference: A10-0008/2024, RC-B10-0156/2025/REV1, C10-0258/2026.
 * The C-series is a Commission proposal: the OpenAPI has no record of it
 * (`C-10-2026-0258` answers 404), but doceo publishes the document, so it is a
 * reference the passes can follow.
 */
const DOCUMENT = /^(?:RC-)?[ABC]\d+-\d{1,4}\/\d{4}(?:\/REV\d+)?$/;

const cleanRef = (value) =>
  String(value ?? "")
    .replace(DASH, "-")
    .trim();

/** True when the value names a document, not "agenda week 45" or a title. */
const isDocumentRef = (value) => DOCUMENT.test(cleanRef(value));

module.exports = { cleanRef, isDocumentRef };
