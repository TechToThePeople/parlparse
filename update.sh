#!/bin/bash
# Full data update: db -> openapi/XML imports -> CSVs -> publish to ../10.
date

# 1. schema first: openapi/plenary.js writes method/vote_type/requested_by and
#    csv.js reads reports.creator, both added by migrations. Everything below
#    assumes the new schema, so stop here if it fails.
npm run -s db:migrate || exit 1

# 2. all decisions of the day (roll-call + hand + electronic) from the OpenAPI
node openapi/plenary.js -d-1
node openapi/plenary.js -d0

# 3. per-MEP positions from the RCV XML
node plenary.js -d -u
node plenary.js -d-1 -u

# 4. reports and their committee/group creators
node report.js
node openapi/report-creator.js

# 5. static files
node csv.js
node cards.js
npm run -s majority:csv
sh prod.sh
