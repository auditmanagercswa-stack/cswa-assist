"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type Uploaded = { fileId: string; url: string | null; thumbUrl: string | null; mime: string; name: string; size: number };

/** Uploads one file with progress; resolves with the stored file descriptor or an error message. */
export function uploadFile(file: File, purpose: string, kind: "image" | "video" | "document", onProgress?: (p: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    form.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve({ ...body, name: file.name });
        else reject(new Error(body?.error?.message ?? "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

/** Single-document drop zone (KYC, vehicle docs, order docs). Files are validated again on the server. */
export function DocumentUploader({ label, purpose, value, onChange, accept = "application/pdf,image/jpeg,image/png,image/webp", hint, required }: { label: string; purpose: string; value: { fileId: string; name?: string | null } | null; onChange: (v: { fileId: string; name: string } | null) => void; accept?: string; hint?: string; required?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function handle(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setProgress(0);
    try {
      const up = await uploadFile(file, purpose, "document", setProgress);
      onChange({ fileId: up.fileId, name: file.name });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setProgress(null);
    }
  }
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-slate-700">{label}{required && <span className="text-ignite-600"> *</span>}</div>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-verified-50 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-verified-600"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate">{value.name ?? "Uploaded"}</span></span>
          <button type="button" onClick={() => onChange(null)} className="text-slate-500 hover:text-red-600" aria-label={`Remove ${label}`}><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
          className={cn("flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-3 py-3 text-[13px] transition", drag ? "border-ignite-500 bg-ignite-50" : "border-slate-300 bg-white hover:border-slate-400", err && "border-red-300")}
        >
          {progress !== null ? <Loader2 className="h-5 w-5 animate-spin text-ignite-500" /> : <UploadCloud className="h-5 w-5 text-slate-400" />}
          <span className="text-slate-600">{progress !== null ? `Uploading… ${progress}%` : <>Drop file or <b className="text-ink-900">browse</b> <span className="text-slate-400">· PDF/JPG/PNG{hint ? ` · ${hint}` : ""}</span></>}</span>
          <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-red-600">{err}</p>}
    </div>
  );
}

export function FileChip({ name }: { name: string }) {
  return <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-600"><FileText className="h-3.5 w-3.5" />{name}</span>;
}
