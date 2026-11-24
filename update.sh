#!/bin/bash
# Full data update: schema, then only what the API says is missing, then publish.
#
# The import steps live in openapi/update.js — it asks the API whether the RCV,
# ATT and VOT documents of the last sittings are out, imports only those, and
# rebuilds the CSVs and cards when something actually arrived. The old
# step-by-step version is kept in legacy/update.sh for reference.
date

# 1. schema first: the importers and csv.js assume the current migrations
npm run -s db:migrate || exit 1

# 2. refresh the agenda of the next sittings — planned votes and their times,
#    which the site shows before anything is published
node openapi/agenda.js --upcoming

# 3. import what is new for the last two sittings (today and before).
#    --sync is what makes it import instead of only report.
#    --no-forthcoming: a sitting that has not happened has no documents.
node openapi/update.js --days=2 --no-forthcoming --sync

# 4. report rows, their procedure and its subjects (incremental, own flags)
node openapi/report.js

# 5. static files -> ../10/data
sh prod.sh
