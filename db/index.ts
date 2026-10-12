import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;

function getClient() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Render injects it from the managed PostgreSQL database defined in render.yaml.");
  }
  client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return client;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}

export function ensureDatabase() {
  const sql = getClient();
  schemaReady ??= sql`
    CREATE TABLE IF NOT EXISTS records (
      id text PRIMARY KEY,
      kind text NOT NULL,
      payload text NOT NULL,
      sort_key text NOT NULL DEFAULT '',
      is_sample boolean NOT NULL DEFAULT false,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL
    )
  `.then(() => undefined);
  return schemaReady;
}

