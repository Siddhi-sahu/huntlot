-- Newer postings rank higher: applying in the first day or two means a recruiter sees you
-- before the pile gets big. This can't be stored in user_jobs.score, because a job posted
-- "2 hours ago" is "3 days ago" by Friday, so it's computed at query time.
--
-- `stable` (not `immutable`) because the result depends on now(), which is fixed within one
-- query but changes between queries.
create function freshness_bonus(posted_at timestamptz) returns integer
language sql stable as $$
  select case
    when posted_at is null                      then 0
    when posted_at > now() - interval '1 day'   then 15
    when posted_at > now() - interval '3 days'  then 10
    when posted_at > now() - interval '7 days'  then 5
    when posted_at > now() - interval '14 days' then 0
    when posted_at > now() - interval '30 days' then -5
    else -10
  end
$$;
