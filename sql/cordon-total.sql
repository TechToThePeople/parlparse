-- The matching set and the denominator are computed once in CTEs. The previous
-- form joined the total-votes subquery with `ON 1=1`, which made SQLite re-run
-- COUNT(DISTINCT rollcall) once per outer row (46s instead of ~30ms).
WITH matching AS (
  SELECT ecr.rollcall
  FROM groupmajority ecr
  JOIN groupmajority esn ON esn.rollcall = ecr.rollcall
  JOIN groupmajority pfe ON pfe.rollcall = ecr.rollcall
  WHERE ecr.eugroup = 'ECR'
    AND esn.eugroup = 'ESN'
    AND pfe.eugroup = 'PfE'
    AND ecr.majority IS NOT NULL
    AND esn.majority IS NOT NULL
    AND pfe.majority IS NOT NULL
    AND ecr.majority = esn.majority
    AND esn.majority = pfe.majority
),
totals AS (
  SELECT COUNT(DISTINCT rollcall) AS total_votes
  FROM groupmajority
  WHERE majority IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM matching)                              AS votes_in_common,
  totals.total_votes,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM matching) / NULLIF(totals.total_votes, 0),
    1
  )                                                            AS pct_of_total
FROM totals;
