-- huntlot schema, v1
--
-- Design: `jobs` is shared (a posting is the same for everyone), while
-- `user_jobs` holds what's personal: your fit score, status and notes.
-- That split is what lets this become a multi-user app later without a rewrite.

create table users (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

create table jobs (
  id                     bigint generated always as identity primary key,
  source                 text not null,          -- greenhouse | lever | ashby | himalayas | remotive | remoteok
  company                text not null,
  external_id            text not null,          -- the id the source uses
  title                  text not null,
  location               text not null default '',
  -- Can someone in India do this job?
  --   worldwide: remote, anywhere   india: remote, India allowed   foreign: remote, but not from India
  --   unknown: remote, restrictions unclear   onsite: has to be in an office
  remote_scope           text not null check (remote_scope in ('worldwide', 'india', 'foreign', 'unknown', 'onsite')),
  employment_type        text,                   -- full-time | intern | contract | part-time (when the source says)
  url                    text not null,
  apply_url              text,
  description            text not null,
  salary_text            text,
  salary_min_monthly_inr integer,
  posted_at              timestamptz,            -- when the company first published it
  first_seen_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  closed_at              timestamptz,            -- gone from the company's board
  unique (source, company, external_id)          -- what makes re-fetching an upsert, not a duplicate
);

create type job_status as enum ('new', 'shortlisted', 'skipped', 'applied', 'interviewing', 'rejected', 'offer');

create table user_jobs (
  user_id        bigint not null references users (id) on delete cascade,
  job_id         bigint not null references jobs (id) on delete cascade,
  score          integer not null,               -- 0-100, local rules
  score_reasons  jsonb not null default '{}',
  hidden_reason  text,                           -- set when a filter (or the AI) rules it out; null = a match
  ai             jsonb,                          -- the LLM's assessment, see src/llm/assess.ts
  ai_model       text,
  ai_at          timestamptz,
  status         job_status not null default 'new',
  notes          text,
  updated_at     timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- `huntlot list` asks: my visible jobs, best first. A partial index covers exactly that.
create index user_jobs_matches on user_jobs (user_id, score desc) where hidden_reason is null;

create table llm_usage (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  provider       text not null,                  -- openai | ollama
  model          text not null,
  purpose        text not null,                  -- e.g. assess
  input_tokens   integer not null,
  output_tokens  integer not null,
  cost_usd       numeric(10, 6) not null default 0
);
