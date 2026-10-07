import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool, query, transaction } from "./index.js";

const dir = resolve(import.meta.dirname, "../../db/migrations");

/**
 * Apply every db/migrations/*.sql file that hasn't run yet, in name order.
 * Each file runs in its own transaction, so a broken migration leaves nothing half-applied.
 */
export async function migrate() {
  await query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const done = new Set((await query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await transaction(async (c) => {
      await c.query(readFileSync(resolve(dir, file), "utf8"));
      await c.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    console.log(`applied ${file}`);
  }
}

if (import.meta.main) {
  await migrate();
  await pool.end();
}
