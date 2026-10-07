import { Command } from "commander";
import { assessCmd } from "./commands/assess.js";
import { fetchCmd } from "./commands/fetch.js";
import { hiddenCmd, unhideCmd } from "./commands/hidden.js";
import { listCmd } from "./commands/list.js";
import { noteCmd, openCmd, setStatusCmd, showCmd, STATUSES } from "./commands/show.js";
import { usageCmd } from "./commands/usage.js";
import { pool } from "./db/index.js";
import { migrate } from "./db/migrate.js";

const program = new Command("huntlot").description("Find, rank and track jobs that fit you.");

program
  .command("fetch")
  .description("pull jobs from every source in sources.yaml, filter and score them")
  .option("-o, --only <name>", "just one source, e.g. GitLab or Himalayas")
  .action(fetchCmd);

program
  .command("list")
  .alias("ls")
  .description("your matches, best first")
  .option("-m, --min <score>", "minimum fit score", "40")
  .option("-s, --status <list>", "comma-separated statuses", "new,shortlisted")
  .option("-c, --company <name>", "only this company")
  .option("-d, --days <n>", "posted within the last n days", "60")
  .option("-n, --limit <n>", "how many", "30")
  .option("--sort <how>", "rank (fit + freshness) | new | fit", "rank")
  .option("-a, --all", "include jobs no longer listed")
  .action(listCmd);

program.command("show <id>").description("details, and why it scored that way").option("-f, --full", "whole description").action(showCmd);
program.command("open <id>").description("open the posting in your browser").action(openCmd);
program.command("note <id> <text>").description("attach a note to a job").action(noteCmd);
program.command("shortlist <ids...>").description("mark as worth applying to").action((ids: string[]) => setStatusCmd(ids, "shortlisted"));
program.command("skip <ids...>").description("not interested").action((ids: string[]) => setStatusCmd(ids, "skipped"));
program.command("status <status> <ids...>").description(`set any status: ${STATUSES.join(", ")}`).action((s: string, ids: string[]) => setStatusCmd(ids, s.toLowerCase()));

program
  .command("assess [ids...]")
  .description("have the AI check your top unassessed matches (OpenAI within budget, else Ollama)")
  .option("-n, --limit <n>", "how many", "10")
  .option("-m, --min <score>", "only jobs with at least this fit score", "50")
  .action((ids: string[], opts) => assessCmd({ ...opts, id: ids }));

program.command("hidden [reason]").description("what the filters hid, and why").option("-n, --limit <n>", "how many", "40").action((reason, opts) => hiddenCmd({ ...opts, reason }));
program.command("unhide <ids...>").description("put hidden jobs back in your list").action(unhideCmd);
program.command("usage").description("LLM spend and which provider is next").action(usageCmd);
program.command("migrate").description("apply database migrations").action(migrate);

try {
  await program.parseAsync();
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
