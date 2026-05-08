SELECT
  COUNT(*)                                                   AS votes_in_common,
  total_votes.count                                          AS total_votes,
  ROUND(100.0 * COUNT(*) / NULLIF(total_votes.count, 0), 1) AS pct_of_total
FROM groupmajority ecr
JOIN groupmajority esn       ON esn.rollcall = ecr.rollcall
JOIN groupmajority pfe       ON pfe.rollcall = ecr.rollcall
JOIN (
  SELECT COUNT(DISTINCT rollcall) AS count
  FROM groupmajority
  WHERE majority IS NOT NULL
) total_votes ON 1=1
WHERE ecr.eugroup = 'ECR'
  AND esn.eugroup = 'ESN'
  AND pfe.eugroup = 'PfE'
  AND ecr.majority IS NOT NULL
  AND esn.majority IS NOT NULL
  AND pfe.majority IS NOT NULL
  AND ecr.majority = esn.majority
  AND esn.majority = pfe.majority;
