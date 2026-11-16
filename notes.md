# notes: matching MEP ids

Historical notes from the term-8 era, still the reference for the hardest part of
this repo: the EP uses **two unrelated ids per MEP** — one everywhere in their
publication (attendance lists, the mep pages), one inside the voting system.
Nothing published links them, so they are matched by name.

The matching lives in `qa.sh` (name → `data/mepidmatch.csv`) and the result is
copied into `meps.vote_id`; votes join as `positions.mep_vote = meps.vote_id`.
Run `sh qa.sh` twice (the second run catches what the first one added), then look
at the leftovers at the end of the script.

Manual fixes go straight into `data/mepidmatch.csv`, e.g.:

```
6744,188624,Khan
6371,124737,Rodrigues
```

Current state of the data — instead of the hardcoded counts that used to be
here, ask the database:

```sh
node -e 'const db=require("./lib/db");db("rollcalls").select("method").count("* as c").groupBy("method").then(console.log)'
node -e 'const db=require("./lib/db");db.raw("select count(distinct plenary) days, count(*) rollcalls from rollcalls").then(r=>console.log(r))'
```

OpenAPI imports (`openapi/decisions.js`) do not need this matching for counts, but
per-MEP `positions` still come exclusively from the RCV XML and therefore still
depend on it. `openapi/decisions.js` can also fill `requested_by` for a roll-call
even when no individual votes were published.

# I'm not a number

So it turns out that to, for instance, display MEPs only from a single country,
you need to, well, have the vote of the mep, and the country of the said mep.

Sounds easy, right? Surely, the EP does give a badge number or some kind of
unique identifier that would be used both on for the vote and for the list of
meps by country and filtering the list of votes from the polish MEPs would be a
2 min job?

Not so fast, each mep has some kind of unique number. Actually, they have two,
one used everywhere (eg list by country) and one for the votes, and they aren't
matching. So it's getting slightly more complicated, you need first to build a
correspondence between the "regular" identifier and the "vote only" id for each
of the MEPs. Surely, it's something that the EP has and is using daily, surely?

Match by name, the hard way
Match on lastname, attendance (that use the normal id) and vote (the secret id)

what's in a name? (The Earl of) Dartmouth

similar names:
On the rollcall,
```
369:Keller Jan,6326
370:Keller Ska,5908
```
ag keller data/rollcall_name.csv
```
369:Keller Jan,6326
370:Keller Ska,5908
```
xavier@kessel:/var/www/mepwatch/parlparse$ ag keller data/attendance_name.csv
```
355:Jan Keller,124695
732:Ska Keller,96734
```

matching rollcalls and meps information is a nightmare, eg
got married?
```
6605,124993,Valero
6605,124993,Ceballos
```

```
5173,23868,Flašíková Beňová
5173,23868,Beňová
6638,125032,Valcárcel
6638,125032,Valcárcel Siso
```

matching on name with:
```
6677,Rodrigues Liliana,for,S&D,92926
6371,Rodrigues Maria João,for,S&D,92926
6649,Rodríguez-Piñero Fernández,for,S&D,92926
6357,Rozière,for,S&D,92926
```

and you need to take into account the date of the vote too, name isn't enough

Wadjid Khan vs Afzal KHAN

and matching on names. What is first or last? with

Martin Dominique or Simon Peter
