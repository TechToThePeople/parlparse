q 'select mep,mepid from data/mep_rollcall.csv group by mep' -d, -H -O > data/rollcall_name.csv 
q 'select name,id from data/mep_attendance.csv group by name' -d, -H -O > data/attendance_name.csv

q "select mepid,id,name from data/rollcall_name.csv r join data/attendance_name.csv a where r.mep=a.name" -d, -H -O > data/mepidmatch.csv
#deal with Jan Keller -> Keller Jan mapping
q "select substr(name, 1, instr(name,' ') -1) first, substr(name, instr(name,' ') +1) last, name, id from data/attendance_name.csv where instr(name,' ') > 0" -d, -H -O > tmp/attendance_splitname.csv
q "select mepid,id,name from data/rollcall_name.csv r join tmp/attendance_splitname.csv a where r.mep=last || ' ' || first" -d, -H >> data/mepidmatch.csv
## prepare for manual fixing
q 'select * from data/attendance_name.csv where id in (124737)' -d, -H -O > data/attendance_manualmatch.csv

#beware, contains duplicates 

## Quality and verifications
# list of all meps that voted
q 'select mepid,mep,group from data/mep_rollcall.csv group by mep' -d, -H -O > data/mep_voting.csv

# missing mapping
q 'select v.* from data/mep_voting.csv v left join data/meps.csv on mepid=voteid left join data/attendance_splitname.csv on  mep=first where voteid is null' -d, -H -O > tmp/vote_unmatched.csv

## add the missing ones?
q 'select mepid,id,name from tmp/vote_unmatched.csv v join tmp/attendance_splitname.csv a on v.mep=a.last' -d, -H >> data/mepidmatch.csv

## are we missing a few still?
q 'select v.* from tmp/vote_unmatched.csv v left join tmp/attendance_splitname.csv a on v.mep=a.last where id is null' -d, -H

#lets catch them
q "select mepid,id,name from  data/attendance_manualmatch.csv m left join tmp/vote_unmatched.csv v on replace(name,rtrim(name,replace(name,' ','')), '')= substr(mep, 1, instr(mep,' ') -1)" -d, -H >> data/mepidmatch.csv


#list of meps with voteid
q 'select distinct m.*, mepid as voteid from /var/www/ep/data/meps.all.csv m join data/mepidmatch.csv on epid=id' -d, -H -O > data/meps.csv


#q 'select a.id mepid,mepid as voteid,mep as name from data/mep_rollcall.csv r join data/mep_attendance.csv a on a.name=r.mep group by a.name' -d, -H -O > data/mepidmatch.csv
# check if all the rollcalls are published as xml
#q 'select reference as xml_rollcall_missing from data/rollcall.csv where extensions notnot  like "%xml%"' -d, -H -O
