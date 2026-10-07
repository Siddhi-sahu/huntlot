import chalk from "chalk";
import { query } from "../db/index.js";
import { currentUser } from "../user.js";

/** Why jobs were hidden, so you can check the filters aren't throwing away good ones. */
export async function hiddenCmd(opts: { reason?: string; limit: string }) {
  const { id: userId } = await currentUser();
  if (!opts.reason) {
    // split_part keeps the bucket before ':' — "title: senior" and "title: lead" group together
    const rows = await query<{ bucket: string; n: number }>(
      `select split_part(hidden_reason, ':', 1) as bucket, count(*)::int as n
       from user_jobs where user_id = $1 and hidden_reason is not null
       group by 1 order by n desc`,
      [userId],
    );
    for (const r of rows) console.log(`${String(r.n).padStart(6)}  ${r.bucket}`);
    console.log(chalk.dim("\n`huntlot hidden <reason>` lists the jobs, e.g. huntlot hidden students"));
    return;
  }
  const rows = await query<{ id: number; title: string; company: string; hidden_reason: string }>(
    `select j.id, j.title, j.company, uj.hidden_reason
     from user_jobs uj join jobs j on j.id = uj.job_id
     where uj.user_id = $1 and uj.hidden_reason ilike $2
     order by uj.score desc limit $3`,
    [userId, `%${opts.reason}%`, Number(opts.limit)],
  );
  for (const r of rows) console.log(`${String(r.id).padStart(6)}  ${r.title} — ${chalk.cyan(r.company)}  ${chalk.dim(r.hidden_reason)}`);
}

export async function unhideCmd(ids: string[]) {
  const { id: userId } = await currentUser();
  const rows = await query(
    `update user_jobs set hidden_reason = null, updated_at = now() where user_id = $1 and job_id = any($2) returning job_id`,
    [userId, ids.map(Number)],
  );
  console.log(`${rows.length} job(s) back in your list. (A future fetch may hide rule-based ones again.)`);
}
