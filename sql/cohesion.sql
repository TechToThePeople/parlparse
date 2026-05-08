SELECT
  eugroup,
  ROUND(AVG(cohesion), 1) AS avg_cohesion,
  COUNT(*)                AS total_votes
FROM groupmajority
GROUP BY eugroup
ORDER BY avg_cohesion DESC;
