# Database Schema — `data/term10.db`

SQLite database storing European Parliament plenary data for the **10th term**
(2024–2029). Managed via [knex.js](https://knexjs.org/) with a Strapi CMS-backed
schema. Located at `data/term10.db` (with WAL journal: `term10.db-shm`,
`term10.db-wal`).

---

## Entity-Relationship Overview

```
plenaries ──< rollcalls ──< positions  >── meps
    │                       (per-MEP)
    └──< attendances ──> meps
    │
votes ──< votings
    │
rollcalls.ref ─── reports.reference

groupmajority ─── rollcalls
      │
      └────────── eugroups (via eugroup.code)
```

**Key relationships:**
- A `plenaries` row represents one plenary sitting day. It has many `rollcalls` and many `attendances`.
- A `rollcalls` row is one specific vote item. It has many `positions` (one per MEP who voted).
- A `positions` row links one MEP's vote on one roll-call.
- A `votes` row represents a vote-results document for a day, containing many `votings`.
- `groupmajority` stores pre-computed majority and cohesion stats per group per roll-call.

---

## Table Reference

### `plenaries`

Plenary sitting days — one row per date when the Parliament sat in plenary.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal row ID |
| `date` | date | NOT NULL | Sitting date (e.g. `2024-07-17`) |
| `meps` | integer | nullable | Number of MEPs present (deprecated) |
| `status` | varchar(255) | nullable | Processing status |
| `url` | varchar(255) | nullable | Source document URL |
| `term` | integer | nullable | Parliamentary term (10) |
| `sitting_id` | integer | nullable, unique | External sitting identifier from attendance XML |
| `source` | varchar(50) | nullable | Data source: `rcv-xml`, `openapi` |
| `created_by` / `updated_by` | integer | nullable | Strapi admin user IDs |
| `created_at` / `updated_at` | datetime | nullable, default NOW | Timestamps |

**Relations:** `plenaries.id` ← `rollcalls.plenary`, `plenaries.id` → joinable via `plenaries.date` with attendance processing.

---

### `rollcalls`

Individual roll-call vote items within a plenary sitting.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Roll-call identifier (from API, e.g. `169367`) |
| `date` | datetime | NOT NULL | Vote date/time |
| `name` | text | NOT NULL | Vote title (e.g. *"The need for the EU's continuous support for Ukraine – § 3/1"*) |
| `description` | varchar(255) | nullable | Legacy description field |
| `ref` | varchar(255) | nullable | Document reference (e.g. `B10-0007/2024`, `AGENDA`) |
| `for` | integer | nullable | Number of FOR votes |
| `against` | integer | nullable | Number of AGAINST votes |
| `abstention` | integer | nullable | Number of ABSTENTION votes |
| `plenary` | integer | nullable | FK → `plenaries.id` |
| `green_remark` | varchar(255) | nullable | Internal remark |
| `term` | integer | nullable | Parliamentary term (10) |
| `method` | varchar(50) | nullable | Vote method: `ROLL_CALL`, `HAND`, or `ELECTRONIC` (populated by `openapi/plenary.js`) |
| `attendees` | integer | nullable | Total number of MEPs who voted (for electronic votes) |
| `requested_by` | varchar(255) | nullable | Political group(s) that requested the vote (e.g. `"The Left"`, `"PPE, ECR, ESN"`, `"original text"`) |
| `doc_ref` | varchar(255) | nullable | Specific amendment document reference (e.g. `B-10-2024-0007-AM-1`) |
| `vote_type` | varchar(50) | nullable | Category: `amendment`, `split`, `original`, `main`, `procedural`, `other` |
| `created_by` / `updated_by` | integer | nullable | Strapi admin |
| `created_at` / `updated_at` | datetime | nullable, default NOW | Timestamps |

**Relations:**
- `rollcalls.plenary` → `plenaries.id`
- `rollcalls.id` ← `positions.rollcall`
- `rollcalls.ref` → `reports.reference` (weak link via document reference number)
- `rollcalls.id` ← `groupmajority.rollcall`

---

### `positions`

Per-MEP voting positions — one row per MEP per roll-call vote.
This is the core dataset for analysing individual voting behaviour.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal row ID |
| `rollcall` | integer | nullable | FK → `rollcalls.id` |
| `position` | varchar(255) | nullable | Vote cast: `FOR`, `AGAINST`, or `ABSTENTION` |
| `mep_vote` | integer | NOT NULL | MEP identifier (`PersId` from the roll-call XML) |
| `eugroup` | varchar(255) | nullable | Political group code at time of vote (e.g. `PPE`, `S&D`, `ECR`) |
| `correction` | varchar(255) | nullable | Corrected vote intention (`for`, `against`, `abstention`) from correction XML |
| `ep_id` | varchar | nullable | Additional EP identifier (added later) |
| `created_by` / `updated_by` | integer | nullable | Strapi admin |

**Relations:**
- `positions.rollcall` → `rollcalls.id`
- `positions.mep_vote` ↔ `meps.vote_id` (join to get MEP name, country, etc.)

---

### `meps`

MEP biographical registry — one row per MEP (across terms).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal row ID |
| `name` | varchar(255) | nullable | Full name (fallback) |
| `first_name` | varchar(255) | nullable | First name |
| `last_name` | varchar(255) | nullable | Last name |
| `birthdate` | date | nullable | Date of birth |
| `country` | varchar(255) | nullable | Member state code (e.g. `de`, `fr`, `it`) |
| `eugroup` | varchar(255) | nullable | Political group code (current/latest) |
| `party` | varchar(255) | nullable | National party name |
| `ep_id` | integer | nullable, unique | Official EP person ID (from `person/` URI) |
| `vote_id` | integer | nullable | Vote system ID (`PersId` from roll-call XML, used in `positions.mep_vote`) |
| `start` | date | nullable | Term start date |
| `end` | date | nullable | Term end date (null if still serving) |
| `term` | integer | nullable | Parliamentary term |

**Relations:**
- `meps.vote_id` ← `positions.mep_vote`
- `meps.ep_id` → can be resolved via `GET /api/v2/meps/{ep_id}`

---

### `attendances`

MEP attendance records per plenary sitting day.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `sitting_id` | integer | PK (part of unique) | Sitting identifier from attendance XML |
| `mep_id` | integer | PK (part of unique) | MEP identifier |
| `status` | varchar(255) | nullable | `attended` or `excused` |

**Relations:**
- `attendances.mep_id` ↔ `meps.vote_id`
- Unique constraint on `(sitting_id, mep_id)`.

---

### `votes`

Vote result documents — one row per plenary day for the VOT (vote results) dataset.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal ID |
| `date` | datetime | NOT NULL | Vote date |
| `type` | varchar(255) | nullable | Document type |
| `updated` | datetime | NOT NULL, default NOW | Last update timestamp |
| `title` | varchar(255) | nullable | Document title |
| `label` | varchar(255) | nullable | Short label |
| `term` | integer | default 10 | Parliamentary term |
| `plenary_id` | integer | nullable | FK → `plenaries.id` |

**Relations:** `votes.id` ← `votings.vote_id`, `votes.plenary_id` → `plenaries.id`

---

### `votings`

Individual voting items within a vote results document.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal ID |
| `date` | datetime | NOT NULL | Vote timestamp |
| `type` | varchar(255) | nullable | Vote type (e.g. `AMENDMENT`, `TITLE_BLOCK`) |
| `result_type` | varchar(255) | nullable | Result type (e.g. `raise_hand`, `RCV`, `EV`) |
| `title` | varchar(255) | nullable | Voting item title |
| `result` | varchar(255) | nullable | Outcome (`ADOPTED`, `REJECTED`, `LAPSED`) |
| `author` | text | nullable | Amendment author / political group |
| `term` | integer | default 10 | Parliamentary term |
| `vote_id` | integer | nullable | FK → `votes.id` |

**Relations:** `votings.vote_id` → `votes.id`

---

### `groupmajority`

Pre-computed per-group voting statistics for each roll-call.
Populated by the `stats.js` / `groupmajority` query, summarising `positions`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal ID |
| `eugroup` | integer | nullable | Political group code (e.g. `PPE`, `S&D`) |
| `rollcall` | integer | nullable | FK → `rollcalls.id` |
| `majority` | varchar(255) | nullable | Group majority position (`FOR` or `AGAINST`) |
| `cohesion` | integer | NOT NULL | Cohesion percentage (0–100) |
| `total` | integer | nullable | Total MEPs in group who voted |
| `for` | integer | nullable | Number who voted FOR |
| `against` | integer | nullable | Number who voted AGAINST |
| `abstention` | integer | nullable | Number who abstained |

**Relations:** `groupmajority.rollcall` → `rollcalls.id`

---

### `eugroups`

Political group definitions (multilingual).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal ID |
| `code` | varchar(255) | nullable | Short code (e.g. `PPE`, `S&D`, `Renew`) |
| `name` | varchar(255) | nullable | Full name in given language |
| `lang` | varchar(255) | NOT NULL | Language code |
| `description` | varchar(255) | nullable | Description |
| `primary` | boolean | NOT NULL | Is primary name for this group |
| `term` | integer | nullable | Parliamentary term |

---

### `reports`

Parliamentary reports referenced by roll-call votes.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK autoincrement | Internal ID |
| `reference` | varchar(255) | NOT NULL | Document reference (e.g. `A10-0001/2024`) |
| `title` | text | nullable | Report title |
| `date` | date | nullable | Publication date |
| `committee` | varchar(255) | nullable | Responsible committee |
| `url` | varchar(255) | nullable | Document URL |
| `raw` | text | nullable | Raw metadata |
| `topic` | varchar(255) | nullable | Topic tag |
| `term` | integer | nullable | Parliamentary term |

**Relations:** `reports.reference` ← `rollcalls.ref` (loose string match)

---

### Auxiliary Tables

| Table | Purpose |
|---|---|
| `parties` | National political parties (name, country, code, term) |
| `bookmarks` | User bookmarks linking rollcalls to tags |
| `notes` | User notes on specific roll-calls |
| `tags` | Tag names for categorising roll-calls |
| `rollcalls_tags__tags_rollcalls` | Many-to-many join table |
| `topics` | Topic definitions for reports |
| `reports_topics__topics_reports` | Many-to-many join table |

### Strapi Internal Tables

| Table | Purpose |
|---|---|
| `core_store` | Strapi model definitions and app configuration |
| `strapi_webhooks` | Webhook configuration |
| `strapi_permission` | RBAC permissions |
| `strapi_role` | Admin roles |
| `strapi_administrator` | Admin users |
| `strapi_users_roles` | User-role assignments |

---

## Sample Queries

### All roll-call votes for a given date

```sql
SELECT r.id, r.date, r.name, r.ref, r.for, r.against, r.abstention
FROM rollcalls r
JOIN plenaries p ON p.id = r.plenary
WHERE p.date = '2024-07-17'
ORDER BY r.id;
```

### Per-MEP voting on a specific roll-call

```sql
SELECT m.name, m.eugroup, m.country, p.position
FROM positions p
JOIN meps m ON m.vote_id = p.mep_vote
WHERE p.rollcall = 169367
ORDER BY m.eugroup, m.name;
```

### Attendance for a plenary day

```sql
SELECT m.name, m.eugroup, a.status
FROM attendances a
JOIN plenaries p ON p.sitting_id = a.sitting_id
JOIN meps m ON m.vote_id = a.mep_id
WHERE p.date = '2024-07-17';
```

### Group cohesion (from `sql/cohesion.sql`)

```sql
SELECT eugroup,
       ROUND(AVG(cohesion), 1) AS avg_cohesion,
       COUNT(*)                AS total_votes
FROM groupmajority
GROUP BY eugroup
ORDER BY avg_cohesion DESC;
```

### Cordon sanitaire detection (from `sql/cordon.sql`)

Detects roll-calls where ECR + PfE + PPE voted together, while
S&D and Renew broke away:

```sql
SELECT ecr.rollcall, r.date,
       ecr.majority AS far_right_epp_position,
       rep.title    AS report_title
FROM groupmajority ecr
JOIN groupmajority pfe  ON pfe.rollcall  = ecr.rollcall
JOIN groupmajority ppe  ON ppe.rollcall  = ecr.rollcall
JOIN groupmajority sd   ON sd.rollcall   = ecr.rollcall
JOIN groupmajority ren  ON ren.rollcall  = ecr.rollcall
JOIN rollcalls r        ON r.id          = ecr.rollcall
LEFT JOIN reports rep   ON rep.reference = r.ref
WHERE ecr.eugroup = 'ECR'
  AND pfe.eugroup = 'PfE'
  AND ppe.eugroup = 'PPE'
  AND sd.eugroup  = 'S&D'
  AND ren.eugroup = 'Renew'
  AND ecr.majority IS NOT NULL
  AND pfe.majority IS NOT NULL
  AND ppe.majority IS NOT NULL
  AND ecr.majority = pfe.majority
  AND pfe.majority = ppe.majority
  AND (sd.majority != ppe.majority
    OR ren.majority != ppe.majority)
ORDER BY r.date DESC;
```

### Number of roll-calls processed per plenary day

```sql
SELECT p.date, COUNT(r.id) AS rollcalls, SUM(r.for + r.against + r.abstention) AS total_votes
FROM plenaries p
LEFT JOIN rollcalls r ON r.plenary = p.id
GROUP BY p.date
ORDER BY p.date DESC;
```

### Vote method distribution for a given date

```sql
SELECT r.method, r.vote_type, COUNT(*) AS cnt
FROM rollcalls r
JOIN plenaries p ON p.id = r.plenary
WHERE p.date = '2024-07-17'
GROUP BY r.method, r.vote_type
ORDER BY r.method, r.vote_type;
```

### All non-roll-call decisions for a date (added from OpenAPI)

```sql
SELECT r.id, r.name, r.method, r.requested_by, r.vote_type, r.doc_ref
FROM rollcalls r
JOIN plenaries p ON p.id = r.plenary
WHERE p.date = '2024-10-09'
  AND r.method != 'VOTE_ELECTRONIC_ROLLCALL'
ORDER BY r.id;
```

---

## Notes

- The `positions` table is the largest by far — one row per MEP per roll-call vote.
- `rollcalls.ref` links to document references like `B10-0007/2024` or `A10-0007/2024`. This can be joined to `reports.reference` for report titles.
- The `eugroup` in `positions` is captured at vote time, so it reflects the MEP's group at that date, not their current/latest group.
- The `groupmajority` table is a pre-computed materialisation; run `node stats.js` to refresh it.
