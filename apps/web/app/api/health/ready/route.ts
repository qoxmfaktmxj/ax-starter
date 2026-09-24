import { sql } from "drizzle-orm";
import { db } from "@/packages/server/db";
import { checkStorageMarker } from "@/packages/server/storage/fs";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    await checkStorageMarker();
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
