state of the data:
they have been 233 days of plenary (according to published rollcalls)
185 of these have at least one rollcall
69 of these have it published in a computer readable format.
After a week of exchange, they are published, but in french, not in english, and two are still missing.
After a bit more exchange, the last two missing ones are added

# I'm not a number
So it turns out that to, for instance, display MEPs only from a single country, you need to, well, have the vote of the mep, and the country of the said mep.

Sounds easy, right? Surely, the EP does give a badge number or some kind of unique identifier that would be used both on for the vote and for the list of meps by country and filtering the list of votes from the polish MEPs would be a 2 min job?

Not so fast, each mep has some kind of unique number. Actually, they have two, one used everywhere (eg list by country) and one for the votes, and they aren't matching. So it's getting slightly more complicated, you need first to build a correspondence between the "regular" identifier and the "vote only" id for each of the MEPs. Surely, it's something that the EP has and is using daily, surely?

Match by name, the hard way
Match on lastname, attendnance (that use the normal id) and vote (the secret id)

what's in a name? (The Earl of) Dartmouth

similar names:
On the rollcall,
369:Keller Jan,6326
370:Keller Ska,5908

ag keller data/rollcall_name.csv 
369:Keller Jan,6326
370:Keller Ska,5908
xavier@kessel:/var/www/mepwatch/parlparse$ ag keller data/attendance_name.csv 
355:Jan Keller,124695
732:Ska Keller,96734



matching rollcalls and meps information is a nightmare, eg
got married?
6605,124993,Valero
6605,124993,Ceballos

5173,23868,Flašíková Beňová
5173,23868,Beňová
6638,125032,Valcárcel
6638,125032,Valcárcel Siso

matching on name with:
6677,Rodrigues Liliana,for,S&D,92926
6371,Rodrigues Maria João,for,S&D,92926
6649,Rodríguez-Piñero Fernández,for,S&D,92926
6357,Rozière,for,S&D,92926

and you need to take into account the date of the vote too, name isn't enough
Wadjid Khan vs Afzal KHAN
and matching on names. What is first or last? with 
Martin Dominique or Simon Peter

