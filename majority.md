## what the party wanted?

the aim is to identify for each vote what the eu groups wanted.

this will be used after to show for each mep when they voted with their group of rebelled

xavier@kundera:/var/www/mepwatch/parlparse$ /tmp/sqlite3 data/term10.db 
/tmp/sqlite3: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found (required by /tmp/sqlite3)
/tmp/sqlite3: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.29' not found (required by /tmp/sqlite3)
/tmp/sqlite3: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.28' not found (required by /tmp/sqlite3)
/tmp/sqlite3: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.33' not found (required by /tmp/sqlite3)
/tmp/sqlite3: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found (required by /tmp/sqlite3)

INSERT INTO groupmajority (
  eugroup, rollcall, majority, cohesion, total, `for`, against, abstention, created_at, updated_at
)
SELECT
  agg.eugroup,
  agg.rollcall,
  CASE
    WHEN agg.for_count >= agg.against_count AND agg.for_count >= agg.abstention_count THEN 'FOR'
    WHEN agg.against_count >= agg.for_count AND agg.against_count >= agg.abstention_count THEN 'AGAINST'
    ELSE 'ABSTENTION'
  END                                                  AS majority,
  CAST(ROUND(
    100.0 * MAX(agg.for_count, agg.against_count, agg.abstention_count) / NULLIF(agg.total_count, 0)
  ) AS INTEGER)                                        AS cohesion,
  agg.total_count                                      AS total,
  agg.for_count                                        AS `for`,
  agg.against_count                                    AS against,
  agg.abstention_count                                 AS abstention,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    p.eugroup,
    p.rollcall,
    COUNT(*) FILTER (WHERE p.position = 'FOR')         AS for_count,
    COUNT(*) FILTER (WHERE p.position = 'AGAINST')     AS against_count,
    COUNT(*) FILTER (WHERE p.position = 'ABSTENTION')  AS abstention_count,
    COUNT(*)                                           AS total_count
  FROM positions p
  WHERE p.eugroup IS NOT NULL
    AND p.position IS NOT NULL
  GROUP BY p.eugroup, p.rollcall
) agg
ON CONFLICT (eugroup, rollcall) DO UPDATE SET
  majority   = excluded.majority,
  cohesion   = excluded.cohesion,
  total      = excluded.total,
  `for`      = excluded.`for`,
  against    = excluded.against,
  abstention = excluded.abstention,
  updated_at = CURRENT_TIMESTAMP;

## big script to update:

``` sql
INSERT INTO groupmajority (majority, cohesion, rollcall, eugroup, total, "for", against, abstention)
SELECT 
	CASE
		WHEN ("for" >= against AND "for" >= abstention) THEN 'for'
		WHEN (against >= "for" AND against >= abstention) THEN 'against'
		WHEN (abstention >= against AND abstention >= "for") THEN 'abstention'
	END AS majority,
	round(100.0* GREATEST("for", against, abstention)/total) cohesion,
	rollcall,
	eugroups.id eugroup,
	total,
	"for",
	against,
	abstention
FROM (
	SELECT
		rollcall,
		meps.eugroup,
		count(*) AS total,
		SUM (
			CASE
				WHEN POSITION = 'for' THEN 1
				ELSE 0
			END
		) AS FOR,
		SUM (
			CASE
				WHEN POSITION = 'against' THEN 1
				ELSE 0
			END
		) AS against,
		SUM (
			CASE
				WHEN POSITION = 'abstention' THEN 1
				ELSE 0
			END
		) AS abstention
	FROM positions
	JOIN meps ON mep_vote=meps.vote_id
	GROUP BY rollcall, meps.eugroup
) q
LEFT JOIN eugroups ON eugroups.name=eugroup AND "primary"=true ON CONFLICT DO NOTHING;
```

(note: "for" is a terrible name for a column, it needs to be quoted otherwise sql panic)

## query to use:


``` js
const d = knex
	.select(knex.raw("eugroups.name, count(*), sum(case when (position != majority) then 1 else 0 end) as diff"))
	.from("groupmajority")
	.join("positions","positions.rollcall","groupmajority.rollcall")
	.join("meps","positions.mep_vote","meps.vote_id")
	.joinRaw("join eugroups on meps.eugroup = eugroups.name or eugroups.code='greens/efa'")
	.whereRaw("groupmajority.eugroup = eugroups.id")
	.andWhere("ep_id",id)
	.groupBy("eugroups.name");
```

/var/www/greenvote/api/mep/controllers/mep.js

as used there:

https://green.mepwatch.eu/mep/?id=197826


## Things to fix:

Sometimes, what the party wants is not clear, it should not consider that a vote has a majority/clear instruction if the meps as split (none of the for, against nor abstention > 66%)



