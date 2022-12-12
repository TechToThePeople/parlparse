## what the party wanted?

the aim is to identify for each vote what the eu groups wanted.

this will be used after to show for each mep when they voted with their group of rebelled

## big script to update:


insert into groupmajority
( majority,cohesion,rollcall,eugroup,total,"for",against, abstention)
select case when ("for" >= against and "for" >= abstention) then 'for' when (against >= "for" and against >= abstention) then 'against'
 when (abstention >= against and abstention >= "for") then 'abstention' end as majority, round(100.0* GREATEST("for",against,abstention)/total) cohesion
, rollcall,eugroups.id eugroup,total,"for",against, abstention
from ( select rollcall, meps.eugroup, count(*) as total, sum (case when position = 'for' then 1 else 0 end) as for,
sum (case when position = 'against' then 1 else 0 end) as against,
sum (case when position = 'abstention' then 1 else 0 end) as abstention
from positions 
join meps on mep_vote=meps.vote_id group by rollcall, meps.eugroup) q
left join eugroups on eugroups.name=eugroup on conflict do nothing;

(note: "for" is a terrible name for a column, it needs to be quoted otherwise sql panic)

## query to use:


    const d= knex
      .select(knex.raw("eugroups.name, count(*), sum(case when (position != majority) then 1 else 0 end) as diff"))
      .from("groupmajority")
      .join("positions","positions.rollcall","groupmajority.rollcall")
      .join("meps","positions.mep_vote","meps.vote_id")
      .joinRaw("join eugroups on meps.eugroup = eugroups.name or eugroups.code='greens/efa'")
      .whereRaw("groupmajority.eugroup = eugroups.id")
      .andWhere("ep_id",id)
      .groupBy("eugroups.name");


/var/www/greenvote/api/mep/controllers/mep.js

as used there:

https://green.mepwatch.eu/mep/?id=197826


## Things to fix:

Sometimes, what the party wants is not clear, it should not consider that a vote has a majority/clear instruction if the meps as split (none of the for, against nor abstention > 66%)



