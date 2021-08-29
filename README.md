CREATE TABLE `positions` (
  `id` integer not null primary key autoincrement,
  `rollcall` integer not null,
  `mep_vote` integer not null,
  `position` varchar(20) null,
  UNIQUE(mep_vote,rollcall)
);

CREATE UNIQUE INDEX IF NOT EXISTS position_mep ON positions(mep_vote, rollcall

//`id` integer not null primary key autoincrement, 
CREATE TABLE `attendances` (

`status` varchar(30) null, `mep_id` integer not null, `date` date not null, UNIQUE(mep_id,date));

CREATE UNIQUE INDEX IF NOT EXISTS position_group ON groupmajority ( eugroup, rollcall);


insert into groupmajority( majority,cohesion,rollcall,eugroup,total,"for",against, abstention) (select case when ("for" >= against and "for" >= abstention) then 'for' when (against >= "for" and against >= abstention) then 'against' when (abstention >= against and abstention >= "for") then 'abstention' end as majority, round(100.0* GREATEST("for",against,abstention)/total) cohesion, rollcall,eugroups.id eugroup,total,"for",against, abstention from ( select rollcall, eugroup, count(*) as total, sum (case when position = 'for' then 1 else 0 end) as for,sum (case when position = 'against' then 1 else 0 end) as against,sum (case when position = 'abstention' then 1 else 0 end) as abstention from positions join meps on mep_vote=meps.vote_id group by rollcall, eugroup) q left join eugroups on eugroups.name=eugroup) on conflict do nothing;


you need the latest version of q (>1.4 to work -bug on escaping ")
The data published by the EP needs some massaging to be extracted in a useful format.

These are the steps:

0) prepare the list of meps
cd /var/www/ep/
gulp
node script/aliases.js

1) parse the pages to get the list of the documents

- node index.js : parse and fetch all the attendance lists, votes and rollcall documents
- node report.js : the reports and motions tabled (A8-xx B8-xxx)

2) once that's done, you need to download the xml files

- node download.js (to save space, it gzips them)

3) once that's done, parse each xml to extract the data within them

- node attendance.js
- node rollcall.js to generate data/item_rollcall.csv and data/mep_rollcall.csv

pay attention to the mistakes, eg:
2018-07-04 12:56:20 for 92449 error processed 286/256 at http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2018/07-04/liste_presence/P8_PV(2018)07-04(RCV)_XC.xml

It means you have more registered votes than the total mentionned in the file.

4) once that's done, use the attendance lists (that contains the "normal" meps id) to match them with the mep id used in the rollcalls (nope, they aren't the same)

sh qa.sh
sh qa.sh
(yes, twice)

DUPLICATE,Khan,S&D,1
6782,Packet,ECR,530
6371,Rodrigues Maria João,S&D,7036

see, that wasn't that difficult, wasn't it? (</irony>)

5) before git pushing, 

gzip data/mep_rollcall.csv 

6) 
cd /var/www/mepwatch
sh update.sh
