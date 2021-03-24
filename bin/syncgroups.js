"insert into eugroups (name,code,lang) (select eugroup as name, replace(replace(replace(lower(eugroup),'/',''),'&',''),' ','') as code , 'en' as lang  from meps group by eugroup)";
