import { query } from "../db/index.js";

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. Asia/Kolkata

export const budget = {
  daily: Number(process.env.LLM_DAILY_BUDGET_USD ?? 0.2),
  total: Number(process.env.LLM_TOTAL_BUDGET_USD ?? 2),
};

/**
 * OpenAI spend today (in your timezone) and overall.
 * `filter (where ...)` lets one scan compute both sums.
 * `date_trunc('day', now() at time zone $1) at time zone $1` = midnight today, local time.
 */
export async function openAiSpend(): Promise<{ today: number; total: number }> {
  const [row] = await query<{ today: number; total: number }>(
    `select coalesce(sum(cost_usd) filter (where at >= date_trunc('day', now() at time zone $1) at time zone $1), 0) as today,
            coalesce(sum(cost_usd), 0) as total
     from llm_usage where provider = 'openai'`,
    [tz],
  );
  return row!;
}

export async function recordUsage(u: {
  provider: string; model: string; purpose: string; inputTokens: number; outputTokens: number; costUsd: number;
}) {
  await query(
    `insert into llm_usage (provider, model, purpose, input_tokens, output_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6)`,
    [u.provider, u.model, u.purpose, u.inputTokens, u.outputTokens, u.costUsd],
  );
}
