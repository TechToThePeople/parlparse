const parties = `INSERT INTO parties (name, country, code, term, created_by, updated_by, created_at, updated_at)
SELECT 
    m.party as name,
    m.country,
    -- Create code as country_party (lowercase, no spaces)
    LOWER(m.country || '_' || REPLACE(REPLACE(m.party, ' ', '_'), '-', '_')) as code,
    m.term,
    NULL as created_by,
    NULL as updated_by,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM (
    SELECT DISTINCT 
        party,
        country,
        term
    FROM meps
    WHERE party IS NOT NULL 
      AND party != ''
      AND country IS NOT NULL
      AND country != ''
) m
LEFT JOIN parties p ON p.name = m.party 
    AND p.country = m.country 
    AND (p.term = m.term OR (p.term IS NULL AND m.term IS NULL))
WHERE p.id IS NULL;`;
/*
const groups = `INSERT INTO eugroups (code, name, lang, description, primary, term, created_by, updated_by, created_at, updated_at)
SELECT 
    DISTINCT eugroup as code,
    eugroup as name,
    'en' as lang,
    NULL as description,
    1 as "primary",
    term,
    NULL as created_by,
    NULL as updated_by,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM meps
WHERE eugroup IS NOT NULL 
  AND eugroup != ''
  AND NOT EXISTS (
    SELECT 1 FROM eugroups WHERE eugroups.code = meps.eugroup
  );`;
*/
--First, make sure eugroups has entries for all groups in meps
const groups = `INSERT INTO eugroups (code, name, lang, `primary`, term, created_at, updated_at)
SELECT 
    DISTINCT m.eugroup as code,
    m.eugroup as name,  -- Or you might want proper names
    'en' as lang,
    1 as `primary`,
    10 as term,  -- Assuming current term
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM meps m
WHERE m.eugroup IS NOT NULL 
  AND m.eugroup != ''
  AND NOT EXISTS (
    SELECT 1 FROM eugroups eg WHERE eg.code = m.eugroup
  );

-- Now update the meps counts in eugroups
UPDATE eugroups 
SET meps = (
    SELECT COUNT(*) 
    FROM meps m 
    WHERE m.eugroup = eugroups.code
    AND m.eugroup IS NOT NULL 
    AND m.eugroup != ''
)
WHERE code IN (SELECT DISTINCT eugroup FROM meps WHERE eugroup IS NOT NULL)`;

const groupmajority = `WITH test_stats AS (
    SELECT 
        p.eugroup,
        p.rollcall,
        COUNT(*) as total_votes,
        SUM(CASE WHEN p.position = 'FOR' THEN 1 ELSE 0 END) as for_votes,
        SUM(CASE WHEN p.position = 'AGAINST' THEN 1 ELSE 0 END) as against_votes,
        SUM(CASE WHEN p.position = 'ABSTENTION' THEN 1 ELSE 0 END) as abstention_votes
    FROM positions p
    WHERE p.eugroup IS NOT NULL 
      AND p.eugroup != ''
      AND p.rollcall IS NOT NULL
      AND p.position IN ('FOR', 'AGAINST', 'ABSTENTION')
    GROUP BY p.eugroup, p.rollcall
    HAVING COUNT(*) > 0
    LIMIT 5
)
SELECT * FROM test_stats;`;
