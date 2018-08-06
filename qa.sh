q 'select a.id mepid,mepid as voteid,mep as name from data/mep_rollcall.csv r join data/mep_attendance.csv a on a.name=r.mep group by a.name' -d, -H -O > data/mepidmatch.csv
# check if all the rollcalls are published as xml
q 'select reference as xml_rollcall_missing from data/rollcall.csv where extensions like "%xml%"' -d, -H -O
