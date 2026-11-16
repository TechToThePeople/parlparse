#!/bin/bash
# Full data update: db -> openapi/XML imports -> CSVs -> publish to ../10.
date

# 1. schema first: openapi/decisions.js writes method/vote_type/requested_by and
#    csv.js reads reports.creator, both added by migrations. Everything below
#    assumes the new schema, so stop here if it fails.
npm run -s db:migrate || exit 1

# 2. all decisions of the day (roll-call + hand + electronic) from the OpenAPI
node openapi/decisions.js -d-1
node openapi/decisions.js -d0

# 3. per-MEP positions from the RCV XML
node positions.js -d -u
node positions.js -d-1 -u

# 4. VOT XML: references, names, committees, vote requests and who asked
node openapi/vot-xml.js "$(date -d '-1 day' +%F)"
node openapi/vot-xml.js "$(date +%F)"

# 5. reports rows for any new reference, then their committee/group creators
node openapi/reports-backfill.js
node report.js
node openapi/report-creator.js

# 6. static files
node csv.js
node cards.js
npm run -s majority:csv
sh prod.sh
