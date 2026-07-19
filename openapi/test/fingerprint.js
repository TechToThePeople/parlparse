#!/usr/bin/env node
/**
 * Fingerprint helpers for change-detection tests.
 *
 * A "fingerprint" is a stable subset of the data that captures
 * semantically meaningful fields while discarding volatile metadata
 * (timestamps, byte sizes, issued dates, etc.).
 *
 * When the API data changes (new votes, corrected counts, etc.)
 * the fingerprint changes — and the test fails.
 */

const fs = require("fs");
const path = require("path");

const FIXTURE_DIR = path.resolve(__dirname, "fixtures");
const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "data", "openapi");

/**
 * Compute a fingerprint for a roll-call vote document + its decisions.
 */
function fingerprintRcv(data) {
  if (!data || !data.meta) return null;

  const decisions = (data.decisions || []).map(normalizeRcvDecision);
  // Sort by activity_order for stable comparison
  decisions.sort((a, b) => (a.order || "").localeCompare(b.order || ""));

  return {
    type: "rcv",
    document_id: data.meta.document_id,
    date: data.meta.date,
    sitting_id: data.meta.sitting_id,
    decision_count: decisions.length,
    rollcall_count: decisions.filter(
      (d) => d.method === "VOTE_ELECTRONIC_ROLLCALL"
    ).length,
    handvote_count: decisions.filter(
      (d) => d.method !== "VOTE_ELECTRONIC_ROLLCALL"
    ).length,
    decisions,
  };
}

function normalizeRcvDecision(d) {
  return {
    order: d.activity_order || "",
    title: d.title_en || "",
    method: d.decision_method || "",
    outcome: d.decision_outcome || "",
    for: d.counts?.favor ?? null,
    against: d.counts?.against ?? null,
    abstention: d.counts?.abstention ?? null,
    attendees: d.counts?.attendees ?? null,
    voter_count: d.voters
      ? (d.voters.favor?.length || 0) +
        (d.voters.against?.length || 0) +
        (d.voters.abstention?.length || 0)
      : null,
    decided_on: (d.decided_on || []).sort(),
    responsible_group: d.responsible_group || null,
  };
}

/**
 * Compute a fingerprint for a vote-results document + parsed items.
 */
function fingerprintVot(data) {
  if (!data || !data.meta) return null;

  const items = (data.items || []).map(normalizeVotItem);

  return {
    type: "vot",
    document_id: data.meta.document_id,
    date: data.meta.date,
    item_count: items.length,
    items,
  };
}

function normalizeVotItem(item) {
  const docs = (item.documents || [])
    .map((d) => d.reference)
    .filter(Boolean)
    .sort();
  const votings = (item.votings || []).map((v) => ({
    votingId: v.votingId || "",
    type: v.type || "",
    result: v.result || "",
    title: v.title || "",
    for: v.for_count ?? null,
    against: v.against_count ?? null,
    abstention: v.abstention_count ?? null,
  }));
  return {
    dlvId: item.dlvId || "",
    title: item.title || "",
    documents: docs,
    voting_count: votings.length,
    votings,
  };
}

/**
 * Compute a fingerprint for an attendance list document.
 */
function fingerprintAtt(data) {
  if (!data || !data.meta) return null;

  const fileCount = data.files?.length || 0;
  const languages = (data.document?.is_realized_by || [])
    .map((e) => {
      const lang = e.language || "";
      return lang.split("/").pop();
    })
    .filter(Boolean)
    .sort();

  return {
    type: "att",
    document_id: data.meta.document_id,
    date: data.meta.date,
    title_en: data.meta.title_en || "",
    meeting_id: data.meta.meeting_id || "",
    language_count: languages.length,
    languages,
    file_count: fileCount,
  };
}

/**
 * Load a fingerprint fixture from disk.
 */
function loadFingerprint(type, identifier) {
  const filePath = path.join(
    FIXTURE_DIR,
    `${type}-fingerprint-${identifier}.json`
  );
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Save a fingerprint fixture to disk.
 */
function saveFingerprint(type, identifier, fingerprint) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const filePath = path.join(
    FIXTURE_DIR,
    `${type}-fingerprint-${identifier}.json`
  );
  fs.writeFileSync(
    filePath,
    JSON.stringify(fingerprint, null, 2) + "\n",
    "utf-8"
  );
  return filePath;
}

/**
 * Load a saved openapi output file from data/openapi/.
 */
function loadOutput(type, identifier) {
  const filePath = path.join(OUTPUT_DIR, type, `${identifier}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

module.exports = {
  fingerprintRcv,
  fingerprintVot,
  fingerprintAtt,
  loadFingerprint,
  saveFingerprint,
  loadOutput,
  FIXTURE_DIR,
};
