"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, GripVertical, ImagePlus, Loader2, Rotate3D, Send, Star, Trash2, Video } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR, humanize } from "@/lib/format";
import { CONDITIONS, FUELS, INSURANCE, RC_STATUS, SERVICE_HISTORY, TRANSMISSIONS } from "@/lib/validation";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea, Toggle } from "../ui/form";
import { useToast } from "../ui/toast";
import { DocumentUploader, uploadFile } from "./document-uploader";

type Opt = { id: string; name: string; slug?: string };
type Variant = { id: string; name: string; fuel: string; transmission: string };
type MediaItem = { key: string; fileId: string | null; url: string; kind: "PHOTO" | "SPIN360" | "VIDEO"; uploading?: number; error?: string };
type Doc = { fileId: string; name?: string | null } | null;

export type VehicleFormInitial = Record<string, unknown> & {
  id?: string;
  media?: { fileId: string; url: string; kind: "PHOTO" | "SPIN360" | "VIDEO" }[];
  documents?: { type: string; fileId: string; name?: string | null }[];
};

const toLocal = (d: unknown) => {
  if (!d) return "";
  const dt = new Date(d as string);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
};

const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);

export function VehicleForm({ initial, makes, states, maxImages, verified, editable = true, status }: { initial?: VehicleFormInitial; makes: Opt[]; states: Opt[]; maxImages: number; verified: boolean; editable?: boolean; status?: string }) {
  const canSubmit = !status || status === "DRAFT" || status === "REJECTED";
  const router = useRouter();
  const { push } = useToast();
  const i = initial ?? {};
  const s = (k: string, d = "") => (i[k] == null ? d : String(i[k]));
  const [f, setF] = useState<Record<string, string>>({
    makeId: s("makeId"),
    modelId: s("modelId"),
    variantId: s("variantId"),
    variantName: s("variantName"),
    year: s("year", String(new Date().getFullYear() - 3)),
    registrationYear: s("registrationYear", String(new Date().getFullYear() - 3)),
    registrationNumber: s("registrationNumber"),
    vin: s("vin"),
    engineNumber: s("engineNumber"),
    fuel: s("fuel", "PETROL"),
    transmission: s("transmission", "MANUAL"),
    kmDriven: s("kmDriven"),
    color: s("color"),
    owners: s("owners", "1"),
    insuranceStatus: s("insuranceStatus", "COMPREHENSIVE"),
    insuranceExpiry: i.insuranceExpiry ? String(i.insuranceExpiry).slice(0, 10) : "",
    rcStatus: s("rcStatus", "ORIGINAL"),
    description: s("description"),
    stateId: s("stateId", states[0]?.id ?? ""),
    districtId: s("districtId"),
    cityId: s("cityId"),
    pincode: s("pincode"),
    overallCondition: s("overallCondition", "GOOD"),
    engineCondition: s("engineCondition", "GOOD"),
    gearboxCondition: s("gearboxCondition", "GOOD"),
    tyreCondition: s("tyreCondition", "GOOD"),
    batteryCondition: s("batteryCondition", "GOOD"),
    serviceHistory: s("serviceHistory", "FULL"),
    expectedPrice: s("expectedPrice"),
    reservePrice: s("reservePrice"),
    minimumBid: s("minimumBid"),
    buyNowPrice: s("buyNowPrice"),
    sellerMargin: s("sellerMargin"),
    auctionStartAt: toLocal(i.auctionStartAt),
    auctionEndAt: toLocal(i.auctionEndAt),
    bidIncrement: s("bidIncrement"),
    autoExtendSeconds: s("autoExtendSeconds"),
  });
  const [b, setB] = useState({
    accidentHistory: !!i.accidentHistory,
    floodDamage: !!i.floodDamage,
    buyNowEnabled: !!i.buyNowEnabled,
    offersEnabled: i.offersEnabled === undefined ? true : !!i.offersEnabled,
    auctionEnabled: i.auctionEnabled === undefined ? true : !!i.auctionEnabled,
    reserveVisible: !!i.reserveVisible,
  });
  const [models, setModels] = useState<Opt[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [cities, setCities] = useState<(Opt & { pincode?: string | null })[]>([]);
  const [media, setMedia] = useState<MediaItem[]>((i.media ?? []).map((m, idx) => ({ ...m, key: `${m.fileId}-${idx}` })));
  const [docs, setDocs] = useState<Record<string, Doc>>(Object.fromEntries((i.documents ?? []).map((d) => [d.type, { fileId: d.fileId, name: d.name }])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mediaKind, setMediaKind] = useState<"PHOTO" | "SPIN360" | "VIDEO">("PHOTO");
  const [dragKey, setDragKey] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!f.makeId) return setModels([]);
    api<{ items: Opt[] }>(`/api/catalog/models?makeId=${f.makeId}`).then(({ data }) => setModels(data?.items ?? []));
  }, [f.makeId]);
  useEffect(() => {
    if (!f.modelId) return setVariants([]);
    api<{ items: Variant[] }>(`/api/catalog/variants?modelId=${f.modelId}`).then(({ data }) => setVariants(data?.items ?? []));
  }, [f.modelId]);
  useEffect(() => {
    if (!f.stateId) return;
    api<{ items: Opt[] }>(`/api/locations/districts?stateId=${f.stateId}`).then(({ data }) => setDistricts(data?.items ?? []));
  }, [f.stateId]);
  useEffect(() => {
    if (!f.districtId) return setCities([]);
    api<{ items: (Opt & { pincode: string | null })[] }>(`/api/locations/cities?districtId=${f.districtId}`).then(({ data }) => setCities(data?.items ?? []));
  }, [f.districtId]);

  const photos = media.filter((m) => m.kind === "PHOTO");
  const shown = media.filter((m) => m.kind === mediaKind);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const isVideo = mediaKind === "VIDEO";
    if (!isVideo && photos.length + list.length > maxImages && mediaKind === "PHOTO") push({ tone: "error", title: `You can upload up to ${maxImages} photos.` });
    const accepted = mediaKind === "PHOTO" ? list.slice(0, Math.max(0, maxImages - photos.length)) : list;
    for (const file of accepted) {
      const key = `${file.name}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      setMedia((m) => [...m, { key, fileId: null, url: preview, kind: mediaKind, uploading: 0 }]);
      uploadFile(file, "vehicle-image", isVideo ? "video" : "image", (p) => setMedia((m) => m.map((x) => (x.key === key ? { ...x, uploading: p } : x))))
        .then((up) => setMedia((m) => m.map((x) => (x.key === key ? { ...x, fileId: up.fileId, url: up.thumbUrl ?? up.url ?? preview, uploading: undefined } : x))))
        .catch((e: Error) => {
          setMedia((m) => m.filter((x) => x.key !== key));
          push({ tone: "error", title: `${file.name}: ${e.message}` });
        });
    }
  }

  function move(key: string, dir: -1 | 1) {
    setMedia((m) => {
      const idx = m.findIndex((x) => x.key === key);
      const kind = m[idx].kind;
      let j = idx + dir;
      while (j >= 0 && j < m.length && m[j].kind !== kind) j += dir;
      if (j < 0 || j >= m.length) return m;
      const copy = [...m];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  }
  function dropOn(target: string) {
    if (!dragKey || dragKey === target) return;
    setMedia((m) => {
      const from = m.findIndex((x) => x.key === dragKey);
      const to = m.findIndex((x) => x.key === target);
      const copy = [...m];
      const [it] = copy.splice(from, 1);
      copy.splice(to, 0, it);
      return copy;
    });
    setDragKey(null);
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d]/g, "")));
  const payload = useMemo(
    () => ({
      ...f,
      variantId: f.variantId || null,
      cityId: f.cityId || null,
      year: Number(f.year),
      registrationYear: Number(f.registrationYear),
      kmDriven: num(f.kmDriven) ?? "",
      owners: Number(f.owners),
      insuranceExpiry: f.insuranceExpiry || null,
      expectedPrice: num(f.expectedPrice) ?? "",
      reservePrice: b.auctionEnabled ? num(f.reservePrice) : null,
      minimumBid: b.auctionEnabled ? num(f.minimumBid) : null,
      buyNowPrice: b.buyNowEnabled ? num(f.buyNowPrice) : null,
      sellerMargin: num(f.sellerMargin),
      auctionStartAt: b.auctionEnabled && f.auctionStartAt ? new Date(f.auctionStartAt).toISOString() : null,
      auctionEndAt: b.auctionEnabled && f.auctionEndAt ? new Date(f.auctionEndAt).toISOString() : null,
      bidIncrement: b.auctionEnabled ? num(f.bidIncrement) : null,
      autoExtendSeconds: b.auctionEnabled ? num(f.autoExtendSeconds) : null,
      ...b,
    }),
    [f, b],
  );

  async function save(submit: boolean) {
    if (media.some((m) => m.uploading !== undefined)) return push({ tone: "error", title: "Please wait for uploads to finish." });
    setErrors({});
    setBusy(submit ? "submit" : "draft");
    let id = i.id as string | undefined;
    const res = id ? await api<{ id: string }>(`/api/vehicles/${id}`, { method: "PUT", body: payload }) : await api<{ id: string }>("/api/vehicles", { body: payload });
    if (res.error) {
      setBusy(null);
      setErrors(res.error.details?.fields ?? {});
      push({ tone: "error", title: res.error.message });
      const first = Object.keys(res.error.details?.fields ?? {})[0];
      if (first) document.querySelector(`[name="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    id = res.data!.id;
    const mediaRes = await api(`/api/vehicles/${id}/media`, {
      method: "PUT",
      body: {
        images: media.filter((m) => m.fileId).map((m) => ({ fileId: m.fileId, kind: m.kind })),
        documents: Object.entries(docs).filter(([, d]) => d).map(([type, d]) => ({ type, fileId: d!.fileId })),
      },
    });
    if (mediaRes.error) {
      setBusy(null);
      push({ tone: "error", title: mediaRes.error.message });
      if (!i.id) router.replace(`/dashboard/vehicles/${id}`);
      return;
    }
    if (submit) {
      const sub = await api<{ status: string }>(`/api/vehicles/${id}/submit`, { method: "POST" });
      setBusy(null);
      if (sub.error) {
        push({ tone: "error", title: sub.error.message, body: "Your changes were saved as a draft." });
        router.replace(`/dashboard/vehicles/${id}`);
        router.refresh();
        return;
      }
      push({ tone: "success", title: sub.data!.status === "PUBLISHED" ? "Listing published" : "Submitted for approval", body: "We'll notify you once it's reviewed." });
      router.push("/dashboard/vehicles");
      router.refresh();
      return;
    }
    setBusy(null);
    push({ tone: "success", title: "Saved" });
    if (!i.id) router.replace(`/dashboard/vehicles/${id}`);
    router.refresh();
  }

  const E = (k: string) => errors[k];
  const sectionCls = "rounded-[var(--radius-card)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6";
  const h = (t: string, sub?: string) => (
    <div className="mb-5">
      <h2 className="font-sans text-[17px] font-bold text-ink-900">{t}</h2>
      {sub && <p className="text-[13px] text-slate-500">{sub}</p>}
    </div>
  );
  const condSelect = (k: string, label: string) => (
    <Field label={label} error={E(k)}>
      <Select name={k} value={f[k]} onChange={set(k)}>{CONDITIONS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
    </Field>
  );
  const money = (k: string, label: string, hint?: string, required?: boolean) => (
    <Field label={label} error={E(k)} hint={hint} required={required}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
        <Input name={k} inputMode="numeric" className="num pl-7" value={f[k] ? Number(f[k].replace(/[^\d]/g, "")).toLocaleString("en-IN") : ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value.replace(/[^\d]/g, "") }))} disabled={!editable} />
      </div>
    </Field>
  );

  return (
    <div className="space-y-5 pb-24">
      <fieldset disabled={!editable} className="space-y-5">
        <section className={sectionCls} id="basic">
          {h("Basic details", "Make, model and registration")}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Make" error={E("makeId")} required>
              <Select name="makeId" value={f.makeId} onChange={(e) => setF((x) => ({ ...x, makeId: e.target.value, modelId: "", variantId: "" }))}><option value="">Select make</option>{makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            </Field>
            <Field label="Model" error={E("modelId")} required>
              <Select name="modelId" value={f.modelId} onChange={(e) => setF((x) => ({ ...x, modelId: e.target.value, variantId: "" }))} disabled={!f.makeId}><option value="">Select model</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            </Field>
            <Field label="Variant" error={E("variantId")} hint={variants.length ? undefined : "Type the variant if not listed"}>
              {variants.length ? (
                <Select name="variantId" value={f.variantId} onChange={(e) => { const v = variants.find((x) => x.id === e.target.value); setF((x) => ({ ...x, variantId: e.target.value, ...(v ? { fuel: v.fuel, transmission: v.transmission, variantName: v.name } : {}) })); }}>
                  <option value="">Select variant</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.name} · {humanize(v.fuel)} · {humanize(v.transmission)}</option>)}
                </Select>
              ) : <Input name="variantName" value={f.variantName} onChange={set("variantName")} placeholder="e.g. ZXI Plus" />}
            </Field>
            <Field label="Manufacture year" error={E("year")} required><Select name="year" value={f.year} onChange={set("year")}>{YEARS.map((y) => <option key={y}>{y}</option>)}</Select></Field>
            <Field label="Registration year" error={E("registrationYear")} required><Select name="registrationYear" value={f.registrationYear} onChange={set("registrationYear")}>{YEARS.map((y) => <option key={y}>{y}</option>)}</Select></Field>
            <Field label="Registration number" error={E("registrationNumber")} hint="Shown masked to buyers"><Input name="registrationNumber" value={f.registrationNumber} onChange={(e) => setF((x) => ({ ...x, registrationNumber: e.target.value.toUpperCase() }))} placeholder="KL07CX1234" /></Field>
            <Field label="VIN / chassis number" error={E("vin")} hint="Private — disclosed on sale agreement"><Input name="vin" value={f.vin} onChange={(e) => setF((x) => ({ ...x, vin: e.target.value.toUpperCase() }))} maxLength={17} /></Field>
            <Field label="Engine number" error={E("engineNumber")}><Input name="engineNumber" value={f.engineNumber} onChange={set("engineNumber")} /></Field>
            <Field label="Fuel" error={E("fuel")} required><Select name="fuel" value={f.fuel} onChange={set("fuel")}>{FUELS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
            <Field label="Transmission" error={E("transmission")} required><Select name="transmission" value={f.transmission} onChange={set("transmission")}>{TRANSMISSIONS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
            <Field label="Kilometres driven" error={E("kmDriven")} required><Input name="kmDriven" inputMode="numeric" value={f.kmDriven} onChange={(e) => setF((x) => ({ ...x, kmDriven: e.target.value.replace(/[^\d]/g, "") }))} /></Field>
            <Field label="Colour" error={E("color")} required><Input name="color" value={f.color} onChange={set("color")} placeholder="Pearl White" /></Field>
            <Field label="Number of owners" error={E("owners")} required><Select name="owners" value={f.owners} onChange={set("owners")}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? "+" : ""}</option>)}</Select></Field>
            <Field label="Insurance" error={E("insuranceStatus")} required><Select name="insuranceStatus" value={f.insuranceStatus} onChange={set("insuranceStatus")}>{INSURANCE.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
            <Field label="Insurance expiry" error={E("insuranceExpiry")}><Input name="insuranceExpiry" type="date" value={f.insuranceExpiry} onChange={set("insuranceExpiry")} /></Field>
            <Field label="RC status" error={E("rcStatus")} required><Select name="rcStatus" value={f.rcStatus} onChange={set("rcStatus")}>{RC_STATUS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
          </div>
          <Field label="Description" error={E("description")} className="mt-4" hint="Highlight service history, recent work, accessories."><Textarea name="description" value={f.description} onChange={set("description")} rows={4} maxLength={4000} /></Field>
        </section>

        <section className={sectionCls} id="location">
          {h("Location", "Where the vehicle can be inspected and collected")}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="State" error={E("stateId")} required><Select name="stateId" value={f.stateId} onChange={(e) => setF((x) => ({ ...x, stateId: e.target.value, districtId: "", cityId: "" }))}>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="District" error={E("districtId")} required><Select name="districtId" value={f.districtId} onChange={(e) => setF((x) => ({ ...x, districtId: e.target.value, cityId: "" }))}><option value="">Select district</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="City" error={E("cityId")}><Select name="cityId" value={f.cityId} onChange={(e) => { const c = cities.find((x) => x.id === e.target.value); setF((x) => ({ ...x, cityId: e.target.value, pincode: x.pincode || c?.pincode || "" })); }}><option value="">Select city</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Pincode" error={E("pincode")} required><Input name="pincode" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set("pincode")} /></Field>
          </div>
        </section>

        <section className={sectionCls} id="condition">
          {h("Condition", "Be accurate — mismatches can lead to disputes and penalties")}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {condSelect("overallCondition", "Overall condition")}
            {condSelect("engineCondition", "Engine")}
            {condSelect("gearboxCondition", "Gearbox")}
            {condSelect("tyreCondition", "Tyres")}
            {condSelect("batteryCondition", "Battery")}
            <Field label="Service history" error={E("serviceHistory")}><Select name="serviceHistory" value={f.serviceHistory} onChange={set("serviceHistory")}>{SERVICE_HISTORY.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle checked={b.accidentHistory} onChange={(v) => setB((x) => ({ ...x, accidentHistory: v }))} label="Accident history" description="Any structural or major body repair" />
            <Toggle checked={b.floodDamage} onChange={(v) => setB((x) => ({ ...x, floodDamage: v }))} label="Flood damage" description="Water ingress above floor level" />
          </div>
        </section>

        <section className={sectionCls} id="pricing">
          {h("Pricing & sale options")}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {money("expectedPrice", "Expected price", "Shown as asking price", true)}
            {money("sellerMargin", "Your margin (private)", "Never shown to buyers")}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle checked={b.buyNowEnabled} onChange={(v) => setB((x) => ({ ...x, buyNowEnabled: v }))} label="Enable Buy Now" description="Verified buyers can purchase instantly at a fixed price" />
            <Toggle checked={b.offersEnabled} onChange={(v) => setB((x) => ({ ...x, offersEnabled: v }))} label="Accept offers" description="Buyers can make offers; you can accept, reject or counter" />
          </div>
          {b.buyNowEnabled && <div className="mt-4 grid gap-4 sm:grid-cols-3">{money("buyNowPrice", "Buy Now price", undefined, true)}</div>}
        </section>

        <section className={sectionCls} id="auction">
          {h("Auction", "Run a time-bound auction once the listing is approved")}
          <Toggle checked={b.auctionEnabled} onChange={(v) => setB((x) => ({ ...x, auctionEnabled: v }))} label="Enable auction" description="Verified dealers bid in real time; highest bid above reserve wins" />
          {b.auctionEnabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {money("minimumBid", "Starting / minimum bid", "Defaults to 80% of expected price")}
              {money("reservePrice", "Reserve price", "Lowest price you'll accept")}
              {money("bidIncrement", "Bid increment", "Leave blank for platform default")}
              <Field label="Auction start" error={E("auctionStartAt")} hint="Blank = start on approval"><Input name="auctionStartAt" type="datetime-local" value={f.auctionStartAt} onChange={set("auctionStartAt")} /></Field>
              <Field label="Auction end" error={E("auctionEndAt")} hint="Blank = platform default duration"><Input name="auctionEndAt" type="datetime-local" value={f.auctionEndAt} onChange={set("auctionEndAt")} /></Field>
              <Field label="Auto-extension (seconds)" error={E("autoExtendSeconds")} hint="Anti-sniping extension; blank = default"><Input name="autoExtendSeconds" inputMode="numeric" value={f.autoExtendSeconds} onChange={set("autoExtendSeconds")} placeholder="120" /></Field>
              <div className="sm:col-span-2 lg:col-span-3"><Toggle checked={b.reserveVisible} onChange={(v) => setB((x) => ({ ...x, reserveVisible: v }))} label="Show reserve price to bidders" description="Otherwise bidders only see whether the reserve is met" /></div>
            </div>
          )}
        </section>

        <section className={sectionCls} id="media">
          {h("Photos, 360° & video", `Drag to reorder — the first photo is the cover. Up to ${maxImages} photos; images are optimised automatically.`)}
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-1">
            {([["PHOTO", "Photos", ImagePlus], ["SPIN360", "360° frames", Rotate3D], ["VIDEO", "Video", Video]] as const).map(([k, l, I]) => (
              <button key={k} type="button" onClick={() => setMediaKind(k)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold", mediaKind === k ? "bg-ink-900 text-white" : "text-slate-600")}>
                <I className="h-4 w-4" />{l} <span className="num opacity-70">{media.filter((m) => m.kind === k).length}</span>
              </button>
            ))}
          </div>
          <div
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
            onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {shown.map((m, idx) => (
              <div
                key={m.key}
                draggable={m.uploading === undefined}
                onDragStart={() => setDragKey(m.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (!e.dataTransfer.files.length) dropOn(m.key); }}
                className={cn("group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100", dragKey === m.key && "opacity-50")}
              >
                {m.kind === "VIDEO" ? <div className="flex h-full items-center justify-center bg-ink-900 text-white"><Video className="h-8 w-8" /></div> : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                {m.uploading !== undefined && <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink-900/60 text-white"><Loader2 className="h-6 w-6 animate-spin" /><span className="num mt-1 text-[12px]">{m.uploading}%</span></div>}
                {idx === 0 && m.kind === "PHOTO" && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-ignite-500 px-1.5 py-0.5 text-[10.5px] font-bold text-white"><Star className="h-3 w-3" />Cover</span>}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <span className="flex gap-1">
                    <button type="button" onClick={() => move(m.key, -1)} className="rounded bg-white/90 p-1" aria-label="Move left"><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(m.key, 1)} className="rounded bg-white/90 p-1" aria-label="Move right"><ArrowRight className="h-3.5 w-3.5" /></button>
                  </span>
                  <GripVertical className="hidden h-4 w-4 text-white sm:block" />
                  <button type="button" onClick={() => setMedia((x) => x.filter((y) => y.key !== m.key))} className="rounded bg-white/90 p-1 text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-ignite-500 hover:text-ignite-600">
              <ImagePlus className="h-7 w-7" />
              <span className="text-[13px] font-semibold">{mediaKind === "VIDEO" ? "Add video" : "Add photos"}</span>
              <span className="text-[11px]">or drop files here</span>
            </button>
          </div>
          <input ref={fileInput} type="file" multiple={mediaKind !== "VIDEO"} accept={mediaKind === "VIDEO" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,image/avif,image/heic"} className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          {mediaKind === "SPIN360" && <p className="mt-2 text-[12.5px] text-slate-500">Upload 12–36 frames taken while walking around the car, in order. Buyers drag to rotate.</p>}
        </section>

        <section className={sectionCls} id="documents">
          {h("Vehicle documents", "Stored privately; shared with the buyer after payment")}
          <div className="grid gap-4 sm:grid-cols-2">
            {([["RC", "RC (registration certificate)"], ["INSURANCE", "Insurance policy"], ["SERVICE_RECORD", "Service records"], ["INSPECTION_REPORT", "Inspection report (if any)"]] as const).map(([t, l]) => (
              <DocumentUploader key={t} label={l} purpose="vehicle-doc" value={docs[t] ?? null} onChange={(v) => setDocs((d) => ({ ...d, [t]: v }))} />
            ))}
          </div>
        </section>
      </fieldset>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="hidden text-[13px] text-slate-500 sm:block">
              {f.expectedPrice ? <>Asking <b className="num text-ink-900">{formatINR(Number(f.expectedPrice))}</b> · </> : null}{photos.length} photo{photos.length === 1 ? "" : "s"}
              {!verified && canSubmit && <span className="ml-2 text-amber-700">· Submission unlocks after KYC verification</span>}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant={canSubmit ? "outline" : "primary"} size="lg" className="flex-1 sm:flex-none" onClick={() => save(false)} loading={busy === "draft"} disabled={!!busy}>{canSubmit ? "Save draft" : "Save changes"}</Button>
              {canSubmit && <Button size="lg" className="flex-1 sm:flex-none" onClick={() => save(true)} loading={busy === "submit"} disabled={!!busy || !verified}><Send className="h-4 w-4" />Submit for approval</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
