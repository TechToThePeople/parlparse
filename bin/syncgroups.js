"insert into eugroups (name,code,lang) (select eugroup as name, replace(replace(replace(lower(eugroup),'/',''),'&',''),' ','') as code , 'en' as lang  from meps group by eugroup)";

"insert into parties (name,code,lang) (select party as name, concat (country," -
  ",replace(replace(replace(lower(eugroup),'/',''),'&',''),' ','')) as code , country  from meps group by party,country)";
