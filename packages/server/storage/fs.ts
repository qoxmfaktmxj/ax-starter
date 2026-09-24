import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, link, realpath, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileStorage } from "../../core/files";

const root = resolve(process.env.FILE_ROOT ?? "/data/files");
const keyPattern =
  /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pathForKey(key: string): string {
  if (!keyPattern.test(key)) throw new Error("Invalid storage key");
  const path = resolve(root, key);
  if (!path.startsWith(`${root}${sep}`))
    throw new Error("Invalid storage path");
  return path;
}

export async function checkStorageMarker(): Promise<void> {
  const info = await lstat(root);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (await realpath(root)) !== root
  )
    throw new Error("Storage root invalid");
  const marker = await lstat(join(root, ".ax-storage-marker"));
  if (!marker.isFile() || marker.isSymbolicLink())
    throw new Error("Storage marker missing");
}

async function ensureParent(key: string): Promise<string> {
  await checkStorageMarker();
  const path = pathForKey(key);
  const [year, month] = key.split("/");
  const yearPath = join(root, year);
  const monthPath = join(yearPath, month);
  await mkdir(yearPath, { recursive: true });
  await mkdir(monthPath, { recursive: true });
  for (const dir of [yearPath, monthPath]) {
    const info = await lstat(dir);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(dir)) !== dir
    )
      throw new Error("Storage directory invalid");
  }
  return path;
}

async function existingPath(key: string): Promise<string> {
  await checkStorageMarker();
  const path = pathForKey(key);
  const [year, month] = key.split("/");
  for (const dir of [join(root, year), join(root, year, month)]) {
    const info = await lstat(dir);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(dir)) !== dir
    )
      throw new Error("Storage directory invalid");
  }
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink())
    throw new Error("Storage object invalid");
  return path;
}

export class FsStorage implements FileStorage {
  async put(
    key: string,
    body: Readable,
    metadata: { size: number; contentType: string },
    signal?: AbortSignal,
  ) {
    const destination = await ensureParent(key);
    const temp = `${destination}.${randomUUID()}.tmp`;
    const hash = createHash("sha256");
    let size = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > metadata.size)
          return callback(new Error("Storage size exceeded"));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        body,
        counter,
        createWriteStream(temp, { flags: "wx", mode: 0o600 }),
        { signal },
      );
      if (size !== metadata.size) throw new Error("Storage size mismatch");
      await checkStorageMarker();
      await link(temp, destination);
      return { size, sha256: hash.digest("hex") };
    } finally {
      await unlink(temp).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async get(key: string, signal?: AbortSignal): Promise<Readable> {
    const path = await existingPath(key);
    const stream = createReadStream(path);
    signal?.addEventListener("abort", () => stream.destroy(signal.reason), {
      once: true,
    });
    return stream;
  }

  async delete(key: string): Promise<void> {
    try {
      const path = await existingPath(key);
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await existingPath(key);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

export const fileStorage = new FsStorage();

export function newObjectKey(id: string): string {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
}
