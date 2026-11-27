# AGENTS.md

How to work in this repository. Read this before the README — the README explains
*what* the pipeline does, this file explains *how to touch it*.

## Commits: propose, never commit on your own

- When a change is finished and verified, **propose a commit** in your reply:
  the files to stage and the full message text (subject line, blank line, body).
- **Do not run `git commit` until the human says yes.** Same for `git push`,
  `git rebase`, `git reset --hard`, force-push, or anything that rewrites history.
- Two repositories are in play: `/var/www/mepwatch/parlparse` (this one) and
  `/var/www/mepwatch` (the site, `10/` and `mepwatch-astro/`). A change to the
  published format usually needs a commit in both — propose them separately.
- **Stage explicit paths. Never `git add -A`** in this repository. `data/` holds
  ~2 GB of generated files (database, document caches, CSVs); one `add -A` once
  committed a 371 MB `term10.db` and 238 generated files, and the history had to
  be rewritten after publication. If a file is generated, it belongs in
  `.gitignore`, not in the index.
- Commit messages here are prose: what was wrong, what changed, and the evidence
  (a number, a before/after). No "update files", no bullet-less walls.

## Map: what is where

| path | what it is |
| --- | --- |
| `update.sh` | **the routine entry point**: migrate → `openapi/update.js` → `prod.sh`. Safe to run often |
| `prod.sh` | copies the CSVs from `data/` to `../10/data` — this is what makes a change visible on the site |
| `openapi/update.js` | check + import + rebuild in one process. `--no-db` checks only, `--local` rebuilds offline, `--days N` / `--date` scope it |
| `openapi/decisions.js` | creates a row per decision of a sitting (the base of every vote row) |
| `openapi/rcv.js`, `att.js`, `vot-xml.js` | the three XML documents of a sitting → `rollcalls`, `positions`, `attendances`, split-part texts |
| `openapi/agenda.js` | `agenda_items` (the sitting's points, their order, times, planned votes) |
| `openapi/report.js` | `reports` rows from the API; runs `procedure.js` and `subject.js` |
| `openapi/procedure.js`, `subject.js` | `procedures`, `subjects`, `procedure_subjects` |
| `ai/oeil.js` | report → markdown (`data/content/oeil`) → DeepSeek summary (`data/content/summary`) → `reports.summary` |
| `ai/split.js` | paragraph / recital / citation votes → `rollcall_texts` (deterministic) |
| `ai/amendments.js` | amendment range documents → `rollcall_texts` (deterministic) |
| `ai/attach.js` | puts a report summary on the votes about the whole text |
| `ai/prompt/*.md` | the model prompts — edit these, not the code |
| `lib/` | the shared layer: `db.js` (knex), `rollcall.js` (RCV import), `attendance.js`, `csv.js`, `refs.js`, `dates.js`, `markdown.js` |
| `sql/*.sql` + `sql/run.js` | the aggregates: `groupmajority`, `mep_sitting_stats`, cordon, cohesion |
| `csv.js`, `cards.js` | the files the site reads (`../10/data/*.csv`, `../10/cards/`) |
| `migrations/` | knex migrations, timestamped, one concern each |
| `openapi/test/` | `npm test` (47 tests) — run it before proposing a commit |
| `legacy/`, `term8/`, root `*.js` | the old term-8/9 pipeline. **Do not touch** unless the task is about it |

Data flow: document → importer → `rollcalls`/`positions` (the truth) →
`rollcall_texts`/`reports.summary` (what it was about) → `sql/` aggregates →
`data/*.csv` + `../10/cards/*.json` → the site.

Where to read more: `README.md` (the full story, section per feature),
`openapi/README.md` (the scripts), `openapi/SQL.md` (every column and its
provenance), `openapi/doc.md` (the controlled vocabularies).

## Conventions that bite if you break them

- **Every script that opens knex must `process.exit(0)`** at the end when run as a
  CLI, or hand the pool back: a lingering pool hangs the caller.
- **Every importer is an importable module**: `async function run(options = {})`
  merges over `argv`, `module.exports = { run, main, argv }`, and the CLI body runs
  only under `require.main === module`. `openapi/update.js` calls these in-process.
- **`run()` returns what it did** (`{votes, positions}`, `{written}` …) or nothing
  when it did nothing — the orchestrator decides whether the next step runs.
- **Cache first**: re-downloading is opt-in (`--force`), not the default.
- **Do not overwrite a good file with a smaller download** — warn instead.
- **A step that cannot be scoped to a date must say so**, not silently walk the
  whole database. Use `lib/dates.js` (`clause(column, dates)`) for the SQL.
- **The update's `--force` must not leak into child scripts** — they parse the same
  command line, where `--force` means "download again".
- No front-matter in generated markdown (`data/content/**`): metadata goes to
  stdout, never into the file.
- Legal text is **extracted deterministically**; the model only writes summaries.
  If a text must be verbatim, it never goes through a model.

## Verify before proposing a commit

```sh
npm test                         # 47/47
node openapi/update.js --no-db --days 1     # the check still reads the API
node <script> --dry ...          # any pass you touched has a --dry
```

For anything that writes, run it scoped (`--date`, `--ref`, `--limit 1`) first and
show the actual output in the reply — a claim of "it works" without a line of
evidence is not a verification.

## When something is missing or blocked

Say it plainly, with what was tried: "the API answers 404 for `C-10-2026-0258`, the
document is the COM file under RegData" beats "it should work". The README keeps a
record of what is structurally unavailable (`budget-2025/2026/2027` draft
amendments, `C10-*` before the RegData path) — add to it rather than re-discover it.
