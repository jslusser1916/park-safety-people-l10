import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "@/db";
import { records } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StoredRecord = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  sortKey?: string;
  isSample?: boolean;
};

type MigratedRecord = {
  id: string;
  kind: string;
  payload: string;
  sort_key: string;
  is_sample: number | boolean;
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

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select({ id: records.id }).from(records).limit(1);
  if (existing.length) return;
  const privateMigrationSeed = readPrivateMigrationSeed();
  if (!privateMigrationSeed.length) return;
  const rows = privateMigrationSeed.map((item) => ({
        id: item.id,
        kind: item.kind,
        payload: item.payload,
        sortKey: item.sort_key,
        isSample: Boolean(item.is_sample),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
  for (let index = 0; index < rows.length; index += 10) {
    await db.insert(records).values(rows.slice(index, index + 10)).onConflictDoNothing();
  }
}

async function normalizeLegacyIssuePriorities() {
  const db = getDb();
  const issueRows = await db.select().from(records).where(eq(records.kind, "issue"));
  for (const row of issueRows) {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    if (["high", "medium", "low"].includes(String(payload.priority || ""))) {
      await db.update(records).set({ payload: JSON.stringify({ ...payload, priority: "" }), updatedAt: Date.now() }).where(eq(records.id, row.id));
    }
  }
}

export async function GET() {
  await ensureDatabase();
  await seedIfEmpty();
  await normalizeLegacyIssuePriorities();
  const rows = await getDb().select().from(records).orderBy(records.sortKey, records.createdAt);
  return NextResponse.json(rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) })));
}

export async function POST(request: NextRequest) {
  await ensureDatabase();
  const body = (await request.json()) as Partial<StoredRecord>;
  if (!body.id || !body.kind || !body.payload || typeof body.payload !== "object") {
    return NextResponse.json({ error: "A valid id, kind, and payload are required." }, { status: 400 });
  }
  const timestamp = Date.now();
  await getDb().insert(records).values({
    id: body.id,
    kind: body.kind,
    payload: JSON.stringify(body.payload),
    sortKey: body.sortKey ?? "",
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: records.id,
    set: { kind: body.kind, payload: JSON.stringify(body.payload), sortKey: body.sortKey ?? "", isSample: false, updatedAt: timestamp },
  });
  return NextResponse.json({ ok: true, updatedAt: timestamp });
}

export async function DELETE(request: NextRequest) {
  await ensureDatabase();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await getDb().delete(records).where(eq(records.id, id));
  return NextResponse.json({ ok: true });
}

