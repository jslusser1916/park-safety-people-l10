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

const week = "2026-10-05";

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

const samples: StoredRecord[] = [
  { id: "owner-jordan", kind: "owner", isSample: true, payload: { name: "Jordan Ellis", role: "Safety Director", initials: "JE", color: "orange" } },
  { id: "owner-riley", kind: "owner", isSample: true, payload: { name: "Riley Morgan", role: "People Operations", initials: "RM", color: "blue" } },
  { id: "owner-casey", kind: "owner", isSample: true, payload: { name: "Casey Nguyen", role: "Field Training", initials: "CN", color: "green" } },
  { id: "metric-trir", kind: "metric", isSample: true, sortKey: "01", payload: { name: "Recordable incidents", ownerId: "owner-jordan", target: 0, direction: "lte", unit: "count", cadence: "Weekly" } },
  { id: "metric-training", kind: "metric", isSample: true, sortKey: "02", payload: { name: "Safety orientations completed on time", ownerId: "owner-casey", target: 95, direction: "gte", unit: "%", cadence: "Weekly" } },
  { id: "metric-fill", kind: "metric", isSample: true, sortKey: "03", payload: { name: "Open roles past 30 days", ownerId: "owner-riley", target: 3, direction: "lte", unit: "count", cadence: "Weekly" } },
  { id: "metric-value-trir", kind: "metric_value", isSample: true, payload: { metricId: "metric-trir", week, value: 0, note: "Sample value" } },
  { id: "metric-value-training", kind: "metric_value", isSample: true, payload: { metricId: "metric-training", week, value: 92, note: "Sample value" } },
  { id: "metric-value-fill", kind: "metric_value", isSample: true, payload: { metricId: "metric-fill", week, value: 4, note: "Sample value" } },
  { id: "rock-1", kind: "rock", isSample: true, payload: { title: "Launch updated foreman safety onboarding", ownerId: "owner-casey", quarter: "Q4 2026", dueDate: "2026-12-18", status: "on-track", progress: 58, notes: "Sample Rock — replace with the actual quarterly priority.", milestones: [{ id: "m1", title: "Finalize field checklist", dueDate: "2026-10-23", done: true }, { id: "m2", title: "Pilot with two crews", dueDate: "2026-11-13", done: false }, { id: "m3", title: "Company-wide rollout", dueDate: "2026-12-18", done: false }] } },
  { id: "rock-2", kind: "rock", isSample: true, payload: { title: "Reduce time-to-fill for field roles", ownerId: "owner-riley", quarter: "Q4 2026", dueDate: "2026-12-18", status: "off-track", progress: 35, notes: "Sample Rock — target and milestones are editable.", milestones: [{ id: "m4", title: "Baseline current workflow", dueDate: "2026-10-16", done: true }, { id: "m5", title: "Approve referral campaign", dueDate: "2026-10-30", done: false }] } },
  { id: "todo-1", kind: "todo", isSample: true, payload: { title: "Confirm October toolbox talk calendar", ownerId: "owner-jordan", dueDate: "2026-10-12", status: "open", source: "Sample meeting" } },
  { id: "todo-2", kind: "todo", isSample: true, payload: { title: "Share field hiring scorecard with operations", ownerId: "owner-riley", dueDate: "2026-10-13", status: "open", source: "Sample meeting" } },
  { id: "issue-1", kind: "issue", isSample: true, payload: { title: "Orientation completion is inconsistent across projects", ownerId: "owner-casey", priority: "1", status: "open", context: "Several starts were scheduled before required orientation paperwork was complete.", resolution: "" } },
  { id: "issue-2", kind: "issue", isSample: true, payload: { title: "Lag in closing near-miss follow-ups", ownerId: "owner-jordan", priority: "2", status: "open", context: "Need a single accountable owner and due date for each follow-up.", resolution: "" } },
  { id: "headline-1", kind: "headline", isSample: true, payload: { title: "Positive feedback on new stretch-and-flex format", ownerId: "owner-jordan", tone: "good", date: week, detail: "Sample employee headline from two field crews." } },
  { id: "headline-2", kind: "headline", isSample: true, payload: { title: "Three superintendent candidates advance to final interviews", ownerId: "owner-riley", tone: "good", date: week, detail: "Sample people headline." } },
];

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select({ id: records.id }).from(records).limit(1);
  if (existing.length) return;
  const now = Date.now();
  const privateMigrationSeed = readPrivateMigrationSeed();
  const rows = privateMigrationSeed.length
    ? privateMigrationSeed.map((item) => ({
        id: item.id,
        kind: item.kind,
        payload: item.payload,
        sortKey: item.sort_key,
        isSample: Boolean(item.is_sample),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }))
    : samples.map((item, index) => ({
        id: item.id,
        kind: item.kind,
        payload: JSON.stringify(item.payload),
        sortKey: item.sortKey ?? String(index).padStart(3, "0"),
        isSample: true,
        createdAt: now + index,
        updatedAt: now + index,
      }));
  for (let index = 0; index < rows.length; index += 10) {
    await db.insert(records).values(rows.slice(index, index + 10)).onConflictDoNothing();
  }
}

async function seedSampleStatusHistory() {
  const db = getDb();
  const sampleExists = await db.select({ id: records.id }).from(records).where(eq(records.isSample, true)).limit(1);
  if (!sampleExists.length) return;
  const snapshots = [
    ["2026-01-15", 50, 22, "off-track", "off-track", "open", "open"],
    ["2026-02-16", 55, 24, "on-track", "off-track", "done", "open"],
    ["2026-03-16", 62, 28, "on-track", "off-track", "done", "done"],
    ["2026-04-15", 68, 30, "on-track", "off-track", "open", "done"],
    ["2026-05-15", 72, 34, "on-track", "off-track", "done", "done"],
    ["2026-06-15", 76, 37, "on-track", "on-track", "done", "done"],
    ["2026-07-15", 42, 18, "off-track", "off-track", "open", "done"],
    ["2026-08-17", 48, 25, "on-track", "off-track", "done", "done"],
    ["2026-09-15", 53, 30, "on-track", "off-track", "done", "open"],
    ["2026-10-12", 58, 35, "on-track", "off-track", "done", "open"],
  ] as const;
  const now = Date.now();
  const rows = snapshots.flatMap((snapshot, monthIndex) => {
    const [date, rockOneProgress, rockTwoProgress, rockOneStatus, rockTwoStatus, todoOneStatus, todoTwoStatus] = snapshot;
    const event = (suffix: string, payload: Record<string, unknown>, order: number) => ({
      id: `sample-event-${date}-${suffix}`, kind: "status_event", payload: JSON.stringify({ ...payload, date, timestamp: `${date}T15:00:00.000Z` }),
      sortKey: `event-${date}-${order}`, isSample: true, createdAt: now + monthIndex * 10 + order, updatedAt: now + monthIndex * 10 + order,
    });
    return [
      event("rock-1", { entityKind: "rock", recordId: "rock-1", ownerId: "owner-casey", status: rockOneStatus, progress: rockOneProgress }, 1),
      event("rock-2", { entityKind: "rock", recordId: "rock-2", ownerId: "owner-riley", status: rockTwoStatus, progress: rockTwoProgress }, 2),
      event("todo-1", { entityKind: "todo", recordId: "todo-1", ownerId: "owner-jordan", status: todoOneStatus }, 3),
      event("todo-2", { entityKind: "todo", recordId: "todo-2", ownerId: "owner-riley", status: todoTwoStatus }, 4),
      event("metric-training", { entityKind: "scorecard", recordId: "metric-training", ownerId: "owner-casey", status: monthIndex % 4 === 0 ? "off-track" : "on-track" }, 5),
      event("metric-fill", { entityKind: "scorecard", recordId: "metric-fill", ownerId: "owner-riley", status: monthIndex % 3 === 0 ? "off-track" : "on-track" }, 6),
    ];
  });
  for (let index = 0; index < rows.length; index += 10) await db.insert(records).values(rows.slice(index, index + 10)).onConflictDoNothing();
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
  await seedSampleStatusHistory();
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

