# European Parliament Open Data API — Plenary Data (10th Term)

This folder contains scripts and documentation for fetching plenary votes,
roll-call votes, and attendance lists from the **10th European Parliament term**
(2024–2029) via the official Open Data API.

## API Base

```
https://data.europarl.europa.eu/api/v2/
```

Request `format=application/ld+json` for JSON output.

---

## Available Work Types

| Work Type | Suffix | Description | Documents (term 10) |
|---|---|---|---|
| `VOTE_ROLLCALL_PLENARY` | `RCV` | Roll-call votes with per-MEP voting records | 91 |
| `VOTE_RESULTS_PLENARY` | `VOT` | Vote results with aggregate counts and outcomes | 96 |
| `LIST_ATTEND_PLENARY` | `ATT` | Attendance list for each plenary sitting day | 96 |
| `MINUTES_PLENARY` | `MIN` | Minutes of proceedings | — |

Document identifiers follow the pattern:
- `PV-10-YYYY-MM-DD-RCV` (roll-call votes)
- `PV-10-YYYY-MM-DD-VOT` (vote results)
- `PV-10-YYYY-MM-DD-ATT` (attendance list)

---

## Endpoint Reference

### 1. List Documents by Type

```http
GET /api/v2/documents
  ?work-type=VOTE_ROLLCALL_PLENARY
  &parliamentary-term=10
  &format=application/ld+json
  &limit=100
  &offset=0
```

Returns a list of document metadata records (IDs, labels, dates).

### 2. Single Document Details

```http
GET /api/v2/documents/PV-10-2024-07-17-RCV?format=application/ld+json
```

Returns full metadata including multilingual titles, file distributions (PDF, XML, DOCX),
and the plenary meeting reference.

### 3. Plenary Sittings (Meetings)

```http
GET /api/v2/meetings?sitting-date=2024-07-17&format=application/ld+json
```

Returns the plenary sitting activity record (e.g. `MTG-PL-2024-07-17`).

### 4. Decisions (per-MEP Roll-Call Data) — Key Endpoint

```http
GET /api/v2/meetings/MTG-PL-2024-07-17/decisions?format=application/ld+json
```

Each decision contains:
- `activity_label` — multilingual title of the vote
- `decision_method` — `VOTE_ELECTRONIC_ROLLCALL`, `VOTE_HAND`, `VOTE_ELECTRONIC`
- `decision_outcome` — `ADOPTED` or `REJECTED`
- `had_voter_favor` — array of person IDs who voted **for**
- `had_voter_against` — array of person IDs who voted **against**
- `had_voter_abstention` — array of person IDs who **abstained**
- `number_of_votes_favor` / `number_of_votes_against` / `number_of_votes_abstention`
- `number_of_attendees` — total voters
- `decided_on_a_realization_of` — reference to the document being voted on
- `responsible_organization_label` — political group(s) who requested the vote

**Note:** Per-MEP arrays are only present for electronic roll-call votes
(`VOTE_ELECTRONIC_ROLLCALL`). Hand votes (`VOTE_HAND`) have no voter details.

### 5. MEP Details

```http
GET /api/v2/meps/192254?format=application/ld+json
```

Resolve a person ID to full name, group, country, etc.

---

## Scripts

### `node openapi/rcv.js [<id> | <date> | --date=<date>]`

Fetches roll-call vote documents. Resolves the meeting, then fetches all decisions
with per-MEP voter arrays. Saves to `data/openapi/rcv/`.

```
node openapi/rcv.js 2024-07-17
node openapi/rcv.js PV-10-2024-07-17-RCV
```

### `node openapi/vot.js [<id> | <date> | --date=<date>]`

Fetches vote results documents. Downloads the English XML distribution and parses
per-item vote totals. Saves to `data/openapi/vot/`.

```
node openapi/vot.js 2024-07-17
node openapi/vot.js PV-10-2024-07-17-VOT
```

### `node openapi/att.js [<id> | <date> | --date=<date>]`

Fetches attendance list documents. Saves metadata JSON to `data/openapi/att/`.

```
node openapi/att.js 2024-07-16
node openapi/att.js PV-10-2024-07-16-ATT
```

### `node openapi/plenary.js [<date> | --all]`

Imports decisions from the OpenAPI into the `term10.db` database.
Fills the `method`, `requested_by`, `doc_ref`, `vote_type`, and `attendees`
columns in the `rollcalls` table for all vote types, not just roll-calls.

For each sitting date it:
1. Ensures a row exists in `plenaries`
2. Fetches ALL decisions (roll-call, hand, electronic) from the OpenAPI
3. Upserts each into `rollcalls` with method, group, and vote-type metadata
4. Reports new rows, updated rows, and counts by method

```
node openapi/plenary.js 2024-07-17       # single date
node openapi/plenary.js --all            # all plenary dates
```

---

## Data Output Structure

```
data/openapi/
  rcv/
    PV-10-2024-07-17-RCV.json          # Full document + decisions with per-MEP votes
  vot/
    PV-10-2024-07-17-VOT.json          # Document metadata + parsed vote items
  att/
    PV-10-2024-07-16-ATT.json          # Document metadata
```

---

## 10th Term Plenary Sitting Dates (2024)

| Date | Roll-Call | Vote Results | Attendance |
|---|---|---|---|
| 2024-07-16 | — | — | ✅ |
| 2024-07-17 | ✅ | ✅ | ✅ |
| 2024-07-18 | ✅ | ✅ | ✅ |
| 2024-07-19 | — | — | ✅ |
| 2024-09-16 | ✅ | ✅ | ✅ |
| 2024-09-17 | — | — | ✅ |
| 2024-09-18 | ✅ | ✅ | ✅ |
| 2024-09-19 | ✅ | ✅ | ✅ |
| 2024-10-07 | ✅ | ✅ | ✅ |
| 2024-10-08 | ✅ | ✅ | ✅ |
| 2024-10-09 | ✅ | ✅ | ✅ |
| 2024-10-10 | ✅ | ✅ | ✅ |
| 2024-10-21 | ✅ | ✅ | ✅ |
| 2024-10-22 | ✅ | ✅ | ✅ |
| 2024-10-23 | ✅ | ✅ | ✅ |
| 2024-10-24 | ✅ | ✅ | ✅ |
| 2024-11-13 | ✅ | ✅ | ✅ |
| 2024-11-14 | ✅ | ✅ | ✅ |
| 2024-11-19 | — | — | ✅ |
| 2024-11-25 | ✅ | ✅ | ✅ |
| 2024-11-26 | ✅ | ✅ | ✅ |
| 2024-11-27 | ✅ | ✅ | ✅ |
| 2024-11-28 | ✅ | ✅ | ✅ |
| 2024-12-17 | ✅ | ✅ | — |
| 2024-12-18 | ✅ | ✅ | — |
| 2024-12-19 | ✅ | — | — |

Use `node openapi/rcv.js --help` for full usage.
