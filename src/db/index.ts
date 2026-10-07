import pg from "pg";

process.loadEnvFile();

// One pool for the whole process. Each query borrows a connection and gives it back.
// Fail after 5s instead of hanging forever when the database isn't up.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 });

// Postgres returns bigint (int8) and numeric as strings, because JS numbers can't hold every
// bigint exactly. Our ids and costs are small, so parse them into numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows;
  } catch (err) {
    throw friendly(err);
  }
}

/** Turn "can't connect" errors into a hint about what to do. */
function friendly(err: unknown): unknown {
  const msg = (err as Error).message ?? "";
  if (/ECONNREFUSED|timeout exceeded when trying to connect|Connection terminated/i.test(msg))
    return new Error("Can't reach Postgres. Is Docker Desktop running (and not paused)? Then: pnpm db:up");
  return err;
}

/** Run `fn` inside BEGIN/COMMIT on one connection; ROLLBACK if it throws. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect().catch((err) => Promise.reject(friendly(err)));
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
