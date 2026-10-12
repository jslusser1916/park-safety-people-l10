import { sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDatabase();
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}

