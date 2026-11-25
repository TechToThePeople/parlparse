/**
 * Document references as the EP writes them — and as the EP writes them *about*
 * them. The labels mix en and em dashes into what should be a hyphen
 * ("A10–0008/2024 – …"), which then fails to join against `reports.reference`.
 */
const DASH = /[\u2010-\u2015\u2212]/g;

/**
 * A document reference: A10-0008/2024, RC-B10-0156/2025/REV1. The C-series
 * (C10-0263/2025, a Commission proposal) is deliberately out: the OpenAPI has no
 * record for it (`C10-0351/2025` answers 400, `C-10-2025-0351` 404), so a vote
 * citing one can never be given a text and must not sit in a queue for ever.
 */
const DOCUMENT = /^(?:RC-)?[AB]\d+-\d{1,4}\/\d{4}(?:\/REV\d+)?$/;

const cleanRef = (value) =>
  String(value ?? "")
    .replace(DASH, "-")
    .trim();

/** True when the value names a document, not "agenda week 45" or a title. */
const isDocumentRef = (value) => DOCUMENT.test(cleanRef(value));

module.exports = { cleanRef, isDocumentRef };
