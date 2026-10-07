import chalk from "chalk";
import { query } from "../db/index.js";
import { getJob } from "../db/jobs.js";
import { aiHideReason, assessJob } from "../llm/assess.js";
import { chooseProvider } from "../llm/client.js";
import { currentUser } from "../user.js";
import { colorScore } from "./list.js";

/** Ask the LLM about your best unassessed matches, one at a time. */
export async function assessCmd(opts: { limit: string; min: string; id?: string[] }) {
  const { id: userId, profile } = await currentUser();
  const ids = opts.id?.length
    ? opts.id.map(Number)
    : (await query<{ job_id: number }>(
        `select uj.job_id from user_jobs uj join jobs j on j.id = uj.job_id
         where uj.user_id = $1 and uj.hidden_reason is null and uj.ai is null
           and uj.status in ('new', 'shortlisted') and uj.score >= $2 and j.closed_at is null
         order by uj.score desc limit $3`,
        [userId, Number(opts.min), Number(opts.limit)],
      )).map((r) => r.job_id);

  if (!ids.length) return console.log("Nothing to assess. Lower --min, or run `huntlot fetch` first.");
  const { provider, why } = await chooseProvider();
  console.log(chalk.dim(`Using ${provider} (${why}) for ${ids.length} job(s)…\n`));

  for (const jobId of ids) {
    const job = await getJob(userId, jobId);
    const started = Date.now();
    try {
      const { data, model } = await assessJob(job, profile);
      const hide = aiHideReason(data, profile);
      await query(
        `update user_jobs set ai = $3, ai_model = $4, ai_at = now(), updated_at = now(),
                hidden_reason = coalesce($5, hidden_reason)
         where user_id = $1 and job_id = $2`,
        [userId, jobId, data, model, hide],
      );
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `${String(jobId).padStart(5)}  ${colorScore(data.fit)}  ${job.title} — ${chalk.cyan(job.company)}` +
          (hide ? chalk.red(`  hidden (${hide.slice(4)})`) : "") + chalk.dim(`  ${secs}s`),
      );
    } catch (err) {
      console.log(chalk.red(`${String(jobId).padStart(5)}  failed: ${(err as Error).message}`));
      if (/Can't reach Ollama|ollama pull/.test((err as Error).message)) break;
    }
  }
}
