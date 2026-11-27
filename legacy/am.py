#!/usr/bin/env python

import json,sys

res = {}
for line in sys.stdin:
    line = line[1:-1]
    if line == '': break
    rec = json.loads(line)
    if 'vote_ids' not in rec: continue
    for voteid in rec['vote_ids']:
        if voteid not in res:
            res[voteid] = [{k:v for k, v in rec.items() if k not in { "changes", "dossier", "id", "peid"}}]
        else:
            res[voteid].append({k:v for k, v in rec.items() if k not in { "changes", "dossier", "id", "peid"}})

print(json.dumps(res))
