# how does it fit together?

This scrapes the rollcalls of votes in the European Parliament as used in [mepwatch](https://mepwatch.eu). It is using a database to store the data in their intermediary form, but the end result as used by the data visualisation is all based on static files.

## MEPs

The rollcalls do not contain much information about each MEP we use for some analysis (eg no information about their country or their national party).

Before each plenary week, we should update the list of MEPs so the votes are all matching complete informations of the MEPs. We use the data from tttp.eu (itself an aggreate between the data on parltrack, wikimedia and a bunch of external sources).

_note: sometimes, MEPs vote before their profile is published on the EP website, we are trying to handle it by creating "placeholder" MEPs that are updated later_

## parsing the plenary rollcalls

Each rollcall is not published separately, but there is one file per day containing all the votes of the day (up to 600). The parliament doesn't notify nor publish on a timely fashion when there is a new plenary vote, but fortunately, each vote has a unique url that is easy to guess.

So the parser is checking regularly for each day if there is a file published (usually early in the PM on plenary days). If there is more than one voting session per day, the EP does update the file, so we check both for today (to get the votes as soon as possible) and yesterday (to catch potential updates of a second voting session).

    $node plenary.js --help

    $node plenary.js -d -u
    $node plenary.js -d-1 -u

plenary.js is containing the logic of finding the xml files, the parsing and processing of the xml is in lib/rollcall.js

tables and structures:
- plenaries: one record per day in the plenary that has votes (with rollcalls). In general, monday (very few votes) to thu in the plenary weeks, but with a lot of exceptions
- rollcalls: each "thing" being voted. it can be a report (law), a specific amendment, a bunch of amendments...
- positions: each individual MEP vote -for, against, abstain- (key:  MEP+rollcall)

_notes: 
- I never found a list of the text of each of these votes (beside the reports), eg finding what is the amendment text. Please let me know if you find it 
- the EP use different IDs for MEPs in their voting system than everywhere else. It's getting better, but you might still have a bit of logic/magic to connect the two IDs
- there are a lot of exceptions, for instance rollcalls that aren't publishing individual votes
- votes are related to a report (specific legislation), but some aren't (eg. budget or agenda)
- we parse the french version, that used to be more complete or faster updated. pretty much irrelevant because...
- the name of each rollcall is a mess, for instance the reports contain the full name of the report in 3 languages, and the name of the rapporteur, in a format that isn't parsable (one single string)_

## reports

Most of the votes are related to a report, A9-xx or B9-xx.
Some of the analysis are depending on the committee that was the source of that report, and in general extra information about it.

The key is their ref A9-xxx or B9-xxx
 
node report.js

## generate the static files and publish them
node csv.js
node cards.js
sh prod.sh




# notes

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
