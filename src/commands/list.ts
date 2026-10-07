import chalk from "chalk";
import Table from "cli-table3";
import { query } from "../db/index.js";
import type { RemoteScope } from "../match/location.js";
import { currentUser } from "../user.js";

export interface ListOpts {
  min: string;
  status: string;
  company?: string;
  days: string;
  limit: string;
  sort: string;
  all?: boolean;
}

// rank = fit (averaged with the AI's fit when there is one) + a bonus for fresh postings
const ORDER: Record<string, string> = {
  rank: "rank desc, j.posted_at desc nulls last",
  new: "j.posted_at desc nulls last",
  fit: "fit desc, j.posted_at desc nulls last",
};

interface Row {
  id: number;
  rank: number;
  score: number;
  ai_fit: number | null;
  title: string;
  company: string;
  location: string;
  remote_scope: RemoteScope;
  employment_type: string | null;
  posted_at: Date | null;
  status: string;
}

export async function listCmd(opts: ListOpts) {
  const { id: userId } = await currentUser();
  const order = ORDER[opts.sort];
  if (!order) throw new Error(`--sort must be one of: ${Object.keys(ORDER).join(", ")}`);
  // `cross join lateral` computes `fit` once per row so `rank` can reuse it.
  const rows = await query<Row>(
    `select j.id, f.fit + freshness_bonus(j.posted_at) as rank, uj.score, (uj.ai->>'fit')::int as ai_fit,
            j.title, j.company, j.location, j.remote_scope, j.employment_type, j.posted_at, uj.status
     from user_jobs uj
     join jobs j on j.id = uj.job_id
     cross join lateral (select coalesce((uj.score + (uj.ai->>'fit')::int) / 2, uj.score) as fit) f
     where uj.user_id = $1
       and uj.hidden_reason is null
       and uj.score >= $2
       and uj.status = any($3::job_status[])
       and ($4::text is null or j.company ilike $4)
       and ($5 or j.closed_at is null)
       and (j.posted_at is null or j.posted_at > now() - make_interval(days => $6))
     order by ${order}
     limit $7`,
    [userId, Number(opts.min), opts.status.toLowerCase().split(","), opts.company ?? null, Boolean(opts.all), Number(opts.days), Number(opts.limit)],
  );

  if (!rows.length) {
    console.log("No jobs match. Try `huntlot fetch`, or loosen --min / --days.");
    return;
  }

  const table = new Table({
    head: ["id", "rank", "fit", "ai", "title", "company", "where", "type", "posted", "status"].map((h) => chalk.bold(h)),
    style: { head: [], border: ["grey"] },
    colWidths: [6, 6, 5, 5, 38, 14, 18, 10, 8, 8],
    wordWrap: true,
  });
  for (const r of rows) {
    table.push([
      r.id,
      chalk.bold(r.rank),
      colorScore(r.score),
      r.ai_fit == null ? chalk.dim("–") : colorScore(r.ai_fit),
      r.title,
      r.company,
      where(r.remote_scope, r.location),
      r.employment_type ?? "",
      age(r.posted_at),
      r.status === "shortlisted" ? chalk.yellow("★") : r.status,
    ]);
  }
  console.log(table.toString());
  console.log(chalk.dim(`${rows.length} shown. \`huntlot show <id>\` for details.`));
}

export function where(scope: RemoteScope, location: string): string {
  if (scope === "worldwide") return chalk.green("remote 🌍");
  if (scope === "india") return chalk.green("remote 🇮🇳");
  if (scope === "unknown") return chalk.yellow("remote ?");
  return location;
}

export function colorScore(n: number): string {
  return n >= 70 ? chalk.green.bold(n) : n >= 50 ? chalk.yellow(n) : chalk.dim(n);
}

/** How long ago the company first published the posting. */
function age(d: Date | null): string {
  if (!d) return "";
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (hours < 1) return chalk.green("just now");
  if (hours < 24) return chalk.green(`${hours}h ago`);
  const days = Math.floor(hours / 24);
  return days < 60 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
