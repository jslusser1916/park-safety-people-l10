import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;

type MigratedRecord = {
  id: string;
  kind: string;
  payload: string;
  sort_key?: string;
  is_sample?: number | boolean;
  created_at: number;
  updated_at: number;
};

function readPrivateMigrationSeed(): MigratedRecord[] {
  const encoded = process.env.MIGRATION_PAYLOAD_BASE64;
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("The private migration payload could not be decoded.", error);
    return [];
  }
}

async function migratePrivateSeedIfEmpty(sql: ReturnType<typeof postgres>) {
  const existingRows = (await sql`SELECT count(*)::text AS count FROM records`) as unknown as Array<{ count: string }>;
  const [{ count }] = existingRows;
  if (Number(count) > 0) return;

  const migrationSeed = readPrivateMigrationSeed();
  if (!migrationSeed.length) return;

  for (const item of migrationSeed) {
    await sql`
      INSERT INTO records (id, kind, payload, sort_key, is_sample, created_at, updated_at)
      VALUES (
        ${item.id},
        ${item.kind},
        ${item.payload},
        ${item.sort_key ?? ""},
        ${Boolean(item.is_sample)},
        ${item.created_at},
        ${item.updated_at}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  console.log(`Imported ${migrationSeed.length} records from the private migration seed.`);
}

async function normalizeSampleWorkspaceLanguage(sql: ReturnType<typeof postgres>) {
  await sql`
    UPDATE records
    SET payload = replace(payload, 'Pilot with two crews', 'Run with two crews'),
        updated_at = ${Date.now()}
    WHERE is_sample = true
      AND payload LIKE '%Pilot with two crews%'
  `;
}

async function removeSampleRecords(sql: ReturnType<typeof postgres>) {
  const removed = await sql`DELETE FROM records WHERE is_sample = true RETURNING id`;
  if (removed.length) console.log(`Removed ${removed.length} sample records from the shared dashboard.`);
}

async function repairRockDefaults(sql: ReturnType<typeof postgres>) {
  await sql`
    UPDATE records
    SET payload = jsonb_set(payload::jsonb, '{status}', '"on-track"'::jsonb, true)::text,
        updated_at = ${Date.now()}
    WHERE kind = 'rock'
      AND COALESCE(payload::jsonb ->> 'status', '') NOT IN ('on-track', 'off-track', 'complete')
  `;
  await sql`
    UPDATE records
    SET payload = jsonb_set(payload::jsonb, '{milestones}', '[]'::jsonb, true)::text,
        updated_at = ${Date.now()}
    WHERE kind = 'rock'
      AND COALESCE(jsonb_typeof(payload::jsonb -> 'milestones'), '') <> 'array'
  `;
}

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
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS records (
        id text PRIMARY KEY,
        kind text NOT NULL,
        payload text NOT NULL,
        sort_key text NOT NULL DEFAULT '',
        is_sample boolean NOT NULL DEFAULT false,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `;
    await migratePrivateSeedIfEmpty(sql);
    await normalizeSampleWorkspaceLanguage(sql);
    await removeSampleRecords(sql);
    await repairRockDefaults(sql);
  })();
  return schemaReady;
}

