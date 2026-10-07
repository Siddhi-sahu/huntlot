import { execFile } from "node:child_process";
import chalk from "chalk";
import { query } from "../db/index.js";
import { getJob } from "../db/jobs.js";
import type { Assessment } from "../llm/assess.js";
import { currentUser } from "../user.js";
import { colorScore, where } from "./list.js";

export const STATUSES = ["new", "shortlisted", "skipped", "applied", "interviewing", "rejected", "offer"];

export async function showCmd(id: string, opts: { full?: boolean }) {
  const { id: userId } = await currentUser();
  const j = await getJob(userId, Number(id));
  console.log(`\n${chalk.bold(j.title)} — ${chalk.cyan(j.company)}   fit ${colorScore(j.score)}/100`);
  console.log(
    [where(j.remote_scope, j.location), j.location, j.employment_type, j.salary_text].filter(Boolean).join(" · "),
  );
  console.log(
    chalk.dim(`status: ${j.status} · posted ${j.posted_at?.toDateString() ?? "?"}${j.closed_at ? " · no longer listed" : ""}`),
  );
  if (j.hidden_reason) console.log(chalk.red(`Hidden: ${j.hidden_reason}`));
  console.log(`\n${chalk.bold("Rules:")} ${j.score_reasons.reasons.join(" · ")}`);
  if (j.score_reasons.missing.length) console.log(chalk.dim(`Not mentioned: ${j.score_reasons.missing.join(", ")}`));

  if (j.ai) {
    const a = j.ai as Assessment;
    console.log(`\n${chalk.bold("AI")} ${chalk.dim(`(${j.ai_model})`)}: fit ${colorScore(a.fit)} · open to India: ${a.open_to_india} · ${a.employment_type}` +
      (a.years_required != null ? ` · ${a.years_required}+ yrs` : "") + ` · education: ${a.education_gate.replace(/_/g, " ")}`);
    console.log(`  ${a.summary}\n  ${a.why}`);
    if (a.missing.length) console.log(chalk.yellow(`  Missing: ${a.missing.join("; ")}`));
    if (a.red_flags.length) console.log(chalk.red(`  Red flags: ${a.red_flags.join("; ")}`));
  }
  if (j.notes) console.log(`\n${chalk.bold("Notes:")} ${j.notes}`);

  const lines = j.description.split("\n");
  const shown = opts.full ? lines : lines.slice(0, 30);
  console.log(`\n${shown.join("\n")}`);
  if (shown.length < lines.length) console.log(chalk.dim(`\n… ${lines.length - shown.length} more lines (--full)`));
  console.log(`\n${chalk.underline(j.url)}`);
}

export async function openCmd(id: string) {
  const { id: userId } = await currentUser();
  execFile("open", [(await getJob(userId, Number(id))).url]);
}

export async function setStatusCmd(ids: string[], status: string) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status "${status}". Use one of: ${STATUSES.join(", ")}`);
  const { id: userId } = await currentUser();
  const rows = await query(
    `update user_jobs set status = $3::job_status, updated_at = now()
     where user_id = $1 and job_id = any($2) returning job_id`,
    [userId, ids.map(Number), status],
  );
  console.log(`${rows.length} job(s) → ${status}`);
}

export async function noteCmd(id: string, text: string) {
  const { id: userId } = await currentUser();
  await query(`update user_jobs set notes = $3, updated_at = now() where user_id = $1 and job_id = $2`, [userId, Number(id), text]);
  console.log("Saved.");
}
