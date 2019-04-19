# missing 2016-12-01 and a bunch of others
node index.js
node report.js
node download.js
node attendance.js
#node rollcall.js
node --max-old-space-size=2048 rollcall.js
# q 'select * from data/item_rollcall.csv order by identifier' -d, -H -O

sh qa.sh
sh qa.sh
