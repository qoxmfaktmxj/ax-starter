import type { Readable } from "node:stream";

export type StoredFile = { size: number; sha256: string };
export interface FileStorage {
  put(
    key: string,
    body: Readable,
    metadata: { size: number; contentType: string },
    signal?: AbortSignal,
  ): Promise<StoredFile>;
  get(key: string, signal?: AbortSignal): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
