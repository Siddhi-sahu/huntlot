import type pg from "pg";
import type { RemoteScope } from "../match/location.js";
import type { Score } from "../match/score.js";
import type { RawJob } from "../sources/types.js";
import { query } from "./index.js";

/** Find-or-create the user row for this email. `on conflict ... do update` makes it return the id either way. */
export async function ensureUser(email: string): Promise<number> {
  const [row] = await query<{ id: number }>(
    `insert into users (email) values ($1)
     on conflict (email) do update set email = excluded.email
     returning id`,
    [email],
  );
  return row!.id;
}

/**
 * Insert a job, or refresh it if we've seen it before (same source + company + external_id).
 * `xmax = 0` is a Postgres trick: it's 0 only for a freshly inserted row, so it tells us "new or updated".
 */
export async function upsertJob(c: pg.PoolClient, j: RawJob, scope: RemoteScope): Promise<{ id: number; inserted: boolean }> {
  const { rows } = await c.query<{ id: number; inserted: boolean }>(
    `insert into jobs (source, company, external_id, title, location, remote_scope, employment_type,
                       url, apply_url, description, salary_text, salary_min_monthly_inr, posted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (source, company, external_id) do update set
       title = excluded.title, location = excluded.location, remote_scope = excluded.remote_scope,
       employment_type = excluded.employment_type, url = excluded.url, apply_url = excluded.apply_url,
       description = excluded.description, salary_text = excluded.salary_text,
       salary_min_monthly_inr = excluded.salary_min_monthly_inr, posted_at = excluded.posted_at,
       last_seen_at = now(), closed_at = null
     returning id, (xmax = 0) as inserted`,
    [j.source, j.company, j.externalId, j.title, j.location, scope, j.employmentType ?? null, j.url,
     j.applyUrl ?? null, j.description, j.salaryText ?? null, j.salaryMinMonthlyInr ?? null, j.postedAt ?? null],
  );
  return rows[0]!;
}

/**
 * Save your score for a job. Your status/notes/AI assessment are left alone on re-runs.
 * A job the AI ruled out stays hidden even if the rules would now keep it.
 */
export async function upsertMatch(c: pg.PoolClient, userId: number, jobId: number, s: Score, hiddenReason: string | null) {
  await c.query(
    `insert into user_jobs (user_id, job_id, score, score_reasons, hidden_reason)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, job_id) do update set
       score = excluded.score,
       score_reasons = excluded.score_reasons,
       hidden_reason = case when user_jobs.hidden_reason like 'ai:%' then user_jobs.hidden_reason
                            else excluded.hidden_reason end,
       updated_at = now()`,
    [userId, jobId, s.score, { reasons: s.reasons, missing: s.missing }, hiddenReason],
  );
}

/** For sources that return their full list: anything we didn't see this time has been taken down. */
export async function closeMissing(c: pg.PoolClient, source: string, company: string, seenIds: string[]) {
  const { rowCount } = await c.query(
    `update jobs set closed_at = now()
     where source = $1 and company = $2 and closed_at is null and not (external_id = any($3))`,
    [source, company, seenIds],
  );
  return rowCount ?? 0;
}

export interface JobRow {
  id: number;
  title: string;
  company: string;
  location: string;
  remote_scope: RemoteScope;
  employment_type: string | null;
  url: string;
  apply_url: string | null;
  description: string;
  salary_text: string | null;
  posted_at: Date | null;
  closed_at: Date | null;
  score: number;
  score_reasons: { reasons: string[]; missing: string[] };
  hidden_reason: string | null;
  ai: Record<string, unknown> | null;
  ai_model: string | null;
  status: string;
  notes: string | null;
}

export async function getJob(userId: number, jobId: number): Promise<JobRow> {
  const [row] = await query<JobRow>(
    `select j.*, uj.score, uj.score_reasons, uj.hidden_reason, uj.ai, uj.ai_model, uj.status, uj.notes
     from jobs j join user_jobs uj on uj.job_id = j.id
     where uj.user_id = $1 and j.id = $2`,
    [userId, jobId],
  );
  if (!row) throw new Error(`No job with id ${jobId}`);
  return row;
}
