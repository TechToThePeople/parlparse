# what did the group want?

For each roll-call and each political group we want one answer: did the group
vote for, against, or abstain — and how solidly. That is `groupmajority`, which
feeds the "did this MEP vote with their group or rebel" views.

Computed by `sql/updatemajority.sql`, run as the first step of
`npm run majority:csv` (`sql/run.js`), before the cordon queries that read it.

## What it stores

One row per `(eugroup, rollcall)` — unique index
`groupmajority_eugroup_rollcall_unique`:

| column | meaning |
| --- | --- |
| `majority` | `for`, `against`, `abstention`, or NULL when the group had no clear instruction |
| `cohesion` | integer 0–100, see below |
| `total`, `for`, `against`, `abstention` | raw counts of MEPs in that group for that vote |

Rows come from `positions`, so only roll-calls with individual votes appear;
hand/electronic votes (`rollcalls.method` `HAND`/`ELECTRONIC`) have no group
breakdown.

## The definitions

```sql
cohesion = ROUND(100.0 * ABS(for_count - against_count - abstention_count) / total_count)
```

i.e. the *margin* of the winning side over everyone else, as a percentage of the
group. And:

```sql
majority = NULL                                  WHEN cohesion < 50
         = 'for'                                 WHEN for >= against AND for >= abstention
         = 'against'                             WHEN against >= for AND against >= abstention
         = 'abstention'                          otherwise
```

The `cohesion < 50` rule is the old TODO on this page ("do not consider that the
group has an instruction when it is split"): a group that is split roughly three
ways gets `majority = NULL` and is excluded from anything that needs a clear
group position.

Position strings are lowercase (`for`, `against`, `abstention`) — the RCV XML
parser writes them that way, and `"for"` must be quoted in SQL because of the
keyword.

## Upsert, not rebuild

`sql/updatemajority.sql` is an `INSERT … ON CONFLICT(eugroup, rollcall) DO
UPDATE SET …` (with `WHERE true` before `ON CONFLICT` so SQLite parses it as an
upsert, not a join constraint). Consequences:

- no window where `groupmajority` is empty, and an interrupted run is fixed by
  re-running it;
- rows whose `positions` disappeared are **not** pruned — `DELETE FROM
  groupmajority` by hand if that ever matters;
- `created_at` is preserved, `updated_at` moves.

Cost: ~3 s for 55,809 rows built from 3.9M `positions`. It is a full aggregate
every time — there is no change marker on `positions` (no `updated_at`, no
index), so incremental updates would need one.

## What reads it

| query | output | question it answers |
| --- | --- | --- |
| `sql/cordon.sql` | `data/cordon.csv` | roll-calls where **ECR + PfE + PPE** voted together while S&D and/or Renew did not, with the EPP cohesion |
| `sql/cordon-report.sql` | `data/cordon-report.csv` | the same, counted per report |
| `sql/cordon-total.sql` | `data/cordon-total.csv` | share of all roll-calls where **ECR + ESN + PfE** agree (`votes_in_common / total_votes`) |
| `sql/cohesion.sql` | — | per-group cohesion summary |

`cordon-total.sql` computes its numerator and denominator in CTEs. The earlier
form joined the denominator with `ON 1=1`, which made SQLite re-run
`COUNT(DISTINCT rollcall)` for every row — 46 s instead of 30 ms.

`csv.js`/`cards.js` do not use `groupmajority`; only `sql/run.js` does.

## Legacy: the postgres version

Before SQLite this ran on the `greenvote` postgres database against an `eugroups`
table, using `GREATEST()` and `ON CONFLICT DO NOTHING`:

```sql
INSERT INTO groupmajority (majority, cohesion, rollcall, eugroup, total, "for", against, abstention)
SELECT
  CASE
    WHEN ("for" >= against AND "for" >= abstention) THEN 'for'
    WHEN (against >= "for" AND against >= abstention) THEN 'against'
    WHEN (abstention >= against AND abstention >= "for") THEN 'abstention'
  END AS majority,
  round(100.0 * GREATEST("for", against, abstention) / total) cohesion,
  rollcall, eugroups.id eugroup, total, "for", against, abstention
FROM (
  SELECT rollcall, meps.eugroup, count(*) AS total,
    SUM(CASE WHEN POSITION = 'for' THEN 1 ELSE 0 END) AS "for",
    SUM(CASE WHEN POSITION = 'against' THEN 1 ELSE 0 END) AS against,
    SUM(CASE WHEN POSITION = 'abstention' THEN 1 ELSE 0 END) AS abstention
  FROM positions
  JOIN meps ON mep_vote = meps.vote_id
  GROUP BY rollcall, meps.eugroup
) q
LEFT JOIN eugroups ON eugroups.name = eugroup AND "primary" = true
ON CONFLICT DO NOTHING;
```

Note it joined `meps` for the group (using `meps.vote_id`, the MEP-id matching
described in `notes.md`); the current query reads `positions.eugroup` directly.
The cohesion formula also changed: `MAX(for, against, abstention) / total` (share
of the largest side) became the margin formula above, which is what the `cordon`
queries' `epp_cohesion` column means today.

## Where it is consumed downstream

`/var/www/greenvote/api/mep/controllers/mep.js`, for
<https://green.mepwatch.eu/mep/?id=197826>:

```js
const d = knex
  .select(knex.raw("eugroups.name, count(*), sum(case when (position != majority) then 1 else 0 end) as diff"))
  .from("groupmajority")
  .join("positions", "positions.rollcall", "groupmajority.rollcall")
  .join("meps", "positions.mep_vote", "meps.vote_id")
  .joinRaw("join eugroups on meps.eugroup = eugroups.name or eugroups.code='greens/efa'")
  .whereRaw("groupmajority.eugroup = eugroups.id")
  .andWhere("ep_id", id)
  .groupBy("eugroups.name");
```
