DELETE FROM groupmajority;

INSERT INTO groupmajority (
  eugroup, rollcall, majority, cohesion, total, `for`, against, abstention, created_at, updated_at
)
SELECT
  agg.eugroup,
  agg.rollcall,
  CASE
    WHEN ROUND(100.0 * ABS(agg.for_count - agg.against_count - agg.abstention_count) / NULLIF(agg.total_count, 0)) < 50
      THEN NULL
    WHEN agg.for_count >= agg.against_count AND agg.for_count >= agg.abstention_count THEN 'for'
    WHEN agg.against_count >= agg.for_count AND agg.against_count >= agg.abstention_count THEN 'against'
    ELSE 'abstention'
  END                                                  AS majority,
  CAST(ROUND(
    100.0 * ABS(agg.for_count - agg.against_count - agg.abstention_count)
    / NULLIF(agg.total_count, 0)
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
    SUM(CASE WHEN p.position = 'for' THEN 1 ELSE 0 END)        AS for_count,
    SUM(CASE WHEN p.position = 'against' THEN 1 ELSE 0 END)    AS against_count,
    SUM(CASE WHEN p.position = 'abstention' THEN 1 ELSE 0 END) AS abstention_count,
    COUNT(*)                                                    AS total_count
  FROM positions p
  WHERE p.eugroup IS NOT NULL
    AND p.position IS NOT NULL
  GROUP BY p.eugroup, p.rollcall
) agg;
