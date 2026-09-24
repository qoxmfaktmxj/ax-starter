import { and, eq, isNull } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { db } from "../db";
import { exportJobs, fileObjects } from "../db/schema";
import { fileStorage } from "../storage/fs";
import { processExportJob } from "../exports/processor";

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL!,
  schema: "pgboss",
  max: 5,
  migrate: false,
  createSchema: false,
});

export async function dispatchPendingExports(): Promise<void> {
  const jobs = await db
    .select({ id: exportJobs.id, actorId: exportJobs.actorId })
    .from(exportJobs)
    .where(
      and(eq(exportJobs.status, "PENDING"), isNull(exportJobs.dispatchedAt)),
    )
    .limit(20);
  for (const job of jobs) {
    await boss.send(
      "employee-export",
      { exportJobId: job.id, actorId: job.actorId },
      { singletonKey: job.id },
    );
    await db
      .update(exportJobs)
      .set({ dispatchedAt: new Date() })
      .where(eq(exportJobs.id, job.id));
  }
}

export async function deletePendingFiles(): Promise<void> {
  const files = await db
    .select()
    .from(fileObjects)
    .where(eq(fileObjects.state, "DELETE_PENDING"))
    .limit(20);
  for (const file of files) {
    await fileStorage.delete(file.objectKey);
    await db
      .update(fileObjects)
      .set({ state: "DELETED" })
      .where(eq(fileObjects.id, file.id));
  }
}

export async function startExportWorker(): Promise<void> {
  await boss.start();
  await boss.work<{ exportJobId: string; actorId: string }>(
    "employee-export",
    { localConcurrency: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) await processExportJob(job.data.exportJobId);
    },
  );
}
