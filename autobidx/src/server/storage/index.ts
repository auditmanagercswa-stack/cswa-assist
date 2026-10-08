import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Object storage for uploaded and generated files. Keys are slash-separated relative paths
 * (e.g. "vehicle-image/2026/10/abc.webp"). The default driver keeps files on the local disk
 * under STORAGE_DIR; swap this module for an S3/R2 driver in production.
 */
export interface Storage {
  get(key: string): Promise<Buffer | null>;
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_\-.]*$/i;

function resolveKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`Invalid storage key: ${key}`);
  const root = path.resolve(env.storageDir);
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return full;
}

class LocalDiskStorage implements Storage {
  async get(key: string): Promise<Buffer | null> {
    let full: string;
    try {
      full = resolveKey(key);
    } catch {
      return null;
    }
    try {
      return await fs.readFile(full);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // Write to a temp file then rename so readers never see a half-written object.
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, full);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: Storage = new LocalDiskStorage();
