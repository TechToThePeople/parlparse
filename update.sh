#!/bin/bash
# Full data update: schema, then only what the API says is missing, then publish.
#
# The whole check is eight requests (four documents for each of the last two
# sittings). If nothing is published, openapi/update.js stops there and no other
# request is made — safe to run every few minutes. When a document is new it
# imports it, then refreshes the agenda of the next sittings, the report rows
# (with their procedure and subjects), the CSVs, the cards of those dates and the
# SQL aggregates, and finally publishes to ../10/data.
#
# The old step-by-step version is kept in legacy/update.sh for reference.
date

# 1. schema first: the importers and csv.js assume the current migrations
npm run -s db:migrate || exit 1

# 2. is anything new? import it (the default), then the derived files
node openapi/update.js --days=2 --no-forthcoming "$@"

# 3. static files -> ../10/data (a local copy, no request)
sh prod.sh
