#!/bin/bash
date
node plenary.js -d -u 
node plenary.js -d-1 -u
node report.js
node csv.js
node cards.js
#node correction.js
sh prod.sh
