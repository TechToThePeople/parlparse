-- mep_sitting_stats: per MEP and per sitting, how many roll-call votes were held
-- and how many that MEP voted in.
--
-- Presence is a daily register (`attendances`), so "could have taken part" is
-- every RCV of that sitting and "did" is whether `positions` has a row for it.
-- Only RCV votes can be counted (hand, electronic and secret votes publish no
-- per-MEP data) and an abstention counts as a vote cast.
--
-- status: attended | excused (from the register), present_unregistered (no row in
-- the register but votes in `positions`: the register is not complete, so the vote
-- is the better evidence of presence), absent (neither). A sitting whose
-- attendance list was never imported is left out entirely, so an empty figure
-- means "no register", not "0% present".
--
-- Rebuilt from scratch for every sitting that has a register, so re-running it is
-- the same as running it once.

DELETE FROM mep_sitting_stats WHERE plenary IN (
  SELECT p.id FROM plenaries p
   WHERE EXISTS (SELECT 1 FROM attendances a WHERE a.sitting_id = p.sitting_id)
);

INSERT INTO mep_sitting_stats (mep, plenary, status, rcv_held, rcv_voted)
SELECT m.id,
       p.id,
       CASE
         WHEN a.status IS NOT NULL THEN a.status
         WHEN COALESCE(v.n, 0) > 0 THEN 'present_unregistered'
         ELSE 'absent'
       END,
       rcv.n,
       COALESCE(v.n, 0)
  FROM plenaries p
  JOIN (SELECT plenary, count(*) AS n
          FROM rollcalls WHERE method = 'RCV' GROUP BY plenary) rcv
    ON rcv.plenary = p.id
  JOIN meps m
    ON m.term = 10
   AND m.start <= p.date
   AND (m.end IS NULL OR m.end >= p.date)
  LEFT JOIN attendances a
    ON a.sitting_id = p.sitting_id AND a.mep_id = m.ep_id
  LEFT JOIN (SELECT r2.plenary, po.mep_vote, count(*) AS n
               FROM positions po
               JOIN rollcalls r2 ON r2.id = po.rollcall
              WHERE r2.method = 'RCV'
              GROUP BY r2.plenary, po.mep_vote) v
    ON v.plenary = p.id AND v.mep_vote = m.ep_id
 WHERE EXISTS (SELECT 1 FROM attendances a2 WHERE a2.sitting_id = p.sitting_id);
