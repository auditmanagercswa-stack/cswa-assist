import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { getSetting } from "../settings";
import { storage } from "./index";

export type UploadKind = "image" | "video" | "document";

const MB = 1024 * 1024;
const MIN_IMAGE_SIDE = 200;
const MAX_IMAGE_SIDE = 1920;
const THUMB = { width: 480, height: 360 };

/** Detects the real content type from magic bytes (never trust the file name or the browser). */
export function sniffMime(data: Buffer): string | null {
  if (data.length < 12) return null;
  const hex = (start: number, end: number) => data.subarray(start, end).toString("hex");
  const ascii = (start: number, end: number) => data.subarray(start, end).toString("latin1");
  if (hex(0, 8) === "89504e470d0a1a0a") return "image/png";
  if (hex(0, 3) === "ffd8ff") return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand.startsWith("qt")) return "video/quicktime";
    if (/^(heic|heix|mif1|msf1|avif)/.test(brand)) return null; // not supported
    return "video/mp4";
  }
  if (hex(0, 4) === "1a45dfa3") return "video/webm";
  return null;
}

const ALLOWED: Record<UploadKind, string[]> = {
  image: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  document: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
};

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

export type StoredUpload = {
  fileId: string;
  key: string;
  url: string | null;
  thumbUrl: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
};

function newKey(purpose: string, ext: string) {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const safePurpose = purpose.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "file";
  return `${safePurpose}/${ym}/${randomBytes(12).toString("hex")}.${ext}`;
}

async function sizeLimitMB(kind: UploadKind): Promise<number> {
  if (kind === "image") return getSetting("listing.maxImageSizeMB");
  if (kind === "video") return getSetting("listing.maxVideoSizeMB");
  return getSetting("listing.maxDocumentSizeMB");
}

/**
 * Validates and stores an upload. Images are re-encoded to WebP (which strips EXIF/GPS metadata
 * and neutralises polyglot files) and get a "_t.webp" thumbnail; PDFs and videos are stored as-is
 * after their content type is verified.
 */
export async function storeUpload(input: {
  data: Buffer;
  kind: UploadKind;
  ownerId: string;
  purpose: string;
  originalName?: string | null;
  isPublic?: boolean;
}): Promise<StoredUpload> {
  const { data, kind, ownerId, purpose } = input;
  const isPublic = !!input.isPublic;
  if (!data.length) throw new AppError("VALIDATION", "The file is empty.");

  const maxMB = await sizeLimitMB(kind);
  if (data.length > maxMB * MB) throw new AppError("VALIDATION", `File is too large. The limit is ${maxMB} MB.`);

  const sniffed = sniffMime(data);
  if (!sniffed || !ALLOWED[kind].includes(sniffed)) {
    const want = kind === "document" ? "a PDF, JPG, PNG or WebP file" : kind === "video" ? "an MP4, WebM or MOV video" : "a JPG, PNG or WebP image";
    throw new AppError("VALIDATION", `Unsupported file. Please upload ${want}.`);
  }

  let stored: Buffer;
  let mime: string;
  let key: string;
  let width: number | null = null;
  let height: number | null = null;
  let thumbKey: string | null = null;

  if (sniffed.startsWith("image/")) {
    let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      meta = await sharp(data).metadata();
    } catch {
      throw new AppError("VALIDATION", "The image could not be read. Please upload a different file.");
    }
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (kind === "image" && (w < MIN_IMAGE_SIDE || h < MIN_IMAGE_SIDE))
      throw new AppError("VALIDATION", `Image is too small. Use a photo at least ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} pixels.`);
    try {
      const base = sharp(data, { failOn: "error" }).rotate();
      const out = await base
        .clone()
        .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      stored = out.data;
      width = out.info.width;
      height = out.info.height;
      mime = "image/webp";
      key = newKey(purpose, "webp");
      if (kind === "image") {
        const thumb = await base.clone().resize(THUMB.width, THUMB.height, { fit: "cover" }).webp({ quality: 70 }).toBuffer();
        thumbKey = key.replace(/\.webp$/, "_t.webp");
        await storage.put(thumbKey, thumb);
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("VALIDATION", "The image could not be processed. Please upload a different file.");
    }
  } else if (sniffed === "application/pdf") {
    stored = data;
    mime = sniffed;
    key = newKey(purpose, "pdf");
  } else {
    stored = data;
    mime = sniffed;
    key = newKey(purpose, VIDEO_EXT[sniffed] ?? "mp4");
  }

  await storage.put(key, stored);
  const file = await prisma.storedFile.create({
    data: {
      ownerId,
      key,
      mime,
      size: stored.length,
      width,
      height,
      sha256: sha256(stored),
      visibility: isPublic ? "PUBLIC" : "PRIVATE",
      originalName: input.originalName?.slice(0, 200) ?? null,
      purpose,
    },
  });

  return {
    fileId: file.id,
    key,
    url: isPublic ? `/media/${key}` : null,
    thumbUrl: isPublic && thumbKey ? `/media/${thumbKey}` : null,
    mime,
    size: stored.length,
    width,
    height,
  };
}
