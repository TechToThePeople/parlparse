q 'select mep,mepid from data/mep_rollcall.csv group by mep' -d, -H -O > data/rollcall_name.csv 
q 'select name,id from data/mep_attendance.csv group by name' -d, -H -O > data/attendance_name.csv

q "select mepid,id,name from data/rollcall_name.csv r join data/attendance_name.csv a where r.mep=a.name" -d, -H -O > data/mepidmatch.csv

#q 'select a.id mepid,mepid as voteid,mep as name from data/mep_rollcall.csv r join data/mep_attendance.csv a on a.name=r.mep group by a.name' -d, -H -O > data/mepidmatch.csv
# check if all the rollcalls are published as xml
#q 'select reference as xml_rollcall_missing from data/rollcall.csv where extensions like "%xml%"' -d, -H -O
