import {
  boss,
  deletePendingFiles,
  dispatchPendingExports,
  startExportWorker,
} from "../../packages/server/jobs/queue";
import { pool } from "../../packages/server/db";
import { logger } from "../../packages/server/logger";

let stopping = false;
let busy = false;
await startExportWorker();

async function tick() {
  if (stopping || busy) return;
  busy = true;
  try {
    await dispatchPendingExports();
    await deletePendingFiles();
  } catch (error) {
    logger.error(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "worker_tick_failed",
    );
  } finally {
    busy = false;
  }
}

await tick();
const timer = setInterval(() => void tick(), 5000);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 30000 });
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
