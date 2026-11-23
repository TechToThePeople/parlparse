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

# 3. per-MEP positions from the RCV XML. --force is required: step 2 already
#    created the plenaries row, which positions.js would otherwise take as
#    "already processed" and skip before importing any positions.
node positions.js -d -u -f
node positions.js -d-1 -u -f

# 4. VOT XML: references, names, committees, vote requests and who asked
node openapi/vot-xml.js "$(date -d '-1 day' +%F)"
node openapi/vot-xml.js "$(date +%F)"

# 5. attendance list of the sitting (who was present, who was excused).
#    A cached file is imported too, so a date downloaded but never parsed is fixed
#    by simply running this again.
node openapi/att.js "$(date -d '-1 day' +%F)"
node openapi/att.js "$(date +%F)"

# 6. the agenda of the next sittings (what will be voted, and on which report),
#    then reports rows for the new references — including the stubs the agenda
#    created — and their committee/group creators
node openapi/agenda.js --upcoming
node openapi/reports-backfill.js
node report.js
node openapi/report-creator.js

# 7. static files
node csv.js
node cards.js
npm run -s majority:csv
sh prod.sh
