import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../packages/server/db";
import { auditEvents, fileObjects } from "../../packages/server/db/schema";
import {
  fileStorage,
  newObjectKey,
  checkStorageMarker,
} from "../../packages/server/storage/fs";
import { resolveActorContext } from "../../packages/server/auth/context";
import {
  authorizeFileDownload,
  applyFileScanResult,
  listEmployeeFiles,
  markFileDeleted,
  uploadEmployeeFile,
} from "../../packages/server/files/service";

const root = process.env.FILE_ROOT!;
const created: string[] = [];
afterAll(async () => {
  for (const key of created) await fileStorage.delete(key);
});

describe("local fs storage", () => {
  it("roundtrips, rejects duplicate keys, and deletes repeatedly", async () => {
    const key = newObjectKey(crypto.randomUUID());
    created.push(key);
    const body = Buffer.from("synthetic file body");
    const stored = await fileStorage.put(key, Readable.from(body), {
      size: body.length,
      contentType: "application/pdf",
    });
    expect(stored.size).toBe(body.length);
    expect(await fileStorage.exists(key)).toBe(true);
    const chunks: Buffer[] = [];
    for await (const chunk of await fileStorage.get(key))
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(body);
    await expect(
      fileStorage.put(key, Readable.from(body), {
        size: body.length,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow();
    await fileStorage.delete(key);
    await fileStorage.delete(key);
    expect(await fileStorage.exists(key)).toBe(false);
  });

  it("rejects traversal, symlinked directories, and missing marker", async () => {
    await expect(fileStorage.exists("../escape")).rejects.toThrow(
      "Invalid storage key",
    );
    const outside = await mkdtemp(join(tmpdir(), "ax-fs-test-"));
    const year = join(root, "2099");
    try {
      await mkdir(outside, { recursive: true });
      await symlink(outside, year, "dir");
      await expect(
        fileStorage.put(`2099/01/${crypto.randomUUID()}`, Readable.from("a"), {
          size: 1,
          contentType: "image/png",
        }),
      ).rejects.toThrow();
    } finally {
      await rm(year, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
    const marker = join(root, ".ax-storage-marker");
    const moved = `${marker}.test`;
    await rename(marker, moved);
    try {
      await expect(checkStorageMarker()).rejects.toThrow();
    } finally {
      await rename(moved, marker);
    }
  });
});

describe("file state", () => {
  it("waives only the fixed fixture and quarantines other uploads", async () => {
    const admin = await resolveActorContext(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const employeeId = "00000000-0000-4000-8000-000000000001";
    const bytes = await readFile("tests/fixtures/local-allowed.png");
    const allowed = await uploadEmployeeFile(
      admin,
      employeeId,
      new File([bytes], "local-allowed.png", { type: "image/png" }),
    );
    expect(allowed.state).toBe("AVAILABLE");
    expect(allowed.scanStatus).toBe("WAIVED");
    expect((await authorizeFileDownload(admin, allowed.fileId)).id).toBe(
      allowed.fileId,
    );
    const changed = Buffer.from(bytes);
    changed[changed.length - 5] ^= 1;
    const unknown = await uploadEmployeeFile(
      admin,
      employeeId,
      new File([changed], "other.png", { type: "image/png" }),
    );
    expect(unknown.state).toBe("QUARANTINED");
    await expect(
      authorizeFileDownload(admin, unknown.fileId),
    ).rejects.toMatchObject({ status: 403 });
    await markFileDeleted(admin, unknown.fileId);
    expect(await applyFileScanResult(unknown.fileId, "CLEAN")).toBe(false);
    const [afterLateScan] = await db
      .select()
      .from(fileObjects)
      .where(eq(fileObjects.id, unknown.fileId));
    expect(afterLateScan.state).toBe("DELETE_PENDING");
    expect(afterLateScan.scanStatus).toBe("NOT_SCANNED");
    expect(
      (await listEmployeeFiles(admin, employeeId)).some(
        (row) => row.id === allowed.fileId,
      ),
    ).toBe(true);
    await db
      .update(fileObjects)
      .set({ waiverExpiresAt: new Date(0) })
      .where(eq(fileObjects.id, allowed.fileId));
    await expect(
      authorizeFileDownload(admin, allowed.fileId),
    ).rejects.toMatchObject({ status: 403 });
    await markFileDeleted(admin, allowed.fileId);
    await expect(
      authorizeFileDownload(admin, allowed.fileId),
    ).rejects.toMatchObject({ status: 403 });
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.correlationId, admin.correlationId));
    expect(
      audits.some(
        (event) =>
          event.action === "file.upload" && event.outcome === "SUCCESS",
      ),
    ).toBe(true);
    expect(
      audits.some(
        (event) =>
          event.action === "file.delete" && event.outcome === "SUCCESS",
      ),
    ).toBe(true);
  });
});
