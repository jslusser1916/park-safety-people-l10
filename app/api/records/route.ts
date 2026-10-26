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
    let changed = false;
    if (["high", "medium", "low"].includes(String(payload.priority || ""))) {
      payload.priority = "";
      changed = true;
    }
    // Remove only the old generated labels; preserve user-written issue titles.
    if (payload.status !== "solved" && typeof payload.sourceId === "string") {
      const [source] = await db.select().from(records).where(eq(records.id, payload.sourceId)).limit(1);
      if (source) {
        const sourcePayload = JSON.parse(source.payload) as Record<string, unknown>;
        const title = String(source.kind === "metric" ? sourcePayload.name || "" : sourcePayload.title || "");
        const generatedTitle = source.kind === "metric" ? `${title} is off target` : source.kind === "rock" ? `Rock off track: ${title}` : source.kind === "todo" ? `To-Do not done: ${title}` : "";
        if (title && generatedTitle && payload.title === generatedTitle) {
          payload.title = title;
          if (payload.sourceLabel === generatedTitle) payload.sourceLabel = title;
          changed = true;
        }
      }
    }
    if (changed) {
      await db.update(records).set({ payload: JSON.stringify(payload), updatedAt: Date.now() }).where(eq(records.id, row.id));
    }
  }
}

async function migrateMisdatedScorecardWeek() {
  const db = getDb();
  const markerId = "system-scorecard-week-2026-10-12-to-2026-10-05";
  const marker = await db.select({ id: records.id }).from(records).where(eq(records.id, markerId)).limit(1);
  if (marker.length) return;

  const sourceWeek = "2026-10-12";
  const targetWeek = "2026-10-05";
  const valueRows = await db.select().from(records).where(eq(records.kind, "metric_value"));
  const parsed = valueRows.map((row) => ({ row, payload: JSON.parse(row.payload) as Record<string, unknown> }));
  const targetMetricIds = new Set(parsed.filter(({ payload }) => payload.week === targetWeek).map(({ payload }) => String(payload.metricId || "")));
  let moved = 0; let conflicts = 0;

  for (const { row, payload } of parsed.filter(({ payload }) => payload.week === sourceWeek)) {
    const metricId = String(payload.metricId || "");
    if (!metricId || targetMetricIds.has(metricId)) { conflicts += 1; continue; }
    await db.update(records).set({ payload: JSON.stringify({ ...payload, week: targetWeek }), updatedAt: Date.now() }).where(eq(records.id, row.id));
    targetMetricIds.add(metricId); moved += 1;
  }

  const timestamp = Date.now();
  await db.insert(records).values({
    id: markerId,
    kind: "status_event",
    payload: JSON.stringify({ entityKind: "system", recordId: markerId, date: new Date(timestamp).toISOString().slice(0, 10), timestamp: new Date(timestamp).toISOString(), status: "complete", moved, conflicts }),
    sortKey: "",
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing();
  console.info(`Moved ${moved} Scorecard values from ${sourceWeek} to ${targetWeek}; ${conflicts} conflicts were preserved.`);
}

export async function GET() {
  await ensureDatabase();
  await seedIfEmpty();
  await normalizeLegacyIssuePriorities();
  await migrateMisdatedScorecardWeek();
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


