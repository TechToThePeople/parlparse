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
4. `node openapi/report.js` — report rows, and their committees/groups
   committee(s) or political group(s) behind each one.
5. `node csv.js`, `node cards.js`, `npm run majority:csv` — the static files.
6. `sh prod.sh` — publish to `../10/data` (fails loudly on an empty CSV, and
   swaps each file atomically).

One-off backfills, not part of the daily run:

```bash
node openapi/decisions.js --all              # all vote-result dates (116), ~4 min
node openapi/decisions.js --all --no-rollcall # hand/electronic only, leaves RCV rows alone
node openapi/report.js                     # missing rows + committees/groups
```

## openapi/ scripts

| script | writes |
| --- | --- |
| `openapi/decisions.js <date> \| --all` | `rollcalls` (all vote methods, counts, `vote_type`, `requested_by`) |
| `openapi/vot.js [<date> \| --all]` | `votes` + `votings` (from the VOT documents) |
| `openapi/rcv.js [<id> \| <date>]` | `data/openapi/rcv/*.json` |
| `openapi/att.js [<id> \| <date>]` | `data/openapi/att/*.json` |
| `openapi/report.js [--dry]` | missing `reports` rows, then `reports.creator` |
| `openapi/vot-xml.js [<date> \| --all]` | `rollcalls.ref`, `name`, `committee` (and `doc_ref` for the individual motions of a resolution) from the VOT XML |

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
| `data/text_tabled.csv` | `csv.js` | `date,reference,type,title,rapporteur,committee,intra,oeil,doc,procedure` |
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
  `reports.creator` (filled by `openapi/report.js`).
- **`text_tabled.procedure`** is the procedure code (`2025/0227(COD)`) linked to
  `procedures.code`; `votes.html` shows it under the report reference.
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

Every step runs by default, on the reports that have no summary yet:
**fetch** (download the DOCX/PDF) → **convert** (markitdown) → **AI** (DeepSeek) →
**attach** (link the summary to its votes). Each can be turned off:

```bash
node ai/oeil.js A10-0275/2026        # one report, all four steps
node ai/oeil.js --limit 5            # a trial run
node ai/oeil.js --no-ai              # fetch + convert, no tokens
node ai/oeil.js --no-fetch           # markdown on disk only (with --no-ai: relink)
node ai/oeil.js --force              # redo every step for every report
node ai/oeil.js --force-ai A10-0023/2026   # new summary from the saved markdown
```

`--force-ai` is the cheap one when a summary is bad: no 40 MB download, just the
model again. The attach pass costs nothing (it reads `data/content/summary/` and
upserts `rollcall_texts`), so it ends every run unless `--no-attach`.

- document: the DOCX from the Open Data distribution (PDF as fallback), converted
  with `markitdown` → `data/content/oeil/<ref>.md`. When the record names no
  distribution at all — it happens for a handful of reports — the file comes from
  doceo through the WAF browser instead (A10-0277/2026, B10-0427/2026, …)
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

## Running an update (`update.sh`)

```sh
./update.sh
```

Three steps: `npm run db:migrate`, `openapi/update.js --days=2
--no-forthcoming --sync`, `sh prod.sh`.

`--sync` is the whole check: **eight requests** (four documents for each of the
last two sittings). If nothing is published it stops there — ~1.3 s, no writes — so
it is safe to run every few minutes. When a document *is* new it imports it and
then, in the same process, refreshes `agenda.js --upcoming` (planned votes and
times), `openapi/report.js` (report rows, procedure, subjects), `csv.js`,
`cards.js` for those dates and `npm run majority:csv` (the SQL aggregates:
`groupmajority`, `mep_sitting_stats`, the cohesion and cordon CSVs).

**Not in the loop:** `ai/oeil.js` — the summaries cost tokens, so they stay a
manual `node ai/oeil.js` (missing reports only).

The step-by-step version this replaced — `decisions.js -d-1`, `positions.js`,
`vot-xml.js`, `att.js`, `csv.js`, `cards.js`, `majority:csv` — is kept in
`legacy/update.sh` for reference. Two differences worth knowing: the importers
now run **only for the sittings whose documents are new** (the old script ran them
for yesterday and today unconditionally), and `positions.js` is gone from the
pipeline — `openapi/rcv.js` reads the distribution the API publishes instead of
scraping RegData.

## Is there anything new? (`openapi/update.js`)

A plenary day publishes four documents, all plain entries in the Open Data API, so
their existence is a `200` or a `404` — four cheap requests per date and **no
headless browser** (the WAF is only in the way of *downloading* the XML from
doceo, and that is the fallback; `rcv.js` and `att.js` prefer the distribution the
API names):

| document | work-type | imported by |
|---|---|---|
| `PV-10-<date>-RCV` | `VOTE_ROLLCALL_PLENARY` | `openapi/rcv.js` → `rollcalls`, `positions` |
| `PV-10-<date>-ATT` | `LIST_ATTEND_PLENARY` | `openapi/att.js` → `attendances` |
| `PV-10-<date>-VOT` | `VOTE_RESULTS_PLENARY` | `openapi/vot-xml.js` (from `data/VOT/`) |
| `PV-10-<date>` | `MINUTES_PLENARY` | nothing — the minutes are not imported |

```sh
node openapi/update.js            # the 3 most recent sitting dates
node openapi/update.js --days 1   # just today
node openapi/update.js --days 10  # the last ten sittings
```

`--days N` is a count of **sitting dates**, not of calendar days: the N most
recent dates in `plenaries` ∪ `agenda_items` that are not in the future, oldest
first. Today counts as a sitting only if it is one, so `--days 2` on a Monday
after a Thursday sitting shows Monday and Thursday, not "Monday and Sunday".

On top of that window the **next 4 sittings** are listed too, from `plenaries` as
well as `agenda_items` — `--no-forthcoming` leaves them out:

```
2026-11-24                      planned: 9 vote(s)
2026-11-25                      planned: 17 vote(s)
2026-11-26                      planned: 6 vote(s)
2026-12-14
```

Their four document cells are left **empty without asking**: a sitting that has not
happened cannot have documents, so four requests would only buy four 404s. Blank
means "not published" for a past sitting and "not yet" for a future one.

The last column is what the database holds, and it counts votes by how they were
taken — a row can exist without the RCV document, because `decisions.js` creates
it from the meeting (`1 RCV · 1 HAND` on 2026-11-23, whose RCV document was never
published):

```
2026-11-12  95 RCV · 122 HAND · 9 ELECTRONIC · 56639 pos · 591 attended
2026-11-23  1 RCV · 1 HAND
```

```
date        RCV  ATT  VOT  MIN  local
2026-11-12  ok   ok   ok   pub  95 RCV · 122 HAND · 9 ELECTRONIC · 56639 pos · 591 attended
2026-11-23            ok        1 RCV · 1 HAND
2026-11-24                      planned: 9 vote(s)
```

`ok` published and imported · `new` published, not imported · `pub` published but
nothing imports it (the minutes) · `—` not published · `?429`/`?net` the API
refused to answer, which is never read as "not published".

`--sync` then imports exactly what is missing, for each sitting:

```sh
node openapi/update.js --sync           # last 5 sitting dates
node openapi/update.js --date 2026-11-23 --sync
```

`decisions.js -d <date>` first (it is what creates a row for hand and electronic
votes), then `rcv.js` / `att.js` / `vot-xml.js` only for the documents actually
missing, then `agenda.js --date` to turn planned votes into voted ones, and
finally `csv.js`, `cards.js --date` and `npm run majority:csv`. `update.sh` stays
for the full run; this is the cheap path after a sitting.

Note 2026-11-23: a `VOT` document with no `RCV` at all — a sitting where every vote
was by show of hands. And a sitting can have `ATT` without `RCV` for the same
reason.

## Per-MEP votes (`positions`)

`openapi/rcv.js` downloads `PV-10-<date>-RCV` from doceo (gzip, despite the
`.xml.zip` name) and hands it to `lib/rollcall.js`, which is idempotent: it
compares the stored `positions` count with `for + against + abstention` and
re-imports a partial vote. A date whose file is already cached is imported too —
it used to return before that step, so any date downloaded but not imported kept
its votes empty (303 roll-calls were affected).

A roll-call vote can still have no per-MEP rows: `outcome = 'LAPSED'` (the
amendment was never put to the vote) or `'WITHDRAWN'` — 398 of the 6,905. One more,
172953, is simply absent from the RCV document although the VOT reports its counts.

## The procedure behind a report (`procedures`)

A report is one step of a procedure; the EP open data publishes the whole chain
of documents around it. `openapi/procedure.js` takes the code from the report's
own `<DocRef>` (already in `data/content/oeil/<ref>.md`, e.g. `2025/0227(COD)` —
1,576 of the 1,589 markdowns carry one), then

```
GET https://data.europarl.europa.eu/api/v2/procedures/2025-0227?format=application/ld+json
```

and stores what that returns in `procedures`, keyed by the code:

| field | from the API |
|---|---|
| `type` | `process_type` (`COD`, `INI`, `NLE`, `BUD`, …) |
| `title` | `process_title.en` |
| `stage` | `current_stage` (`RDG1`, `CONCILIA_RDG3`, …) |
| `documents` | `created_a_realization_of` — every document of the process (committee opinions, Council position, the report itself) |
| `activities` | `consists_of` — `{date, type, document, stage}` for each step |

`reports.procedure` joins the two. The API needs a browser `User-Agent` (it
answers 403 without one) and ~1 request/second (429 otherwise).

```sh
node openapi/procedure.js            # extract + fetch what is missing
node openapi/procedure.js --dry      # only print the codes found
```

It runs on the report **document** (`data/content/oeil/<ref>.md`, written by
`ai/oeil.js` when it fetches a report), so a report gets its procedure only once
that file exists — the AI summary is not involved. `openapi/report.js` runs
`procedure.js` and then `subject.js` at the end unless `--no-procedure` /
`--no-subject`; both only touch what is new.

The vocabularies the pipeline reads — document `work-type`s, activity types, decision
methods, procedure types, roles, statuses — are listed with their meanings in
[`openapi/doc.md`](openapi/doc.md), generated from the API's concept schemes.

## The agenda of a sitting (`agenda_items`)

An agenda point is a fact; the vote is its outcome. `openapi/agenda.js` reads
`GET /api/v2/meetings/MTG-PL-<date>/foreseen-activities` and stores one row per
point, past or future, with the report the point is about:

```xml
<item><title>Report on the proposal …</title><type>Report:</type>
  <process><label typeof="proc" resource="proc/2025-0130">2025/0130(COD)</label>…</process>
  <references><label typeof="def/ep-document-types/REPORT"
                     resource="doc/A-10-2026-0041">A10-0041/2026</label></references>
  <creators><label typeof="org" resource="org/ECON"/>…</creators></item>
```

There is **no stored link to the roll-calls**: one agenda point can produce dozens
of them (A10-0271/2026 had 61 on 2026-11-12), so the join is the pair
`(date, report)` and the view does it:

```sql
-- planned = votes 0, voted = votes > 0
SELECT date, agenda_order, title, report, votes, final_vote
  FROM agenda_items_with_votes
 WHERE kind = 'vote' AND date >= date('now')
 ORDER BY date, agenda_order;
```

Three kinds of row, all in the same table:

| `kind` | what it is | has |
|---|---|---|
| `part` | a meeting part from the API (`MEETING_PART`): a slot in the day | `start`/`end`, a label (`PLENARY SESSION VOTES`) or `Votes`/`Debates` when the API gives none |
| `vote` | an agenda point that will be voted | `agenda_order`, `title`, `report`, and the time of its part |
| `debate` | an agenda point that is debated | `agenda_order`, `title`, time of its part |

Parts **nest**: `09:00-11:50 PLENARY SESSION DEBATES` contains a `10:30-11:50`
sub-slot, which is where its first debate point is scheduled. Every point also
carries the time of its own part, so a timetable built from the points
(`kind IN ('vote','debate')`) has no overlap.

**The time of the day** lives on the *meeting part*, not on the point: the API
returns `MEETING_PART MTG-PL-2026-11-24-TF-1200`, label `PLENARY SESSION VOTES`,
`activity_start_date 2026-11-24T12:00`, `…T13:00`, and its `consists_of` lists the
agenda points inside it. `agenda.js` stores those parts as rows of their own
(`kind = 'part'`) and copies their start/end onto every point they contain:

```sql
SELECT substr(start, 12, 5) AS from_time, substr("end", 12, 5) AS to_time, title
  FROM agenda_items
 WHERE kind = 'part' AND date = '2026-11-24' ORDER BY start;
```

```
09:00-12:00  PLENARY SESSION DEBATES
12:00-13:00  PLENARY SESSION VOTES
13:00-15:00  PLENARY SESSION DEBATES
```

A forthcoming vote names a report we may not have yet, so a **stub** row is
inserted with the title the agenda gives; `openapi/report.js` then fills title,
date, URL and creator from the document API (it looks at `agenda_items.report` as
well as `rollcalls.ref`).

```sh
node openapi/agenda.js --upcoming     # the next sittings
node openapi/agenda.js --date 2026-11-24
node openapi/agenda.js --all
node openapi/agenda.js --minutes      # sittings that have minutes but no vote
```

`--minutes` also creates the `plenaries` row for a sitting that produced no vote
(9 of them: 2024-07-16, 2024-07-19, 2024-09-17, 2024-11-19, 2024-12-16,
2025-01-29, 2025-11-12, 2026-01-19, 2026-01-27) and for the future ones, with
`sitting_id` left NULL until a document supplies it.

## How much of the votes a MEP took part in (`mep_sitting_stats`)

Presence is a daily register (`attendances`), so "could have taken part" is every
RCV of that sitting and "did" is whether `positions` has a row for it. Only RCV
votes count (hand, electronic and secret votes publish no per-MEP data) and an
abstention counts as a vote cast.

`sql/mep-attendance.sql` rebuilds the table, one row per MEP per sitting, for
every sitting whose attendance list has been imported:

| column | meaning |
|---|---|
| `mep` | `meps.id` |
| `plenary` | `plenaries.id` |
| `status` | `attended` / `excused` (the register), `present_unregistered` (no register row but votes: the register is incomplete), `absent` (neither) |
| `rcv_held` | RCVs taken in the sitting |
| `rcv_voted` | RCVs where `positions` holds a row for that MEP |

```sql
-- one MEP, the breakdown the site wants
SELECT sum(rcv_held)                                                       AS held,
       sum(CASE WHEN status = 'attended' THEN rcv_held END)                AS registered,
       sum(CASE WHEN status = 'present_unregistered' THEN rcv_held END)    AS unregistered,
       sum(CASE WHEN status = 'absent'  THEN rcv_held END)                 AS absent,
       sum(CASE WHEN status = 'excused' THEN rcv_held END)                 AS excused,
       sum(rcv_voted)                                                      AS voted,
       sum(CASE WHEN status IN ('attended', 'present_unregistered')
                THEN rcv_held - rcv_voted END)                             AS present_no_vote
  FROM mep_sitting_stats WHERE mep = 1;
```

`absent` and `excused` hold `rcv_held` for information but are not part of
"present": a MEP who was not in the register could not have voted, and one excused
was authorised not to.

**Why `present_unregistered` exists**: the register is not complete. 1,679 rows
have no register row yet carry 91,751 votes — Sjöstedt cast 94 of 94 votes on
2026-11-12 and appears in neither our ATT file nor the one the API publishes (594
entries, no `2268`). A vote is better evidence of presence than a missing line in a
list, so those rows are not `absent`.

It runs from `npm run majority:csv` (step 1 of `sql/run.js`) and takes ~1.5 s.

## What a procedure is about (`subjects`, `procedure_subjects`)

Two sources, four vocabularies, one table keyed by `(scheme, code)` — because the
same idea is numbered differently in each:

| scheme | where it comes from | example |
|---|---|---|
| `oeil` | the "Subject" block of the OEIL procedure page (scraped; this numbering exists nowhere else) | `8.70` Budget of the Union |
| `dir-eu-legal-act` | `isAboutDirectoryCode` on the procedure's documents | `016020` Budget |
| `subject-matter` | `isAboutSubjectMatter` on the documents | `BUDG` Budget |
| `eurovoc` | `is_about` on the documents | `5158` general budget (EU) |

Labels are the English `skos:prefLabel` of the concept, fetched once per code from
the Publications Office / EuroVoc and cached in `subjects`.

```sh
node openapi/subject.js                          # every procedure without subjects
node openapi/subject.js --procedure 2025/0227(COD) --dry
```

```sql
select p.code, s.scheme, s.code, s.label
  from procedures p
  join procedure_subjects ps on ps.procedure = p.code
  join subjects s on s.id = ps.subject
 where p.code = '2024/0212(BUD)';
```

OEIL shows several subjects per procedure (that is why the junction table), and a
procedure whose documents carry no classification keeps none — the API publishes
it for about half of them.

`procedures.subjects_checked` is set only when **both sources answered**: a
procedure that could not be read (429, timeout) is left unmarked and retried on
the next run, so "publishes nothing" and "we could not look" never get confused.

## Where the text of a vote comes from (`rollcall_texts`)

One row per vote (`rollcall` = `rollcalls.id`), with `kind` saying what the text
is and `source` saying where it was found. 5,159 of the 14,117 votes have one:

| kind | source | votes | rule |
|---|---|---|---|
| `quoted` | `vot-xml` | 1,601 | split vote, the part's wording as the EP gives it: `<partValue>` starts with a quote |
| `without-words` | `vot-xml` | 678 | split described as `Text as a whole without the words: …` — a description, not the wording |
| `words` | `vot-xml` | 541 | the part is **those words**: `those words` / `that word` refers back to the quoted words of the sibling part (`Text as a whole without the words: ‘within DG FINS’`), and the words are stored, not the reference |
| `other` | `vot-xml` | 23 | other split wording that refers to nothing |
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
→ `without-words`/`with-words`; `those words` / `that word` → `words`, with the
wording taken from the sibling part that names it (`… without the words: ‘within
DG FINS’`, also written `…’ without the words: …` and `…’ excluding the words …`) —
without that, `§ 140/2` would only say "those words"; anything else → `other`.

**The paragraph behind a split part (`ai/split.js`).** A part vote names the
paragraph (`§ 140/2`) and its own words; `rollcall_texts.context` also holds
paragraph 140 itself, with those words wrapped in `<b>` when the part is (or
keeps) them and `<del>` when it removes them:

```
§ 140/2  "within DG FINS"
         … calls for adequate oversight mechanisms <b>within DG FINS</b> by
         making more resources available; …
```

934 of the 1,219 words/without-words/with-words parts got it; the rest name a
paragraph the report markdown does not carry (or a report with no markdown).

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
   (`A-10-YYYY-NNNN-AM-340-346_EN.docx`, fetched through the WAF browser, converted
   with markitdown and kept in `data/content/amendments/`) — the amendments tabled
   in plenary.

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

The markdown of every range document is kept in `data/content/amendments/`, and a
run uses it: only a report with **nothing** saved is fetched (its page lists the
documents), so re-running after a parser fix touches the network not at all.
`--force` ignores the saved markdown and downloads again.

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
