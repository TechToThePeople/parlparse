#!/bin/bash
# Publish the generated CSVs to ../10/data.
#
# - `set -e`: a failed copy aborts instead of leaving a half-published set.
# - `[ -s ]`: an empty/missing CSV stops the run instead of overwriting good data.
# - copy to .tmp then mv: each file is either the old one or the complete new one,
#   never truncated by a crash mid-copy.
set -euo pipefail

dest=../10/data

for f in meps.csv text_tabled.csv item_rollcall.csv cordon.csv cordon-report.csv cordon-total.csv; do
  src="data/$f"
  if [ ! -s "$src" ]; then
    echo "aborting: $src is missing or empty" >&2
    exit 1
  fi
  if [ "$(awk 'END{print NR}' "$src")" -lt 2 ]; then
    echo "aborting: $src has a header but no rows" >&2
    exit 1
  fi
  cp "$src" "$dest/$f.tmp"
  mv "$dest/$f.tmp" "$dest/$f"
  echo "published $f"
done
