import chalk from "chalk";
import pLimit from "p-limit";
import { loadSources } from "../config.js";
import { transaction } from "../db/index.js";
import { closeMissing, upsertJob, upsertMatch } from "../db/jobs.js";
import { remoteScope } from "../match/location.js";
import { rejectReason, scoreJob } from "../match/score.js";
import { plan } from "../sources/index.js";
import { currentUser } from "../user.js";

export async function fetchCmd(opts: { only?: string }) {
  const { id: userId, profile } = await currentUser();
  const { boards, feeds } = loadSources();
  const fetches = plan(boards, feeds).filter((f) => !opts.only || f.label.toLowerCase() === opts.only.toLowerCase());

  // 1. Download from every source, 4 at a time. A failing source is reported, not fatal.
  const limit = pLimit(4);
  const results = await Promise.all(
    fetches.map((f) =>
      limit(async () => {
        try {
          return { f, jobs: await f.run() };
        } catch (err) {
          console.log(chalk.red(`✗ ${f.label}: ${(err as Error).message}`));
          return { f, jobs: null };
        }
      }),
    ),
  );

  // 2. Save each source's jobs in one transaction: upsert the job, then your score for it.
  let seen = 0, matched = 0, created = 0, closed = 0;
  const hidden = new Map<string, number>();
  for (const { f, jobs } of results) {
    if (!jobs) continue;
    seen += jobs.length;
    await transaction(async (c) => {
      for (const raw of jobs) {
        const job = { ...raw, remoteScope: remoteScope(raw) };
        const reason = rejectReason(job, profile);
        const { id, inserted } = await upsertJob(c, raw, job.remoteScope);
        await upsertMatch(c, userId, id, scoreJob(job, profile), reason);
        if (inserted) created++;
        if (reason) {
          const bucket = reason.split(":")[0]!;
          hidden.set(bucket, (hidden.get(bucket) ?? 0) + 1);
        } else matched++;
      }
      if (f.complete && f.company) closed += await closeMissing(c, f.source, f.company, jobs.map((j) => j.externalId));
    });
  }

  const failed = results.filter((r) => !r.jobs).length;
  console.log(
    `\n${chalk.bold(seen)} jobs from ${results.length - failed} sources` +
      (failed ? chalk.red(` (${failed} failed)`) : "") +
      ` → ${chalk.green.bold(matched)} match you · ${chalk.cyan.bold(created)} new · ${closed} closed since last time.`,
  );
  const why = [...hidden].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
  if (why) console.log(chalk.dim(`Hidden: ${why}  (huntlot hidden)`));
  console.log(chalk.dim("Next: `huntlot list`, or `huntlot assess` to have the AI check the top ones."));
}
