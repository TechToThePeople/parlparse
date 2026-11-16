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
|---|---|
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
|---|---|---|
| `data/meps.csv` | `csv.js` | `epid,firstname,lastname,active,start,end,birthdate,country,gender,eugroup,party,email,twitter,term,voteid` |
| `data/item_rollcall.csv` | `csv.js` | `identifier,date,report,desc,title,for,against,abstention,no_show,excused,requested_by,outcome,committee,method,doc_ref,vote_request,split_requested_by,requested_source` |
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

```
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

```
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
