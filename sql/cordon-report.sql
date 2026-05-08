SELECT
  COUNT(*)     AS votes_together,
  r.ref        AS reference,
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
  AND (
    (sd.majority IS NOT NULL  AND sd.majority  != ppe.majority)
    OR (ren.majority IS NOT NULL AND ren.majority != ppe.majority)
  )
GROUP BY rep.title, r.ref
ORDER BY votes_together DESC;
