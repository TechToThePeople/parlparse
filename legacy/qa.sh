## handle the attendance side (with mepid)
q 'select name,id,min(date) first, max(date) last from data/mep_attendance.csv group by name,id' -d, -H -O > data/attendance_name.csv
q 'select name,count(*) as issue from data/attendance_name.csv group by name having issue>1' -d, -H -O > tmp/dupes.csv
#Khan,2 -- this one is the problem, the others have their first + last... most of the time
#López,2
#Mayer,2

# and now rollcalls (with voteid), contains duplicates
q 'select mep,mepid from data/mep_rollcall.csv group by mep' -d, -H -O > data/rollcall_name.csv 

q "select mepid,id,name from data/rollcall_name.csv r join data/attendance_name.csv a where r.mep=a.name and name not in (select name from tmp/dupes.csv)" -d, -H -O > data/mepidmatch.csv
#deal with Jan Keller -> Keller Jan mapping
q "select substr(name, 1, instr(name,' ') -1) first, substr(name, instr(name,' ') +1) last, name, id from data/attendance_name.csv where instr(name,' ') > 0" -d, -H -O > tmp/attendance_splitname.csv
q "select mepid,id,name from data/rollcall_name.csv r join tmp/attendance_splitname.csv a where r.mep=last || ' ' || first" -d, -H >> data/mepidmatch.csv
#mapping only on last name, if not mapped yet
q "select r.mepid,a.id,mep,a.name from data/rollcall_name.csv r left join data/mepidmatch.csv m on m.mepid=r.mepid join tmp/attendance_splitname.csv a where r.mep=last and m.id is null" -d, -H >> data/mepidmatch.csv

## prepare for manual fixing, for multiple firstnames
#q 'select * from data/attendance_name.csv where id in (124737,1351,124970,96848,191693,102887,2119,2128)' -d, -H -O > data/attendance_manualmatch.csv
q 'select * from data/attendance_name.csv where id in (124737)' -d, -H -O > data/attendance_manualmatch.csv


## Quality and verifications 

# list of all meps that voted (redondant)
#!! it's the same file as data/rollcall_name?!
#q 'select mepid,mep,`group`,count(*) voted from data/mep_rollcall.csv group by mep,mepid' -d, -H -O > data/mep_voting.csv
# missing mapping
#todo we are using the result (meps.csv) to get that list. does it mean we need to run twice?
#q 'select v.* from data/rollcall_name.csv v left join data/meps.csv on mepid=voteid where voteid is null' -d, -H -O > tmp/vote_unmatched.csv
## add the missing ones?
#q 'select mepid,id,name from tmp/vote_unmatched.csv v join tmp/attendance_splitname.csv a on v.mep=a.last' -d, -H >> data/mepidmatch.csv
## are we missing a few still?
#q 'select v.* from tmp/vote_unmatched.csv v left join tmp/attendance_splitname.csv a on v.mep=a.last where id is null' -d, -H

#lets catch them
#q "select mepid,id,name from  data/attendance_manualmatch.csv m left join tmp/vote_unmatched.csv v on replace(name,rtrim(name,replace(name,' ','')), '')= substr(mep, 1, instr(mep,' ') -1)" -d, -H >> data/mepidmatch.csv

#fuck it, manual fix
#voteid,epid,name
echo "6744,188624,Khan" >> data/mepidmatch.csv
echo "0,2109,Crowley" >> data/mepidmatch.csv
echo "6581,124962,Khan" >> data/mepidmatch.csv
echo "6371,124737,Rodrigues" >> data/mepidmatch.csv
#echo "6648,125042,López" >> data/mepidmatch.csv
#echo "5173,23868,Beňová" >> data/mepidmatch.csv
#list of meps with voteid
q 'select distinct m.*, mepid as voteid from /var/www/ep/data/meps.all.csv m join data/mepidmatch.csv on epid=id order by id' -d, -H -O > data/meps.csv
# or even without voteid
#q 'select distinct m.*, mepid as voteid from /var/www/ep/data/meps.all.csv m left join data/mepidmatch.csv on epid=id where term=8 order by epid' -d, -H -O > data/meps.csv

# final data check
q 'select v.* from data/rollcall_name.csv v left join data/meps.csv on mepid=voteid where voteid is null' -d, -H
q 'select voteid,count(*) c from data/meps.csv group by voteid having c >1' -d, -H


#q 'select a.id mepid,mepid as voteid,mep as name from data/mep_rollcall.csv r join data/mep_attendance.csv a on a.name=r.mep group by a.name' -d, -H -O > data/mepidmatch.csv
# check if all the rollcalls are published as xml
#q 'select reference as xml_rollcall_missing from data/rollcall.csv where extensions not  like "%xml%"' -d, -H -O
