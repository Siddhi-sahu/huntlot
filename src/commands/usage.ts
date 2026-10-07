import chalk from "chalk";
import { query } from "../db/index.js";
import { budget, openAiSpend } from "../llm/budget.js";
import { chooseProvider } from "../llm/client.js";

export async function usageCmd() {
  const spent = await openAiSpend();
  const { provider, why } = await chooseProvider();
  console.log(`OpenAI today: $${spent.today.toFixed(4)} / $${budget.daily}   total: $${spent.total.toFixed(4)} / $${budget.total}`);
  console.log(`Next call goes to ${chalk.bold(provider)} (${why}).\n`);
  const rows = await query<{ provider: string; model: string; calls: number; input: number; output: number; cost: number }>(
    `select provider, model, count(*)::int as calls, sum(input_tokens)::int as input,
            sum(output_tokens)::int as output, sum(cost_usd) as cost
     from llm_usage group by provider, model order by provider, model`,
  );
  for (const r of rows)
    console.log(`${r.provider.padEnd(7)} ${r.model.padEnd(14)} ${String(r.calls).padStart(5)} calls  ${r.input} in / ${r.output} out tokens  $${r.cost.toFixed(4)}`);
}
