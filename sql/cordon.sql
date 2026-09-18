SELECT
  ecr.rollcall,
  r.date,
  ecr.majority AS far_right_epp_position,
  rep.title    AS report_title,
  r.ref        AS reference,
  r.name       AS name,
  r."for"      AS for,
  r.against    AS against,
  r.abstention AS abstention,
  ppe.cohesion AS epp_cohesion
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
    AND (ren.majority IS NOT NULL AND ren.majority != ppe.majority)
  )
ORDER BY r.date DESC;
