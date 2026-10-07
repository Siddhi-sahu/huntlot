import chalk from "chalk";
import { z } from "zod";
import { budget, openAiSpend, recordUsage } from "./budget.js";

/**
 * One function the rest of the app calls: ask for JSON matching a zod schema.
 * It picks the provider each call:
 *   OpenAI  if OPENAI_API_KEY is set and today's and total spend are under budget
 *   Ollama  otherwise, or if the OpenAI call fails (e.g. out of credit)
 */
export interface JsonRequest<T> {
  purpose: string; // logged in llm_usage, e.g. "assess"
  system: string;
  user: string;
  schema: z.ZodType<T>;
}
export interface JsonResult<T> {
  data: T;
  provider: "openai" | "ollama";
  model: string;
}

const env = (k: string, fallback = "") => process.env[k]?.trim() || fallback;

export async function chooseProvider(): Promise<{ provider: "openai" | "ollama"; why: string }> {
  if (!env("OPENAI_API_KEY")) return { provider: "ollama", why: "no OPENAI_API_KEY" };
  const spent = await openAiSpend();
  if (spent.total >= budget.total) return { provider: "ollama", why: `OpenAI total budget used ($${spent.total.toFixed(3)})` };
  if (spent.today >= budget.daily) return { provider: "ollama", why: `today's OpenAI budget used ($${spent.today.toFixed(3)})` };
  return { provider: "openai", why: `$${spent.today.toFixed(3)} of $${budget.daily} used today` };
}

export async function chatJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
  const { provider } = await chooseProvider();
  if (provider === "openai") {
    try {
      return await callOpenAi(req);
    } catch (err) {
      console.log(chalk.yellow(`OpenAI failed (${(err as Error).message}); using Ollama for this one.`));
    }
  }
  return callOllama(req);
}

/** JSON Schema for the model. OpenAI's strict mode wants every field required and no extras. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const strict = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strict);
    if (!node || typeof node !== "object") return node;
    const o = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, strict(v)]));
    if (o.type === "object" && o.properties) {
      o.required = Object.keys(o.properties);
      o.additionalProperties = false;
    }
    delete o.$schema;
    return o;
  };
  return strict(z.toJSONSchema(schema)) as Record<string, unknown>;
}

async function callOpenAi<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
  const model = env("OPENAI_MODEL", "gpt-4o-mini");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: req.purpose, strict: true, schema: jsonSchema(req.schema) } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as {
    error?: { message: string };
    choices?: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);

  const input = body.usage?.prompt_tokens ?? 0;
  const output = body.usage?.completion_tokens ?? 0;
  const costUsd = (input * Number(env("OPENAI_PRICE_INPUT", "0.15")) + output * Number(env("OPENAI_PRICE_OUTPUT", "0.6"))) / 1e6;
  await recordUsage({ provider: "openai", model, purpose: req.purpose, inputTokens: input, outputTokens: output, costUsd });

  return { data: req.schema.parse(JSON.parse(body.choices![0]!.message.content)), provider: "openai", model };
}

async function callOllama<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
  const model = env("OLLAMA_MODEL", "gemma3:4b");
  const url = env("OLLAMA_URL", "http://localhost:11434");
  // Small local models sometimes return slightly-off JSON, so allow one retry.
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: jsonSchema(req.schema), // Ollama constrains its output to this schema
          options: { temperature: 0, num_ctx: 8192 },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch {
      throw new Error(`Can't reach Ollama at ${url}. Start it with \`ollama serve\` (or open the Ollama app).`);
    }
    const body = (await res.json()) as { error?: string; message?: { content: string }; prompt_eval_count?: number; eval_count?: number };
    if (!res.ok || body.error) throw new Error(`Ollama: ${body.error ?? res.status}${/not found/.test(body.error ?? "") ? ` — run \`ollama pull ${model}\`` : ""}`);

    await recordUsage({
      provider: "ollama", model, purpose: req.purpose,
      inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0, costUsd: 0,
    });
    const parsed = req.schema.safeParse(safeJson(body.message?.content ?? ""));
    if (parsed.success) return { data: parsed.data, provider: "ollama", model };
    if (attempt >= 2) throw new Error(`Ollama returned output that doesn't match the schema: ${parsed.error.message}`);
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
