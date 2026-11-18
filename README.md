# parlparse

Parses the European Parliament's plenary votes into the static files that
[mepwatch](https://mepwatch.eu) (`../10`) serves. The database
(`data/term10.db`) is only an intermediate store — everything the site shows is
generated from CSVs.

Two sources feed the database:

| source | work types | gives | scripts |
|---|---|---|---|
| EP Open Data API `https://data.europarl.europa.eu/api/v2` | `VOTE_ROLLCALL_PLENARY` (RCV), `VOTE_RESULTS_PLENARY` (VOT), `MINUTES_PLENARY` (MIN), plus `/meetings/MTG-PL-<date>/decisions` | **every** vote of a sitting (roll-call, hand, electronic) with counts, method, requesting group, outcome; per-MEP arrays only for roll-calls | `openapi/*.js` |
| EP RCV XML (`PV-10-<date>-RCV_EN.xml`) | — | per-MEP positions (`positions`), roll-call subset only | `positions.js`, `lib/rollcall.js` |

The minutes documents (`MIN`) contain no vote data — they only say "see also
'Results of votes'". Use VOT/decisions for numbers.

## Quick start

```bash
npm install
npm run db:migrate      # schema + data migrations (sqlite: data/term10.db)
npm run update          # full update for yesterday + today, then publish
```

`npm run db:migrate:status` shows applied/pending migrations; knexfiles target
`./data/term10.db` (put `DB=live` in front to use the postgres connection from
`config/database.js`).

## What `npm run update` does

`update.sh`, in this order (order matters — `csv.js` reads what the earlier
steps write):

1. `npm run db:migrate` — schema first: `openapi/decisions.js` writes
   `method`/`vote_type`/`requested_by`, `csv.js` reads `reports.creator`.
2. `node openapi/decisions.js -d-1` / `-d0` — all decisions of yesterday and today
   from the API, upserted into `rollcalls` by EP voting id.
3. `node positions.js -d -u` / `-d-1 -u` — per-MEP `positions` from the RCV XML
   (`doceo` is behind the EP's WAF, so the download falls back to the same XML on
   `data.europarl.europa.eu/distribution/doc/PV-10-<date>-RCV_en.xml`).
4. `node report.js` then `node openapi/report-creator.js` — report rows, then the
   committee(s) or political group(s) behind each one.
5. `node csv.js`, `node cards.js`, `npm run majority:csv` — the static files.
6. `sh prod.sh` — publish to `../10/data` (fails loudly on an empty CSV, and
   swaps each file atomically).

One-off backfills, not part of the daily run:

```bash
node openapi/decisions.js --all              # all vote-result dates (116), ~4 min
node openapi/decisions.js --all --no-rollcall # hand/electronic only, leaves RCV rows alone
node openapi/report-creator.js             # committees/groups for all 655 reports
```

## openapi/ scripts

| script | writes |
| --- | --- |
| `openapi/decisions.js <date> \| --all` | `rollcalls` (all vote methods, counts, `vote_type`, `requested_by`) |
| `openapi/vot.js [<date> \| --all]` | `votes` + `votings` (from the VOT documents) |
| `openapi/rcv.js [<id> \| <date>]` | `data/openapi/rcv/*.json` |
| `openapi/att.js [<id> \| <date>]` | `data/openapi/att/*.json` |
| `openapi/report-creator.js [--dry]` | `reports.creator` |
| `openapi/vot-xml.js [<date> \| --all]` | `rollcalls.ref`, `name`, `committee` (and `doc_ref` for the individual motions of a resolution) from the VOT XML |
| `openapi/reports-backfill.js [--dry]` | creates the missing `reports` rows for the references `rollcalls.ref` points at |

See `openapi/README.md` for endpoints and `openapi/SQL.md` for the schema.

## Database

SQLite at `data/term10.db`, managed with knex (`migrations/`, `knexfile.js`).
`plenaries`, `rollcalls`, `meps` and `positions` predate the migrations (they
came from the Strapi CMS), so migrations only add columns and derived tables —
they cannot build a fresh database from scratch.

Vocabulary worth knowing:

- `rollcalls.method` — `RCV` (roll-call), `HAND`, `ELECTRONIC`, `SECRET`. NULL
  used to mean "unknown"; the `backfill_rollcall_method` migration set those to
  `RCV`. `''` means the API reported a decision without a method.
- `rollcalls.requested_by` is also the marker for "this date has been imported
  by `openapi/decisions.js`" — `method` cannot be used for that any more, since the
  backfill labelled every legacy row.
- `rollcalls.ref` — the document voted on. Some votes have none in the source,
  so `openapi/vot-xml.js` gives them a virtual reference and creates the
  matching `reports` row: the annual budget amendments become `budget-<year>`
  (title: the budget's own block title), and procedural votes about the sitting
  itself (agenda requests, urgent decisions, adjournments, approvals without
  vote) become `agenda-<YYYY-MM-DD>` (title: "Agenda of the sitting of …").
  Per **day**, not per month: a month can hold several part-sessions.
- `rollcalls.requested_by` — who asked for the vote, comma-separated
  (`The Left`, `PfE, ECR`). `openapi/vot-xml.js` fills it from the "Requests for
  roll-call / separate / split votes" remarks of the VOT XML; rows the remarks
  don't cover keep whatever the decisions API reported
  (`responsible_organization_label`, which for amendments is really the author).
- `reports.creator` — comma-separated, deduplicated (`ENVI`, `ECON, BUDG`, or the
  tabling groups). Group codes from the API are mapped to the names
  `meps.eugroup` uses (`PPE` → `EPP`, `S-D` → `S&D`, `VERTS-ALE` → `Greens/EFA`,
  `PFE` → `PfE`, …).
- `groupmajority` is derived from `positions` by `sql/updatemajority.sql`
  (upsert on `(eugroup, rollcall)`; it never deletes rows).

## the files ../10 reads (format contract)

`prod.sh` copies six of these into `../10/data/`.

| file | written by | columns |
| --- | --- | --- |
| `data/meps.csv` | `csv.js` | `epid,firstname,lastname,active,start,end,birthdate,country,gender,eugroup,party,email,twitter,term,voteid` |
| `data/item_rollcall.csv` | `csv.js` | `identifier,date,report,desc,title,for,against,abstention,no_show,excused,requested_by,outcome,committee,method,doc_ref,vote_request,split_requested_by,requested_source,text` |
| `data/text_tabled.csv` | `csv.js` | `date,reference,type,title,rapporteur,committee,intra,oeil,doc` |
| `data/cordon.csv` | `sql/cordon.sql` | `rollcall,date,far_right_epp_position,report_title,reference,name,for,against,abstention,epp_cohesion` |
| `data/cordon-report.csv` | `sql/cordon-report.sql` | `votes_together,reference,report_title` |
| `data/cordon-total.csv` | `sql/cordon-total.sql` | `votes_in_common,total_votes,pct_of_total` (single row) |
| `../10/data/explanation.json` | hand-written (`data/explanation.json`) | one text per vote type (`HAND`, `ELECTRONIC`, `SECRET`, `default`), shown by `vote.html` when a vote has no per-MEP record |
| `../10/cards/<id>.json` + `.csv` | `cards.js` | metadata card per vote (`rollcalls.*` + `reports.title/url`, so it carries `method`, `outcome`, `committee`, `requested_by`) and its per-MEP positions. Every run refreshes the JSON of every card; the CSV is only written for `method='RCV'` rows and only rebuilt with `--force` (or when missing) |
| `data/mep_rollcall.csv` | `rollcall.js` | `mepid,mep,result,group,identifier` (per-MEP votes; gzipped before pushing, not in `prod.sh`) |

Formats the site relies on:

- **Missing values are empty strings**, never `NULL`/`null` — `../10` does
  `+d.for || ""` and treats the empty string as "no data".
- **`identifier` / `rollcall` are `rollcalls.id`**, the EP voting id (also
  `positions.mep_vote` side is `meps.vote_id`). Not a sequence number.
- **Dates**: `item_rollcall.date` and `cordon.date` are `YYYY-MM-DD HH:MM:SS`
  (the site slices the first 10 chars); `meps.start` / `meps.end` are plain
  dates and often empty.
- **Counts** (`for`, `against`, `abstention`, `no_show`, `excused`,
  `epp_cohesion`, `votes_together`) are integers with no thousands separator;
  `cordon-total.pct_of_total` is a percentage with one decimal.
- **`item_rollcall.report` joins `text_tabled.reference`** (e.g. `B10-0007/2024`,
  `A10-0264/2026`). Vote titles keep the EP typography: `–` dashes, `§`
  paragraphs, `Am N` amendment numbers.
- **`text_tabled.committee`** holds either the committee acronyms (`ENVI`,
  `ECON, BUDG`) or, for motions tabled by groups, the groups in the same names
  `meps.eugroup` uses (`ECR, Renew, S&D, EPP`). The header stays `committee`
  because `../10` reads `docs[...].committee`; in the database the column is
  `reports.creator` (filled by `openapi/report-creator.js`).
- **`text_tabled.oeil`** is an HTML-escaped URL as copied from the source
  (`&amp;` instead of `&`) — the site does not unescape it.
- **`meps.country`** is lowercase ISO-3166 alpha-2 (`hu`, `fr`), `term` is `10`,
  `eugroup` is the group short name (`PPE`, `S&D`, `PfE`, …).
- **`item_rollcall.vote_request`** is the EP's own marker for how the vote was
  requested: `RCV`, `EV` (electronic), `sep` (separate vote), `split`, or
  `<n>/RCV` / `<n>/EV` for the n-th part of a split vote.
- **`item_rollcall.text`** is the `rollcall_texts.kind` of the vote's text
  (`amendment`, `summary`, `quoted`, …), empty when the detail page has none —
  `votes.html` marks those rows with a `¶`.
- **`item_rollcall.split_requested_by`** names the group(s) that asked for the
  split (`ECR`, `PPE, PfE`), from the XML's "Requests for split votes" remark.
  Not displayed: on all 2,326 rows it is a subset of `requested_by`, which is
  shown as "asked by …" under the date.
- **`item_rollcall.requested_source`** says where `requested_by` came from:
  `remarks` (a group really asked for this vote — the site shows "asked by X")
  or `api` (the decisions API's `responsible_organization_label`, i.e. who
  tabled the amendment, `original text` for the committee's own wording — the
  site shows "tabled by X"). `vote_request` alone cannot be used for that: 995
  rows carry a roll-call marker *and* the API's author value, because no remark
  covers that item.
- **`item_rollcall.doc_ref`** is the specific document a vote is about when it
  is not the report itself: for the individual motions of a joint resolution
  (`B10-0496/2026`) the row's `report` points at the joint motion
  (`RC-B10-0497/2026`) and `doc_ref` at the tabled one. Shown under the
  reference on the site.
- **`item_rollcall.method`** is `RCV`, `HAND`, `ELECTRONIC` or `SECRET`; the site
  counts it for the "% transparent" tab. Empty for the 21 decisions the API
  published without a method.
- **`item_rollcall.committee`** is the EP acronym (`ENVI`, `ENVI, SANT` for
  joint), never the full name. Empty when the vote item's VOT document is
  missing for that date.
- **`item_rollcall.outcome`** is `ADOPTED` / `REJECTED` / `LAPSED` / `WITHDRAWN`.
  For hand votes it is the *only* result — the EP publishes no counts for them,
  so `for`/`against`/`abstention` are empty and the site shows the outcome there.
- **`item_rollcall.requested_by`** is the normalised `rollcalls.requested_by`
  (the group(s) that requested the roll-call, e.g. `The Left`, `ECR, PfE`,
  `original text`), empty for votes imported only from the RCV XML. The site
  shows it under the vote date.
- **`cordon.far_right_epp_position`** is one of `for` / `against` / `abstention`;
  `epp_cohesion` is 0–100.

## AI summaries (`ai/oeil.js`)

Fetches a report, converts it to markdown and asks DeepSeek for a citizen-facing
summary. Key from `DEEPSEEK_API_KEY` (environment or `.env` in the repo root).

```bash
node ai/oeil.js A10-0275/2026        # one report
node ai/oeil.js --all                # every A / B / RC report
node ai/oeil.js --all --limit 5      # trial run
node ai/oeil.js --all --dry          # fetch + convert only, no API call
```

- document: the DOCX from the Open Data distribution (PDF as fallback, `doceo`
  is WAF-blocked), converted with `markitdown` → `data/content/oeil/<ref>.md`
- summary: `deepseek-flash` (DeepSeek-V4.1-Flash, their cheapest — 1M token
  context, thinking mode switched off since its reasoning is billed as output),
  one paragraph of 60–90 words + 3 bullets, or a chunk/map-reduce pass for a
  report over ~600k characters → `data/content/summary/<ref>.md`
- no front-matter in either file: reference, title, distribution, source and
  token counts are printed to the console instead, so the markdown stays plain;
- `ai/split.js` fills the votes on a paragraph (`§ 19`), a recital (`Recital U`)
  or a citation (`Citation 9`) from that markdown, deterministically: the
  numbered items after the resolution heading, the `X. whereas` run, and the
  N-th "having regard to" bullet;
- the prompt tells the model to ignore the committee's own votes, the list of
  members who voted and the procedural references — how the text was adopted,
  not what it changes;
- the run prints tokens used and an estimated cost; `401`/`402` abort, other
  errors skip the document. Existing files are kept unless `--force`.

## Where the text of a vote comes from (`rollcall_texts`)

One row per vote (`rollcall` = `rollcalls.id`), with `kind` saying what the text
is and `source` saying where it was found. 5,159 of the 14,117 votes have one:

| kind | source | votes | rule |
|---|---|---|---|
| `quoted` | `vot-xml` | 1,601 | split vote, the part's wording as the EP gives it: `<partValue>` starts with a quote |
| `without-words` | `vot-xml` | 652 | split described as `Text as a whole without the words: …` — a description, not the wording |
| `other` | `vot-xml` | 590 | other split wording, e.g. `those words` (the complement half) |
| `summary` | `summary` | 1,710 | the vote is on a whole text, so the AI summary of that document is the text |
| `paragraph` | `markdown` | 317 | vote named `§ 19` → paragraph 19 of the resolution |
| `recital` | `markdown` | 240 | vote named `Recital U` → the `U. whereas …` item |
| `citation` | `markdown` | 49 | vote named `Citation 9` → the 9th `– having regard to …` item |

### The rules, exactly

**Which votes are candidates.** Names are first stripped of a leading dash
(`– § 6` → `§ 6`). `openapi/vot-xml.js` takes the split parts; the
AI summary attaches to two different things; `ai/split.js` only looks at votes
whose name matches one of:

```
§ N              /^§\s*(\d{1,3})$/            → paragraph N
Recital X        /^Recital\s+([A-Z]|\d{1,3})$/i → the X. whereas item
Citation N       /^Citation\s+(\d{1,3})$/i     → the N-th having-regard-to item
```

Anything else is left alone — `Article N`, `§ 19/2` (already a split part),
`§ 100, point ix`, `Am 26` — and counted in the run summary.

**Split parts (`vot-xml`).** The part number is the leading digits of the `rcv`
marker (`1`, `2`, `2/RCV`, `3/EV`). The wording comes from the same vote item's
`<remarkSplitVote>`: items are matched to the vote by `amendmentSubject`
(case-insensitive), the part by its position. `kind` is decided by the value
itself: starts with a quote → `quoted`; `Text as a whole without/with the words`
→ `without-words`/`with-words`; anything else → `other`.

**Summaries (`ai/oeil.js`).** Written after the model summarises a document, and
attached by two rules:

- report: the votes whose `ref` is that report **and** either `vote_type = main`
  or a name matching
  `ensemble du texte | as a whole | motion for a resolution | proposition de
  résolution | proposals? for (a )?decisions? | proposition de la commission |
  commission proposal | projet de décision | draft council decision | projet du
  conseil | draft legislative act | approval without vote` (the EP names the whole
  text in a dozen ways, and `vote_type` is `procedural` for many of them);
- motion: the votes whose `doc_ref` is that motion's reference (a motion is its
  own document, so the name test does not apply).

**Amendments (`ai/amendments.js`).** Two sources, indexed per report as
`number → {article, text}`:

1. the report's own markdown (`data/content/oeil/<ref>.md`) — the committee
   amendments sit in it, e.g. 366 for `A10-0271/2026`;
2. the amendment **range documents** listed on the report's doceo page
   (`A-10-YYYY-NNNN-AM-340-346_EN.docx`, fetched through the WAF browser and
   converted with markitdown) — the amendments tabled in plenary.

A table row's amendment is the **last** column: the first is empty for new text,
so dropping empty cells shifts every amendment into it. The number comes from
`rollcalls.amendment_number` — the VOT XML's own list (`4= 7=` identical
amendments voted together, `274D` a variant, `9-14` a range), which is more
reliable than the name: 139 votes spell the variant `S` where the XML says `D`,
and a name holds at most two of them. The name is the fallback.

A vote that stays without text is not retried for ever: `rollcalls.amendment_attempts` counts the
runs it survived (three, then it drops out of the queue), a report whose page lists no amendment
document at all is parked at once as `amendment_status = 'unavailable'`, and a vote that needs a
human is parked by hand — the end of the run prints the query for both:

```sql
SELECT id, ref, name, amendment_number FROM rollcalls
 WHERE amendment_status IS NULL AND amendment_attempts >= 3;
UPDATE rollcalls SET amendment_status = 'manual' WHERE id = 199981;
```

doceo throttles a burst with a 200 that carries no content; a page under 20 KB
is retried three times with a fresh WAF token, and the run leaves a second
between reports. A page that stays empty is a *blocked* report, not a report
without amendments — it is counted as such and its votes are left untouched. When
three reports in a row come back empty the run clears the token, prints
`⛔ doceo is blocking us (WAF): pausing 15 minutes` and sleeps before continuing,
because retrying inside a block only deepens it. To resume where a throttled run stopped, run it in batches —
votes that already have text are skipped:

```sh
for i in $(seq 1 10); do node ai/amendments.js --limit 60; sleep 600; done
```

`--cached` re-parses what is already in `data/content/amendments/` and touches the
network not at all — the way to redo the texts after a parser fix:

```sh
node ai/amendments.js --cached
```

**Paragraphs (`ai/split.js`).** The resolution's paragraphs are the `1, 2, 3 …`
run **after the first body heading**, where the body heading is

```
MOTION FOR (A )?(EUROPEAN PARLIAMENT )?RESOLUTION | PROPOSITION DE RÉSOLUTION |
DRAFT (EUROPEAN PARLIAMENT )?(LEGISLATIVE )?RESOLUTION | PROJET DE (RÉSOLUTION|DÉCISION)
```

Items whose text starts with `whereas` are recitals, not paragraphs, and lines
matching `ELI:`, `[↑]`, `OJ C,` or starting with `OJ ` are footnotes — both
skipped. The run stops at the first gap, because budget and discharge reports
append committee opinions that restart their own numbering. If the run finds
nothing, a number that occurs **exactly once in the whole document** is used
instead (28 of the 317 paragraphs come from that fallback).

**Recitals (`ai/split.js`).** Items of the form `<A-Z or number>. whereas …`;
the vote name gives the key. Only written when the key appears **once** in the
document: a document can hold two lettered lists (the report's, and the amended
ones further down), and the run prints both candidates with their line numbers
instead of guessing.

**Citations (`ai/split.js`).** The `– having regard to …` items, in document
order, 1-based — the EP numbers them the same way. Written only when the index
is within the list, which is how a wrong `ref` shows up (a vote "Citation 11"
attached to a document with 7 citations).

**Guards.** Markdown-derived text is only written when it is 40–4,000 characters
and unambiguous; every skip is counted (`not found`, `ambiguous`,
`not extractable`) at the end of the run. Nothing is overwritten unless
`--force`.

### What is not extracted (yet)

5,400 of the 14,117 votes still have no text. By category, largest first:

| category | votes | why not | what it would take |
|---|---|---|---|
| amendments (`… Am 26`, `§ 6 – 12`, `After § 3`, `Before § 1`) | ~4,950 | the wording lives in the amendment range documents on doceo, which is behind a WAF that throttles a burst | `ai/amendments.js` fetches them in batches (see above); each run picks up where the last stopped |
| `Article N` and `Article 2, § 2 – 20` | 703 | the article text lives in the **Commission proposal** (`C10-…`), a different document, which the API does not publish either | scrape the procedure page, or accept the proposal document as a second input |
| split parts with no wording in the XML | 481 | the block's "Requests for split votes" remark does not list that part | nothing reliable: the text was never published |
| procedural / appointments (`Request by…`, `Appointment of…`) | 358 | there is no text — the vote is about the agenda or a person | nothing |
| budget lines (`Block 1`, `01 02 02 51`) | 475 | the "draft amendments" to the draft budget (VOT `type="BUDGET"`, Am 6–724) are not published: the report Work in the API has one realization (Part 1 only), its doceo page lists `AM-001…125` for the resolution alone, `-PART-2` serves Part 1 again, and no `PB-`/`BUD-` document exists — same in 2025 and 2026. The committee list (`BUDG-AM-796264`, "AMENDMENTS 1-340", `reds_iCmDoc_Amd`) numbers the *resolution* amendments again (Am 305 = "Paragraph 41 a (new)"), not these | nothing for the draft amendments; the resolution votes of the same report (`A10-0272/2026`, 124 of 133) *are* covered by its AM documents |
| recitals not found or ambiguous | 264 | 18 are documents with two lettered lists (line numbers printed by the run); the rest have no `X. whereas` in the report | review the 18 by hand; the others are missing in the source |
| sub-paragraphs (`§ 100, point ix`, `§ 88, indent 7`) | 20 | the vote is on one indent inside a paragraph, and markdown loses that structure | needs the DOCX's list levels, not the flat markdown |
| individual motions with no document | 40 | the API lists the motion but publishes no English file, and no other language either | nothing |
| whole-text votes without a summary | 37 | the report has no summary yet (94 of the 1,683 reports have no document at all) | `node ai/oeil.js <ref>` |
| paragraphs / citations not found | 19 | the number has no match in the markdown | check case by case |

Also unprocessed at the document level: **94 reports have no summary/markdown**
(1,683 reports, 1,589 files), because the API publishes no file for them (the
`C10-…` proposals and a few `REV1` variants) or only in a language we did not
fetch.

### Inspecting it

```bash
sqlite3 -column -header data/term10.db \
  "select rollcall, kind, chars from rollcall_texts where rollcall = 200501;"
node ai/split.js --dry --ref A10-0075/2025   # what would be written for one report
node ai/split.js                             # write it
node ai/oeil.js --motions                    # fetch + summarise the missing motions
```

## Gotchas

- **MEP ids**: the EP's voting system uses its own ids, unrelated to the ids used
  everywhere else. `meps.vote_id` bridges them; `sh qa.sh` (run twice) does the
  name matching, and `data/mepidmatch.csv` holds the manual fixes.
- **Placeholder MEPs**: someone can vote before their profile is published; a
  placeholder row is created and updated later.
- **Name strings are messy**: a rollcall name can contain the report title in
  three languages plus rapporteurs, in one unparsable string.
- **Not every vote has individual records** — hand votes have counts only, and
  some roll-calls are published without per-MEP data.
- RCV XML is parsed in French: it used to be more complete and updated sooner.

## Legacy pipeline (term 8/9, RCV XML only)

Before the OpenAPI importer existed, everything came from scraped XML files and
the steps below. They are still the way `positions` are filled, and `qa.sh`
still depends on them.

```text
0) prepare the list of meps
cd /var/www/ep/ && gulp && node script/aliases.js

1) parse the pages to get the list of documents
node index.js     # attendance lists, votes, rollcall documents
node report.js    # reports and motions tabled (A8-xx, B8-xxx)

2) download the xml files (gzipped to save space)
node download.js

3) parse each xml
node attendance.js
node rollcall.js  # generates data/item_rollcall.csv and data/mep_rollcall.csv
```

Watch the mismatch warnings, e.g.
`2018-07-04 12:56:20 for 92449 error processed 286/256` means more registered
votes than the total mentioned in the file.

```text
4) match the two MEP id spaces via the attendance lists
sh qa.sh
sh qa.sh   (yes, twice)
# manual fixes end up in data/mepidmatch.csv, e.g.
# 6782,Packet,ECR,530
5) gzip data/mep_rollcall.csv before pushing
```

The queries in `qa.sh` use [q](https://github.com/harelba/q) (>1.4, older
versions escape `"` wrongly).

Schema snippets from that era (the current schema is in `openapi/SQL.md`):

```sql
CREATE TABLE `positions` (
  `id` integer not null primary key autoincrement,
  `rollcall` integer not null,
  `mep_vote` integer not null,
  `position` varchar(20) null,
  UNIQUE(mep_vote,rollcall)
);

CREATE TABLE `attendances` (
  `id` integer not null primary key autoincrement,
  `status` varchar(30) null,
  `mep_id` integer not null,
  `date` date not null,
  UNIQUE(mep_id,date)
);
```
