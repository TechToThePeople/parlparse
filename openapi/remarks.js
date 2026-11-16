#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/remarks.js — turn the "Requests for …" remarks of a VOT file into
 * something that can be matched against a single voting.
 *
 * The XML mixes free text and structure. A roll-call request looks like:
 *
 *   <remarkRollCalls><RemarkRollCallSeparated>
 *     <politicalGroups><label>The Left:</label></politicalGroups>
 *     <translation>Amendments 12, 14, 15, 20; §§ 17 (2nd and 3rd parts), 20</translation>
 *
 * The split-vote remark is structured (`<items><item><title>§ 31</title>`), and
 * the separate-vote one uses the same free text as the roll-call one.
 *
 * Mentions understood: "final vote", "Amendment(s) 6, 7", "§ 5", "§§ 7, 8 (2nd
 * part)", "Recital E", "Article 29" — each optionally qualified by a list of
 * parts, in words ("second and third") or ordinals ("2nd and 3rd").
 */

const ORDINALS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "4th": 4,
  "5th": 5,
  "6th": 6,
  "7th": 7,
  "8th": 8,
  "9th": 9,
  "10th": 10,
};

/** "2nd and 3rd parts" -> [2, 3]; returns null when there is no qualifier. */
function parseParts(text) {
  const m = String(text).match(/\(([^)]*?)parts?\)/i);
  if (!m) return null;
  const parts = [];
  for (const word of m[1].toLowerCase().split(/[\s,]+/)) {
    if (ORDINALS[word]) parts.push(ORDINALS[word]);
  }
  return parts.length ? parts : null;
}

/** Split on ';' then on ',' but not inside parentheses. */
function splitChunks(text) {
  const out = [];
  let cur = "";
  let depth = 0;
  for (const ch of String(text)) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === ";" || ch === ",") && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Parse one translation string into mentions:
 *   { type: "final" }
 *   { type: "amendment", number: "6" }
 *   { type: "section", number: "17", parts: [2, 3] | null }
 *   { type: "recital", letter: "E", parts: null }
 *   { type: "article", number: "29", parts: null }
 */
function parseMentions(text) {
  const mentions = [];
  let carried = null; // "§§ 7, 8" → the 8 is a section too

  for (const chunk of splitChunks(text)) {
    const lower = chunk.toLowerCase();

    if (/^final vote$/.test(lower)) {
      mentions.push({ type: "final" });
      carried = null;
      continue;
    }

    const amendments = chunk.match(/^amendments?\s+(.*)$/i);
    if (amendments) {
      for (const n of amendments[1].split(/[\s,]+/)) {
        if (/^\d+$/.test(n)) mentions.push({ type: "amendment", number: n });
      }
      // "Amendments 6, 7, 9" arrives as several chunks: the bare numbers that
      // follow belong to this list, not to the section/article one
      carried = "amendment";
      continue;
    }

    const parts = parseParts(chunk);

    const recital = chunk.match(/^recitals?\s+([A-Z0-9]+)\b/i);
    if (recital) {
      mentions.push({
        type: "recital",
        letter: recital[1].toUpperCase(),
        parts,
      });
      carried = "recital";
      continue;
    }

    const article = chunk.match(/^articles?\s+(\d+)/i);
    if (article) {
      mentions.push({ type: "article", number: article[1], parts });
      carried = "article";
      continue;
    }

    const section = chunk.match(/^§+\s*(\d+)/);
    if (section) {
      mentions.push({ type: "section", number: section[1], parts });
      carried = "section";
      continue;
    }

    // a bare number inherits the previous kind ("§§ 7, 8 (2nd part)")
    const bare = chunk.match(/^(\d+)\b/);
    if (bare && carried) {
      if (carried === "section")
        mentions.push({ type: "section", number: bare[1], parts });
      else if (carried === "article")
        mentions.push({ type: "article", number: bare[1], parts });
      else if (carried === "amendment")
        mentions.push({ type: "amendment", number: bare[1], parts });
      else if (carried === "recital")
        mentions.push({
          type: "recital",
          letter: bare[1].toUpperCase(),
          parts,
        });
      continue;
    }
  }
  return mentions;
}

/**
 * Everything a voting could be matched on, since the remarks are inconsistent:
 * "§ 6 – Am 6" must answer both to "§§ 5, 6" and to "Amendments 6, 7", and
 * "Motion for a resolution" (no part, no amendment) is the final vote.
 *
 * Each key is { type: "section"|"recital"|"article"|"amendment"|"final",
 *               number?, letter?, parts? }.
 *
 * @param {{subject?: string, number?: string, request?: string, name?: string}} voting
 * @returns {Array<object>}
 */
function votingKeys(voting) {
  const keys = [];
  const subject = (voting.subject || "").trim();
  const partIndex = (String(voting.request || "").match(/^(\d+)\//) || [])[1];
  const parts = partIndex ? [Number(partIndex)] : null;

  let m = subject.match(/^§+\s*(\d+)/);
  if (m) keys.push({ type: "section", number: m[1], parts });

  m = subject.match(/^recitals?\s+([A-Z0-9]+)\b/i);
  if (m) keys.push({ type: "recital", letter: m[1].toUpperCase(), parts });

  m = subject.match(/^articles?\s+(\d+)/i);
  if (m) keys.push({ type: "article", number: m[1], parts });

  // amendments are usually identified in the label ("… – § 6 – Am 26")
  const am = String(voting.name || "").match(/\bAm\s*(\d+)/);
  if (am) keys.push({ type: "amendment", number: am[1], parts });
  else if (/^\d+$/.test(String(voting.number || "")))
    keys.push({ type: "amendment", number: String(voting.number), parts });

  if (
    keys.length === 0 &&
    /final vote|as a whole|ensemble du texte|motion for a resolution/i.test(
      voting.name || ""
    )
  )
    keys.push({ type: "final" });

  return keys;
}

/** Does a mention cover any of this voting's keys? */
function mentionMatches(mention, keys) {
  if (!mention || !keys || !keys.length) return false;
  return keys.some((key) => {
    if (mention.type !== key.type) return false;
    let same = false;
    if (mention.type === "final") same = true;
    else if (mention.type === "recital")
      same =
        String(mention.letter).toUpperCase() ===
        String(key.letter).toUpperCase();
    else same = mention.number === key.number;
    if (!same) return false;
    if (mention.parts && key.parts)
      return key.parts.some((p) => mention.parts.includes(p));
    return true; // "§ 5" without a part covers all parts of § 5
  });
}

module.exports = { parseMentions, votingKeys, mentionMatches, parseParts };
