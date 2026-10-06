"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Rotate3D, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Img = { url: string; thumbUrl: string | null; alt: string | null; kind: "PHOTO" | "SPIN360" | "VIDEO" };

export function ImageGallery({ images, title }: { images: Img[]; title: string }) {
  const photos = images.filter((i) => i.kind === "PHOTO");
  const spin = images.filter((i) => i.kind === "SPIN360");
  const videos = images.filter((i) => i.kind === "VIDEO");
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<"photos" | "spin" | "video">("photos");
  const touch = useRef<number | null>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setIdx((i) => (i + d + n) % n), [n]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  if (!n) return <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-slate-100 text-slate-400">No photos yet</div>;
  const cur = photos[idx];
  return (
    <div>
      <div
        className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        {mode === "photos" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.url} alt={cur.alt ?? `${title} photo ${idx + 1}`} className="h-full w-full object-cover" fetchPriority="high" />
        )}
        {mode === "spin" && <Spin360 frames={spin.map((s) => s.url)} />}
        {mode === "video" && videos[0] && <video src={videos[0].url} controls className="h-full w-full bg-black object-contain" preload="metadata" />}
        {mode === "photos" && n > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-900 opacity-0 shadow transition group-hover:opacity-100 max-sm:opacity-100"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-900 opacity-0 shadow transition group-hover:opacity-100 max-sm:opacity-100"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
        <div className="absolute bottom-3 left-3 flex gap-2">
          {spin.length > 1 && (
            <button onClick={() => setMode(mode === "spin" ? "photos" : "spin")} className="inline-flex items-center gap-1 rounded-md bg-ink-900/80 px-2.5 py-1.5 text-[12px] font-bold text-white backdrop-blur"><Rotate3D className="h-4 w-4" />{mode === "spin" ? "Photos" : "360° view"}</button>
          )}
          {videos.length > 0 && <button onClick={() => setMode(mode === "video" ? "photos" : "video")} className="rounded-md bg-ink-900/80 px-2.5 py-1.5 text-[12px] font-bold text-white backdrop-blur">{mode === "video" ? "Photos" : "▶ Video"}</button>}
        </div>
        {mode === "photos" && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="num rounded-md bg-ink-900/80 px-2 py-1 text-[12px] font-semibold text-white">{idx + 1} / {n}</span>
            <button onClick={() => setFull(true)} aria-label="Full screen" className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900/80 text-white"><Expand className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {n > 1 && (
        <div className="scroll-rail mt-3 flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button key={p.url + i} onClick={() => { setIdx(i); setMode("photos"); }} aria-label={`Photo ${i + 1}`} className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition sm:h-[70px] sm:w-[104px]", i === idx && mode === "photos" ? "ring-ignite-500" : "ring-transparent opacity-75 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl ?? p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {full && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95" role="dialog" aria-modal>
          <button onClick={() => setFull(false)} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"><X className="h-6 w-6" /></button>
          <button onClick={() => go(-1)} aria-label="Previous" className="absolute left-4 rounded-full bg-white/10 p-3 text-white"><ChevronLeft className="h-6 w-6" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.url} alt={cur.alt ?? title} className="max-h-[90vh] max-w-[92vw] object-contain" />
          <button onClick={() => go(1)} aria-label="Next" className="absolute right-4 rounded-full bg-white/10 p-3 text-white"><ChevronRight className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  );
}

function Spin360({ frames }: { frames: string[] }) {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <div
      className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={(e) => (start.current = e.clientX)}
      onPointerUp={() => (start.current = null)}
      onPointerLeave={() => (start.current = null)}
      onPointerMove={(e) => {
        if (start.current == null) return;
        const d = e.clientX - start.current;
        if (Math.abs(d) > 12) {
          setI((x) => (x + (d > 0 ? -1 : 1) + frames.length) % frames.length);
          start.current = e.clientX;
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frames[i]} alt={`360° frame ${i + 1}`} draggable={false} className="h-full w-full object-cover" />
      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink-900/70 px-3 py-1 text-[12px] font-semibold text-white">Drag to rotate</div>
    </div>
  );
}
